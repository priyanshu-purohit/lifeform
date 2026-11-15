// Camera consent, given on the Welcome page and checked before the camera opens.
// Kept in sessionStorage so it lasts for this app session only: every new launch asks again.
// Browser-only: call these from event handlers or effects, never during render.

const CONSENT_KEY = "lifeform.cameraConsent";

export interface CameraConsent {
  /** When consent was given (ms since epoch). */
  givenAt: number;
}

export function giveCameraConsent(): void {
  const record: CameraConsent = { givenAt: Date.now() };
  try {
    sessionStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    /* storage blocked: consent lasts only until this page navigates */
  }
}

export function getCameraConsent(): CameraConsent | null {
  try {
    const raw = sessionStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CameraConsent>;
    return typeof parsed.givenAt === "number" ? { givenAt: parsed.givenAt } : null;
  } catch {
    return null;
  }
}

export function revokeCameraConsent(): void {
  try {
    sessionStorage.removeItem(CONSENT_KEY);
  } catch {
    /* nothing stored */
  }
}
