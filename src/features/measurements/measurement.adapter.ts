// The ONLY place that knows the SmartSpectra SDK's data shapes. It turns a decoded `metrics`
// packet and the SDK's status codes into LIFEFORM's normalized types. Nothing is invented:
// a field the SDK did not send produces no sample (never a zero).

import type { decodeMetrics } from "@smartspectra/node-sdk/messages";
import type {
  MeasurementSample,
  MeasurementSource,
  MeasurementStatus,
  MetricId,
  Unit,
  Validity,
} from "./measurement.types";

type SdkMetrics = ReturnType<typeof decodeMetrics>;
/** protobufjs gives int64 as a number, or as a Long when the `long` package is present. */
type SdkTimestamp = number | { toNumber(): number } | null | undefined;

export const METRIC_UNITS: Record<MetricId, Unit> = {
  pulseRate: "bpm",
  breathingRate: "breaths/min",
  hrvRmssd: "ms",
};

/**
 * Plausibility bounds used only to reject glitches (e.g. a protobuf default 0). They are
 * deliberately wide and are not health ranges.
 */
const PLAUSIBLE: Record<MetricId, { min: number; max: number }> = {
  pulseRate: { min: 30, max: 220 },
  breathingRate: { min: 2, max: 60 },
  hrvRmssd: { min: 1, max: 300 },
};

// SDK ProcessingStatus values (index.d.ts: ProcessingStatus).
const STATUS: Record<number, MeasurementStatus> = {
  0: "idle", // kUninitialized
  1: "idle", // kIdle
  2: "starting", // kStarting
  3: "running", // kRunning
  4: "stopping", // kStopping
  5: "error", // kError
};

export function adaptProcessingStatus(code: number): MeasurementStatus {
  return STATUS[code] ?? "error";
}

function toMs(ts: SdkTimestamp): number | null {
  if (ts == null) return null;
  const us = typeof ts === "number" ? ts : ts.toNumber();
  // 0 is protobuf's "unset" default, not a real time.
  return Number.isFinite(us) && us > 0 ? us / 1000 : null;
}

function classify(metric: MetricId, value: number, stable: boolean | null): Validity {
  const { min, max } = PLAUSIBLE[metric];
  if (!Number.isFinite(value) || value < min || value > max) return "invalid";
  return stable ? "valid" : "unsettled";
}

interface RawReading {
  value?: number | null;
  confidence?: number | null;
  stable?: boolean | null;
  timestamp?: SdkTimestamp;
}

function toSample(
  metric: MetricId,
  raw: RawReading,
  value: number | null | undefined,
  source: MeasurementSource,
): MeasurementSample | null {
  const timestamp = toMs(raw.timestamp);
  if (value == null || timestamp == null) return null;
  const stable = raw.stable ?? null;
  return {
    metric,
    value,
    unit: METRIC_UNITS[metric],
    timestamp,
    confidence: raw.confidence ?? null,
    stable,
    validity: classify(metric, value, stable),
    source,
  };
}

/** Every reading in one decoded `metrics` packet, as normalized samples (invalid included). */
export function adaptMetrics(m: SdkMetrics, source: MeasurementSource): MeasurementSample[] {
  const out: MeasurementSample[] = [];
  const push = (s: MeasurementSample | null) => {
    if (s) out.push(s);
  };

  for (const r of m.cardio?.pulseRate ?? []) push(toSample("pulseRate", r, r.value, source));
  for (const r of m.breathing?.rate ?? []) push(toSample("breathingRate", r, r.value, source));
  // HRV reports several statistics; LIFEFORM uses RMSSD (milliseconds).
  for (const r of m.cardio?.hrv ?? []) push(toSample("hrvRmssd", r, r.rmssd, source));

  return out;
}
