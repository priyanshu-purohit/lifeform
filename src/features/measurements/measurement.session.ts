// App-level control of a real SDK measurement. Lives outside any route so a session started
// in Setup keeps running in Explore, Understand and Create. Also owns the credit guard, which
// therefore protects the session on every screen, not just Setup.

import {
  applyCameraSettings,
  closeCamera,
  getCameraStream,
  loadCameraSettings,
  openCamera,
  subscribeCamera,
} from "./camera.source";
import { addCreditsUsed, estimateCredits, getSessionLimitMin } from "./credits";
import { measurementStore } from "./measurement.store";
import {
  destroySdkMeasurement,
  startSdkMeasurement,
  stopSdkMeasurement,
} from "./smartspectra.source";
import type { MeasurementSnapshot } from "./measurement.types";

/** Stop a live session that produces no pulse in this time, so a bad run can't burn credits. */
export const NO_PULSE_TIMEOUT_MS = 60_000;
const GUARD_CHECK_MS = 2_000;
/** The SDK locks exposure/white balance once Running; reapply the tuned values after this. */
const REAPPLY_DELAY_MS = 500;

let disposeGuard: (() => void) | null = null;

export function isSdkSessionOpen(s: MeasurementSnapshot = measurementStore.getSnapshot()): boolean {
  return s.session != null && s.session.endedAt == null && s.session.source === "presage-sdk";
}

function startGuard(sessionId: string) {
  disposeGuard?.();
  let lastPulseAt = Date.now();
  let lastPulse = measurementStore.getSnapshot().metrics.pulseRate.latest;
  let lastStatus = measurementStore.getSnapshot().status;
  let reapplyTimer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = measurementStore.subscribe(() => {
    const s = measurementStore.getSnapshot();
    if (s.metrics.pulseRate.latest !== lastPulse) {
      lastPulse = s.metrics.pulseRate.latest;
      if (lastPulse) lastPulseAt = Date.now();
    }
    if (s.status !== lastStatus) {
      lastStatus = s.status;
      if (s.status === "running") {
        if (reapplyTimer) clearTimeout(reapplyTimer);
        reapplyTimer = setTimeout(() => {
          void applyCameraSettings(loadCameraSettings() ?? { manual: true }).catch(() => {});
        }, REAPPLY_DELAY_MS);
      }
    }
  });

  /** Stops the session and says why. Each reason is a way a session could waste credits. */
  function halt(message: string) {
    dispose();
    void stopSdkMeasurement()
      .catch(() => {})
      .finally(() => {
        measurementStore.setError({ code: null, message, retryable: true });
      });
  }

  // A camera that disappears (phone app disconnected, cable pulled) leaves nothing to measure.
  const unsubscribeCamera = subscribeCamera(() => {
    if (!getCameraStream()) halt("The camera disconnected, so measuring stopped to save credits.");
  });

  const interval = setInterval(() => {
    const s = measurementStore.getSnapshot();
    if (s.session?.id !== sessionId || !isSdkSessionOpen(s)) {
      dispose();
      return;
    }
    const limitMin = getSessionLimitMin();
    if (Date.now() - s.session.startedAt >= limitMin * 60_000) {
      halt(`Measuring stopped at the ${limitMin} min limit set in Setup, to save credits.`);
    } else if (Date.now() - lastPulseAt > NO_PULSE_TIMEOUT_MS) {
      halt(`No pulse for ${NO_PULSE_TIMEOUT_MS / 1000} s, so measuring stopped to save credits.`);
    }
  }, GUARD_CHECK_MS);

  function dispose() {
    unsubscribe();
    unsubscribeCamera();
    clearInterval(interval);
    if (reapplyTimer) clearTimeout(reapplyTimer);
    if (disposeGuard === dispose) disposeGuard = null;
  }
  disposeGuard = dispose;
}

/** Adds the session's estimated cost to the local credit tally once it ends, however it ends. */
function tallyCredits(sessionId: string) {
  const unsubscribe = measurementStore.subscribe(() => {
    const session = measurementStore.getSnapshot().session;
    if (session?.id === sessionId && session.endedAt == null) return;
    unsubscribe();
    if (session?.id === sessionId && session.endedAt != null) {
      addCreditsUsed(estimateCredits(session.endedAt - session.startedAt));
    }
  });
}

/** Starts a real SDK measurement on the shared camera (opening it if needed). Uses credits. */
export async function startMeasurement(): Promise<void> {
  const stream = getCameraStream() ?? (await openCamera()).stream;
  await startSdkMeasurement(stream);
  const session = measurementStore.getSnapshot().session;
  if (session) {
    startGuard(session.id);
    tallyCredits(session.id);
  }
}

/** Stops the SDK session. The camera is closed by MeasurementLifecycle unless Setup is shown. */
export async function stopMeasurement(): Promise<void> {
  disposeGuard?.();
  await stopSdkMeasurement();
}

/** Ends everything: SDK torn down and camera off. Used on Welcome and when the window closes. */
export function releaseMeasurement(): void {
  disposeGuard?.();
  destroySdkMeasurement();
  closeCamera();
}
