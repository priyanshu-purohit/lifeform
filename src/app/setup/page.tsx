"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCameraConsent } from "@/features/privacy/consent";
import {
  NO_PULSE_TIMEOUT_MS,
  TARGET_FPS,
  applyCameraSettings,
  closeCamera,
  getCameraCaps,
  getCameraStream,
  openCamera,
  readTrackSettings,
  saveCameraSettings,
  startMeasurement,
  stopMeasurement,
  subscribeCamera,
  type CameraSettings,
  type MeasurementStatus,
  type MetricState,
} from "@/features/measurements";
import { useMeasurements } from "@/hooks/use-measurements";

// Camera test: does the laptop's built-in webcam work with the SmartSpectra SDK?
// Uses only real SDK data, read from the shared measurement layer. Nothing is recorded.
//
// Two stages so SDK credits are not wasted:
//   1. Camera check (free): open the webcam without the SDK and tune exposure/brightness
//      until the picture is bright enough AND the camera holds ~30 fps.
//   2. Measure (uses credits): start the SDK on the already-tuned stream.
//
// The camera and session belong to the app (features/measurements), not this page, so a
// measurement started here keeps running in Explore. The no-pulse credit guard lives there too.

const STATUS_LABELS: Record<MeasurementStatus, string> = {
  inactive: "Not started",
  idle: "Idle",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  error: "Error",
};

// Longer exposure = brighter picture but fewer frames per second; a built-in webcam's sweet
// spot has to be found by hand.
const MIN_OK_FPS = 28;

// Chromium's per-track frame counters (MediaStreamTrackVideoStats); not yet in the TS DOM lib.
type TrackWithStats = MediaStreamTrack & {
  stats?: { deliveredFrames: number; discardedFrames: number; totalFrames: number };
};
type FpsReading = { camera: number; dropped: number | null };

// SDK confidence is a percentage in [0, 100] (generated.d.ts: MeasurementWithConfidence).
function describeConfidence(c: number | null): string {
  if (c == null) return "no confidence reported";
  const pct = Math.round(c);
  if (pct < 30) return `${pct}% confidence (low, still settling)`;
  if (pct < 70) return `${pct}% confidence (fair)`;
  return `${pct}% confidence (good)`;
}

