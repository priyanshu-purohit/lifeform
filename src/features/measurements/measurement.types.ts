// Shared, normalized measurement types. Explore, Understand and Create consume ONLY these;
// none of them may read raw SDK events. Every field maps to something the SmartSpectra SDK
// actually reports (see node_modules/@smartspectra/node-sdk/js/messages/generated.d.ts).

/** Metrics LIFEFORM uses. Each maps to one SDK field (see measurement.adapter.ts). */
export type MetricId = "pulseRate" | "breathingRate" | "hrvRmssd";

export type Unit = "bpm" | "breaths/min" | "ms";

/** Where a sample came from. "simulation" is development-only and must be labeled in the UI. */
export type MeasurementSource = "presage-sdk" | "simulation";

/**
 * - valid: plausible value and the SDK marks it stable (its own accuracy threshold).
 * - unsettled: plausible value, but the SDK does not mark it stable yet.
 * - invalid: missing, non-finite or physiologically implausible; never shown or smoothed.
 */
export type Validity = "valid" | "unsettled" | "invalid";

/** One normalized reading. */
export interface MeasurementSample {
  metric: MetricId;
  value: number;
  unit: Unit;
  /** Milliseconds since the Unix epoch (the SDK reports microseconds; converted here). */
  timestamp: number;
  /** SDK confidence in percent [0, 100], or null when the SDK did not report one. */
  confidence: number | null;
  /** The SDK's own `stable` flag, or null when absent. */
  stable: boolean | null;
  validity: Validity;
  source: MeasurementSource;
}

/**
 * - waiting: nothing received yet this session (e.g. breathing needs ~30 s).
 * - live: a usable sample arrived recently.
 * - stale: samples stopped arriving; the last value is kept but must be shown as old.
 */
export type Freshness = "waiting" | "live" | "stale";

/** Current state of one metric. `latest`/`smoothed` are null until a usable sample exists. */
export interface MetricState {
  metric: MetricId;
  unit: Unit;
  freshness: Freshness;
  /** Most recent non-invalid sample. */
  latest: MeasurementSample | null;
  /** Confidence-weighted moving average of recent non-invalid samples. */
  smoothed: number | null;
  /** Non-invalid samples this session, oldest first (bounded). */
  history: readonly MeasurementSample[];
}

/** Mirrors the SDK's ProcessingStatus, plus "inactive" before any SDK exists. */
export type MeasurementStatus = "inactive" | "idle" | "starting" | "running" | "stopping" | "error";

/** The SDK's live framing / lighting guidance (validationStatus event). */
export interface SignalGuidance {
  /** SDK ValidationCode; 0 means OK. */
  code: number;
  /** Human-readable hint from the SDK; empty when OK. */
  hint: string;
}

export interface MeasurementError {
  /** SDK SmartSpectraErrorCode, or null for errors raised by LIFEFORM itself. */
  code: number | null;
  message: string;
  retryable: boolean;
}

export interface MeasurementSession {
  id: string;
  source: MeasurementSource;
  startedAt: number;
  /** null while the session is still running. */
  endedAt: number | null;
}

/** Everything the UI reads. Immutable: a new object on every change. */
export interface MeasurementSnapshot {
  status: MeasurementStatus;
  session: MeasurementSession | null;
  guidance: SignalGuidance | null;
  error: MeasurementError | null;
  metrics: Readonly<Record<MetricId, MetricState>>;
}
