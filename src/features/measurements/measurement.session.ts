// App-level control of a real SDK measurement. Lives outside any route so a session started
// in Setup keeps running in Explore, Understand and Create. Also owns the credit guard, which
// therefore protects the session on every screen, not just Setup.

import {
  applyCameraSettings,
  closeCamera,
  getCameraStream,
  loadCameraSettings,
  openCamera,
} from "./camera.source";
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

  const interval = setInterval(() => {
    const s = measurementStore.getSnapshot();
    if (s.session?.id !== sessionId || !isSdkSessionOpen(s)) {
      dispose();
      return;
    }
    if (Date.now() - lastPulseAt > NO_PULSE_TIMEOUT_MS) {
      dispose();
      void stopSdkMeasurement()
        .catch(() => {})
        .finally(() => {
          measurementStore.setError({
            code: null,
            message: `No pulse for ${NO_PULSE_TIMEOUT_MS / 1000} s, so measuring stopped to save credits.`,
            retryable: true,
          });
        });
    }
  }, GUARD_CHECK_MS);

  function dispose() {
    unsubscribe();
    clearInterval(interval);
    if (reapplyTimer) clearTimeout(reapplyTimer);
    if (disposeGuard === dispose) disposeGuard = null;
  }
  disposeGuard = dispose;
}

/** Starts a real SDK measurement on the shared camera (opening it if needed). Uses credits. */
export async function startMeasurement(): Promise<void> {
  const stream = getCameraStream() ?? (await openCamera()).stream;
  await startSdkMeasurement(stream);
  const session = measurementStore.getSnapshot().session;
  if (session) startGuard(session.id);
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
