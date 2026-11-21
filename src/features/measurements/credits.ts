// Local estimate of SDK credit use, so real-data testing stays inside the trial budget.
// This is only an estimate from session length: the Presage dashboard is the real balance.
//
// Browser-only at call time: nothing here runs at import, so importing is safe during SSR.

/** Presage bills the trial at one credit per 30 s of measuring. */
export const SECONDS_PER_CREDIT = 30;

/** Choices for the automatic stop, in minutes. */
export const SESSION_LIMIT_CHOICES_MIN: readonly number[] = [1, 2, 3, 5, 10];
export const DEFAULT_SESSION_LIMIT_MIN = 3;

const LIMIT_KEY = "lifeform.sessionLimitMin";
const USED_KEY = "lifeform.creditsUsedEstimate";

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable: the value just won't be remembered */
  }
  emit();
}

export function subscribeCredits(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Credits a session of this length costs (a started 30 s block counts as a whole credit). */
export function estimateCredits(durationMs: number): number {
  return durationMs <= 0 ? 0 : Math.ceil(durationMs / 1000 / SECONDS_PER_CREDIT);
}

/** A real session is stopped automatically after this many minutes. */
export function getSessionLimitMin(): number {
  const n = readNumber(LIMIT_KEY);
  return n != null && SESSION_LIMIT_CHOICES_MIN.includes(n) ? n : DEFAULT_SESSION_LIMIT_MIN;
}

export function setSessionLimitMin(minutes: number): void {
  writeNumber(LIMIT_KEY, minutes);
}

/** Estimated credits spent by real sessions run from this app on this device. */
export function getCreditsUsedEstimate(): number {
  return Math.max(0, readNumber(USED_KEY) ?? 0);
}

export function addCreditsUsed(credits: number): void {
  if (credits > 0) writeNumber(USED_KEY, getCreditsUsedEstimate() + credits);
}

export function resetCreditsUsedEstimate(): void {
  writeNumber(USED_KEY, 0);
}