function describeMetric(m: MetricState, digits: number, unit: string, waiting: string): string {
  if (!m.latest || m.smoothed == null) return waiting;
  const parts = [
    `${m.smoothed.toFixed(digits)} ${unit}`,
    describeConfidence(m.latest.confidence),
    m.latest.validity === "unsettled" ? "not yet stable" : null,
    m.freshness === "stale" ? "stale" : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

// Validation codes from the SDK (constants.js), shown next to the hint for diagnosis.
const VALIDATION_NAMES: Record<number, string> = {
  5: "too dark",
  6: "too bright",
  10: "camera tuning",
  11: "frame rate too low",
  12: "too much motion",
};

function useCameraStream(): MediaStream | null {
  return useSyncExternalStore(subscribeCamera, getCameraStream, () => null);
}

export default function CameraSetup() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const measurement = useMeasurements();
  const { pulseRate, breathingRate, hrvRmssd } = measurement.metrics;
  const measuring = measurement.session != null && measurement.session.endedAt == null;
  const sdkMeasuring = measuring && measurement.session?.source === "presage-sdk";

  // The stream is shared app state, so it is still here when returning from Explore.
  const stream = useCameraStream();
  const cameraOn = stream != null;
  const caps = cameraOn ? getCameraCaps() : {};

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fps, setFps] = useState<FpsReading | null>(null);
  const [settings, setSettings] = useState<CameraSettings>({ manual: true });
  const [applied, setApplied] = useState("");

  // The camera may only be used after explicit consent on the Welcome page.
  useEffect(() => {
    if (!getCameraConsent()) router.replace("/");
  }, [router]);

  // Show the shared stream in the preview (also re-attaches when this route is shown again).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
  }, [stream]);

  // Live frame-rate readout from the track's own counters (or the preview's presentedFrames),
  // divided by real elapsed time. Also re-reads what the driver actually applied.
  useEffect(() => {
    const video = videoRef.current;
    const track = stream?.getVideoTracks()[0] as TrackWithStats | undefined;
    if (!video || !track) return;

    let presented = 0;
    let handle = 0;
    const useStats = track.stats != null;
    if (!useStats) {
      const onFrame: VideoFrameRequestCallback = (_now, meta) => {
        presented = meta.presentedFrames;
        handle = video.requestVideoFrameCallback(onFrame);
      };
      handle = video.requestVideoFrameCallback(onFrame);
    }
    const sample = () => ({
      t: performance.now(),
      total: useStats ? track.stats!.totalFrames : presented,
      discarded: useStats ? track.stats!.discardedFrames : 0,
    });
    let last = sample();
    const timer = setInterval(() => {
      const now = sample();
      const dt = (now.t - last.t) / 1000;
      if (dt > 0) {
        setFps({
          camera: (now.total - last.total) / dt,
          dropped: useStats ? now.discarded - last.discarded : null,
        });
      }
      last = now;
      const s = readTrackSettings(track);
      setApplied(
        [
          s.exposureMode && `exposure ${s.exposureMode}`,
          s.exposureTime != null && `${(s.exposureTime / 10).toFixed(1)} ms`,
          s.brightness != null && `brightness ${s.brightness}`,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    }, 1000);

    return () => {
      if (handle) video.cancelVideoFrameCallback(handle);
      clearInterval(timer);
      setFps(null);
    };
  }, [stream]);

  async function openCameraNow() {
    const { settings: initial } = await openCamera();
    setSettings(initial);
  }

  async function changeSettings(patch: Partial<CameraSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveCameraSettings(next);
    try {
      await applyCameraSettings(next);
    } catch (e) {
      setError(`Camera rejected setting: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function toggleCamera() {
    setBusy(true);
    setError("");
    try {
      if (cameraOn) closeCamera();
      else await openCameraNow();
    } catch (e) {
      closeCamera();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startMeasuring() {
    setBusy(true);
    setError("");
    try {
      if (!cameraOn) await openCameraNow();
      // SDK failures are also published to the shared store (measurement.error).
      await startMeasurement();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stopMeasuring() {
    setBusy(true);
    try {
      await stopMeasurement();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const guidance = measurement.guidance;
  const hint = guidance
    ? `[${guidance.code}${VALIDATION_NAMES[guidance.code] ? " " + VALIDATION_NAMES[guidance.code] : ""}] ${guidance.hint}`
    : "";
  const sdkError = measurement.error
    ? `SDK error${measurement.error.code != null ? ` ${measurement.error.code}` : ""}: ${measurement.error.message}`
    : "";

  const fpsOk = fps != null && fps.camera >= MIN_OK_FPS;
  const manualAvailable = !!caps.exposureMode?.includes("manual") && !!caps.exposureTime;

  return (
    <main className="flex flex-1 flex-col items-center gap-6 bg-black p-8 text-zinc-100">
      <Link href="/" className="self-start font-mono text-xs text-zinc-500 hover:text-zinc-300">
        ← LIFEFORM
      </Link>
      <h1 className="text-2xl font-semibold">Measurement setup</h1>
      <p className="max-w-xl text-center text-sm text-zinc-400">
        Step 1: check the camera (free, no SDK). Raise exposure/brightness until your face is
        clearly lit while fps stays at {MIN_OK_FPS}+. Step 2: measure (uses SDK credits). Video
        is processed on this device and never recorded. Not a medical device.
      </p>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="aspect-video w-full max-w-3xl -scale-x-100 rounded-lg bg-zinc-900"
      />

      <div className="flex gap-3">
        <button
          onClick={toggleCamera}
          disabled={busy || measuring}
          className="rounded-full border border-zinc-500 px-6 py-2 font-medium disabled:opacity-50"
        >
          {cameraOn ? "Close camera" : "1. Check camera (free)"}
        </button>
        <button
          onClick={measuring ? stopMeasuring : startMeasuring}
          disabled={busy || (!measuring && !fpsOk)}
          title={!fpsOk ? `Needs ${MIN_OK_FPS}+ fps in the camera check first` : undefined}
          className="rounded-full bg-zinc-100 px-6 py-2 font-medium text-black disabled:opacity-40"
        >
          {busy ? "…" : measuring ? "Stop measuring" : "2. Measure (uses credits)"}
        </button>
      </div>

      {sdkMeasuring && (
        <div className="flex max-w-xl flex-col items-center gap-2 text-center">
          <Link
            href="/explore"
            className="rounded-full bg-teal-200 px-6 py-2 font-medium text-zinc-950 hover:bg-teal-100"
          >
            3. Continue to Explore →
          </Link>
          <p className="text-xs text-zinc-500">
            Measuring carries on in Explore. It stops automatically if no pulse is read for{" "}
            {NO_PULSE_TIMEOUT_MS / 1000} s, and when you go back to the Welcome page.
          </p>
        </div>
      )}

      {cameraOn && (
        <div className="grid w-full max-w-xl gap-3 text-sm">
          {manualAvailable ? (
            <>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.manual}
                  onChange={(e) => void changeSettings({ manual: e.target.checked })}
                />
                Manual exposure (auto usually drops fps in indoor light)
              </label>
              {settings.manual && caps.exposureTime && (
                <label className="grid gap-1">
                  <span className="text-zinc-400">
                    Exposure: {((settings.exposureTime ?? 0) / 10).toFixed(1)} ms (frame budget at{" "}
                    {TARGET_FPS} fps is {(1000 / TARGET_FPS).toFixed(1)} ms)
                  </span>
                  <input
                    type="range"
                    min={caps.exposureTime.min}
                    max={Math.min(caps.exposureTime.max, 10_000 / TARGET_FPS)}
                    step={caps.exposureTime.step || 1}
                    value={settings.exposureTime ?? caps.exposureTime.min}
                    onChange={(e) => void changeSettings({ exposureTime: Number(e.target.value) })}
                  />
                </label>
              )}
            </>
          ) : (
            <p className="text-zinc-400">This camera does not offer manual exposure.</p>
          )}
          {caps.brightness ? (
            <label className="grid gap-1">
              <span className="text-zinc-400">Brightness: {settings.brightness ?? "default"}</span>
              <input
                type="range"
                min={caps.brightness.min}
                max={caps.brightness.max}
                step={caps.brightness.step || 1}
                value={settings.brightness ?? caps.brightness.min}
                onChange={(e) => void changeSettings({ brightness: Number(e.target.value) })}
              />
            </label>
          ) : (
            <p className="text-zinc-400">This camera does not offer a brightness control.</p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm">
        <dt className="text-zinc-500">SDK status</dt>
        <dd>{STATUS_LABELS[measurement.status]}</dd>
        <dt className="text-zinc-500">Camera</dt>
        <dd className={fps != null && !fpsOk ? "text-red-400" : undefined}>
          {fps != null ? `${fps.camera.toFixed(1)} fps` : "—"}
          {fps?.dropped ? ` (${fps.dropped} dropped)` : ""}
        </dd>
        <dt className="text-zinc-500">Applied</dt>
        <dd>{applied || "—"}</dd>
        <dt className="text-zinc-500">Guidance</dt>
        <dd>{hint || "—"}</dd>
        <dt className="text-zinc-500">Pulse</dt>
        <dd>{describeMetric(pulseRate, 0, "bpm", "—")}</dd>
        <dt className="text-zinc-500">Breathing</dt>
        <dd>{describeMetric(breathingRate, 1, "/min", "— (needs ~30 s)")}</dd>
        <dt className="text-zinc-500">HRV (RMSSD)</dt>
        <dd>{describeMetric(hrvRmssd, 0, "ms", "— (only when the SDK reports it)")}</dd>
      </dl>

      {(error || sdkError) && (
        <p className="max-w-xl text-center text-sm text-red-400">{error || sdkError}</p>
      )}
    </main>
  );
}
