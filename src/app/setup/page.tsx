"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCameraConsent } from "@/features/privacy/consent";
import {
  destroySdkMeasurement,
  startSdkMeasurement,
  stopSdkMeasurement,
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

const STATUS_LABELS: Record<MeasurementStatus, string> = {
  inactive: "Not started",
  idle: "Idle",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  error: "Error",
};

// The SDK needs a sustained ~25+ fps (target 30). Longer exposure = brighter picture but
// fewer frames per second; a built-in webcam's sweet spot has to be found by hand.
const TARGET_FPS = 30;
const MIN_OK_FPS = 28;
// Stop a live session that produces no pulse in this time, so a bad run can't burn credits.
const NO_PULSE_TIMEOUT_MS = 60_000;
const SETTINGS_KEY = "lifeform.cameraSettings";

type Range = { min: number; max: number; step?: number };
type CameraCaps = {
  exposureMode?: string[];
  exposureTime?: Range;
  brightness?: Range;
};
type CameraSettings = { manual: boolean; exposureTime?: number; brightness?: number };

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

function loadSettings(): CameraSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as CameraSettings) : null;
  } catch {
    return null;
  }
}

function saveSettings(s: CameraSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings just won't be remembered */
  }
}

function snap(value: number, r: Range): number {
  const step = r.step && r.step > 0 ? r.step : 1;
  const v = r.min + Math.round((value - r.min) / step) * step;
  return Math.min(r.max, Math.max(r.min, v));
}

async function applySettings(track: MediaStreamTrack, caps: CameraCaps, s: CameraSettings) {
  const set: Record<string, unknown> = {};
  if (caps.exposureMode?.includes("manual") && caps.exposureTime) {
    set.exposureMode = s.manual ? "manual" : "continuous";
    if (s.manual && s.exposureTime != null) set.exposureTime = snap(s.exposureTime, caps.exposureTime);
  }
  if (caps.brightness && s.brightness != null) set.brightness = snap(s.brightness, caps.brightness);
  if (Object.keys(set).length === 0) return;
  await track.applyConstraints({ advanced: [set as MediaTrackConstraintSet] });
}

function readSettings(track: MediaStreamTrack) {
  return track.getSettings() as MediaTrackSettings & {
    exposureMode?: string;
    exposureTime?: number;
    brightness?: number;
  };
}

function closeCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export default function CameraSetup() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capsRef = useRef<CameraCaps>({});
  const lastPulseRef = useRef(0);

  const measurement = useMeasurements();
  const { pulseRate, breathingRate, hrvRmssd } = measurement.metrics;
  const measuring = measurement.session != null && measurement.session.endedAt == null;

  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fps, setFps] = useState<FpsReading | null>(null);
  const [caps, setCaps] = useState<CameraCaps>({});
  const [settings, setSettings] = useState<CameraSettings>({ manual: true });
  const [applied, setApplied] = useState("");

  // The camera may only be used after explicit consent on the Welcome page.
  useEffect(() => {
    if (!getCameraConsent()) router.replace("/");
  }, [router]);

  useEffect(() => {
    return () => {
      // Leaving setup ends measuring for now, so credits are never spent unseen.
      destroySdkMeasurement();
      closeCamera(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  // Live frame-rate readout from the track's own counters (or the preview's presentedFrames),
  // divided by real elapsed time. Also re-reads what the driver actually applied.
  useEffect(() => {
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0] as TrackWithStats | undefined;
    if (!cameraOn || !video || !track) return;

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
      const s = readSettings(track);
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
  }, [cameraOn]);

  // The SDK locks exposure/white balance once Running; reapply our tuned values.
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (measurement.status !== "running" || !track) return;
    const timer = setTimeout(() => {
      void applySettings(track, capsRef.current, loadSettings() ?? { manual: true }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [measurement.status]);

  // Any new pulse sample counts as "pulse seen" for the credit guard below.
  useEffect(() => {
    if (pulseRate.latest) lastPulseRef.current = Date.now();
  }, [pulseRate.latest]);

  // Credit guard: stop a running session that has produced no pulse for too long.
  useEffect(() => {
    if (!measuring) return;
    lastPulseRef.current = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - lastPulseRef.current > NO_PULSE_TIMEOUT_MS) {
        setError(`No pulse for ${NO_PULSE_TIMEOUT_MS / 1000} s — stopped to save credits.`);
        void stopMeasuring();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [measuring]);

  async function openCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640, max: 640 },
        height: { ideal: 480, max: 480 },
        frameRate: { ideal: TARGET_FPS },
        facingMode: "user",
      },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    const c = (track.getCapabilities?.() ?? {}) as CameraCaps;
    capsRef.current = c;
    setCaps(c);

    // Start from the remembered settings, else ~25 ms exposure (headroom under 33 ms/frame).
    const current = readSettings(track);
    const initial: CameraSettings = loadSettings() ?? {
      manual: !!c.exposureMode?.includes("manual"),
      exposureTime: c.exposureTime ? snap(250, c.exposureTime) : undefined,
      brightness: current.brightness,
    };
    try {
      await applySettings(track, c, initial);
    } catch {
      initial.manual = false;
    }
    setSettings(initial);

    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
    setCameraOn(true);
  }

  function closeCameraNow() {
    closeCamera(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  async function changeSettings(patch: Partial<CameraSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await applySettings(track, capsRef.current, next);
    } catch (e) {
      setError(`Camera rejected setting: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function toggleCamera() {
    setBusy(true);
    setError("");
    try {
      if (cameraOn) closeCameraNow();
      else await openCamera();
    } catch (e) {
      closeCameraNow();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startMeasuring() {
    setBusy(true);
    setError("");
    try {
      if (!streamRef.current) await openCamera();
      // SDK failures are also published to the shared store (measurement.error).
      await startSdkMeasurement(streamRef.current!);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stopMeasuring() {
    setBusy(true);
    try {
      await stopSdkMeasurement();
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
