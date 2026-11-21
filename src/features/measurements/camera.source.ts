// Owns the webcam stream for the whole app (a module singleton), so a measurement can keep
// running when the user moves from Setup to an experience. Only Setup opens the camera, and
// only after consent; MeasurementLifecycle closes it whenever it is not needed.
//
// Browser-only: nothing here runs at import time, so importing this file is safe during SSR.

export type Range = { min: number; max: number; step?: number };
export type CameraCaps = {
  exposureMode?: string[];
  exposureTime?: Range;
  brightness?: Range;
};
export type CameraSettings = { manual: boolean; exposureTime?: number; brightness?: number };
export type CameraDevice = { id: string; label: string };

// The SDK needs a sustained ~25+ fps (target 30).
export const TARGET_FPS = 30;
const SETTINGS_KEY = "lifeform.cameraSettings";
const DEVICE_KEY = "lifeform.cameraDeviceId";

let stream: MediaStream | null = null;
let caps: CameraCaps = {};
let opening: Promise<MediaStream> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeCamera(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCameraStream(): MediaStream | null {
  return stream;
}

export function getCameraCaps(): CameraCaps {
  return caps;
}

/** Exposure/brightness are tuned per camera, so they are remembered per camera. */
function settingsKey(): string {
  const id = stream?.getVideoTracks()[0]?.getSettings().deviceId;
  return id ? `${SETTINGS_KEY}:${id}` : SETTINGS_KEY;
}

/** Settings remembered for the open camera (falls back to the pre-picker, single-camera value). */
export function loadCameraSettings(): CameraSettings | null {
  try {
    const raw = localStorage.getItem(settingsKey()) ?? localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as CameraSettings) : null;
  } catch {
    return null;
  }
}

export function saveCameraSettings(s: CameraSettings): void {
  try {
    localStorage.setItem(settingsKey(), JSON.stringify(s));
  } catch {
    /* storage unavailable: settings just won't be remembered */
  }
}

function preferredCameraId(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

/**
 * Cameras the system offers (built-in webcam, USB, virtual cameras such as a phone app).
 * Empty until the camera has been opened once: the browser hides devices before permission.
 */
export async function listCameras(): Promise<CameraDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput" && d.deviceId)
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

function snap(value: number, r: Range): number {
  const step = r.step && r.step > 0 ? r.step : 1;
  const v = r.min + Math.round((value - r.min) / step) * step;
  return Math.min(r.max, Math.max(r.min, v));
}

export function readTrackSettings(track: MediaStreamTrack) {
  return track.getSettings() as MediaTrackSettings & {
    exposureMode?: string;
    exposureTime?: number;
    brightness?: number;
  };
}

/** Applies exposure/brightness to the open camera. No-op when the camera is closed. */
export async function applyCameraSettings(s: CameraSettings): Promise<void> {
  const track = stream?.getVideoTracks()[0];
  if (!track) return;
  const set: Record<string, unknown> = {};
  if (caps.exposureMode?.includes("manual") && caps.exposureTime) {
    set.exposureMode = s.manual ? "manual" : "continuous";
    if (s.manual && s.exposureTime != null) set.exposureTime = snap(s.exposureTime, caps.exposureTime);
  }
  if (caps.brightness && s.brightness != null) set.brightness = snap(s.brightness, caps.brightness);
  if (Object.keys(set).length === 0) return;
  await track.applyConstraints({ advanced: [set as MediaTrackConstraintSet] });
}

async function open(): Promise<MediaStream> {
  const base: MediaTrackConstraints = {
    width: { ideal: 640, max: 640 },
    height: { ideal: 480, max: 480 },
    frameRate: { ideal: TARGET_FPS },
  };
  const anyCamera = { video: { ...base, facingMode: "user" }, audio: false };
  const preferred = preferredCameraId();
  let s: MediaStream;
  try {
    s = await navigator.mediaDevices.getUserMedia(
      preferred ? { video: { ...base, deviceId: { exact: preferred } }, audio: false } : anyCamera,
    );
  } catch (e) {
    // The remembered camera is gone (unplugged, or its phone app is not running): use the
    // system default instead. Setup shows which camera is really open.
    const name = (e as { name?: string } | null)?.name;
    if (!preferred || (name !== "OverconstrainedError" && name !== "NotFoundError")) throw e;
    s = await navigator.mediaDevices.getUserMedia(anyCamera);
  }
  const track = s.getVideoTracks()[0];
  // A camera that goes away by itself (phone disconnected, cable pulled) must not look open.
  track.addEventListener("ended", () => {
    if (stream === s) closeCamera();
  });
  stream = s;
  caps = (track.getCapabilities?.() ?? {}) as CameraCaps;
  emit();
  return s;
}

/**
 * Opens the webcam (or returns the already-open stream) and returns the settings applied.
 * Starts from remembered settings, else ~25 ms exposure (headroom under 33 ms/frame).
 */
export async function openCamera(): Promise<{ stream: MediaStream; settings: CameraSettings }> {
  const s = stream ?? (await (opening ??= open().finally(() => (opening = null))));
  const current = readTrackSettings(s.getVideoTracks()[0]);
  const settings: CameraSettings = loadCameraSettings() ?? {
    manual: !!caps.exposureMode?.includes("manual"),
    exposureTime: caps.exposureTime ? snap(250, caps.exposureTime) : undefined,
    brightness: current.brightness,
  };
  try {
    await applyCameraSettings(settings);
  } catch {
    settings.manual = false;
  }
  return { stream: s, settings };
}

/** Switches to another camera and remembers the choice. Reopens the camera if it was open. */
export async function selectCamera(
  id: string,
): Promise<{ stream: MediaStream; settings: CameraSettings }> {
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* storage unavailable: the choice just won't be remembered */
  }
  closeCamera();
  return openCamera();
}

/** Stops every track so the camera light goes off. */
export function closeCamera(): void {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null;
  caps = {};
  emit();
}
