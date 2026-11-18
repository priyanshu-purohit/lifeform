// Turns a finished session's samples into a SessionSummary. Pure functions with only
// type imports, so they run unchanged in the browser and under `node --test`.

import type {
  MeasurementSample,
  MeasurementSession,
  MetricId,
  MetricState,
} from "@/features/measurements/measurement.types";
import type {
  MetricStats,
  MetricSummary,
  MetricTrend,
  SeriesPoint,
  SessionSummary,
} from "./session.types";

/** Bump when the stored shape changes so old records can be recognised. */
export const SUMMARY_VERSION = 1;

const METRICS: readonly MetricId[] = ["pulseRate", "breathingRate", "hrvRmssd"];

/** Below this many stable samples, stats are withheld ("not enough data"). */
export const MIN_VALID_SAMPLES = 10;
/** Each third of the session needs this many stable samples for a start/end trend. */
export const MIN_TREND_SAMPLES = 3;
/** Chart resolution: one point per bucket. */
export const SERIES_BUCKET_MS = 5_000;

const round1 = (n: number) => Math.round(n * 10) / 10;

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function meanConfidence(samples: readonly MeasurementSample[]): number | null {
  const known = samples.flatMap((s) => (s.confidence == null ? [] : [s.confidence]));
  return known.length > 0 ? round1(mean(known)) : null;
}

export function computeStats(valid: readonly MeasurementSample[]): MetricStats | null {
  if (valid.length < MIN_VALID_SAMPLES) return null;
  const values = valid.map((s) => s.value);
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return {
    mean: round1(m),
    min: round1(Math.min(...values)),
    max: round1(Math.max(...values)),
    sd: round1(Math.sqrt(variance)),
    meanConfidence: meanConfidence(valid),
  };
}

/** Thirds are split by time, not by count, so uneven sample rates don't skew them. */
export function computeTrend(valid: readonly MeasurementSample[]): MetricTrend | null {
  if (valid.length < MIN_VALID_SAMPLES) return null;
  const from = valid[0].timestamp;
  const span = valid[valid.length - 1].timestamp - from;
  if (span <= 0) return null;
  const firstEnd = from + span / 3;
  const lastStart = from + (2 * span) / 3;
  const first = valid.filter((s) => s.timestamp <= firstEnd).map((s) => s.value);
  const last = valid.filter((s) => s.timestamp >= lastStart).map((s) => s.value);
  if (first.length < MIN_TREND_SAMPLES || last.length < MIN_TREND_SAMPLES) return null;
  return { startMean: round1(mean(first)), endMean: round1(mean(last)) };
}

/**
 * One point per bucket. A bucket uses its stable samples when it has any; otherwise its
 * unsettled ones, flagged valid:false so charts can draw them faintly. Empty buckets are
 * skipped (a gap), never filled with zero.
 */
export function downsample(
  samples: readonly MeasurementSample[],
  startedAt: number,
  bucketMs = SERIES_BUCKET_MS,
): SeriesPoint[] {
  const buckets = new Map<number, MeasurementSample[]>();
  for (const s of samples) {
    const key = Math.floor(Math.max(0, s.timestamp - startedAt) / bucketMs);
    const list = buckets.get(key);
    if (list) list.push(s);
    else buckets.set(key, [s]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, list]) => {
      const stable = list.filter((s) => s.validity === "valid");
      const used = stable.length > 0 ? stable : list;
      return {
        t: key * bucketMs,
        value: round1(mean(used.map((s) => s.value))),
        confidence: meanConfidence(used),
        valid: stable.length > 0,
      };
    });
}

export function summarizeMetric(
  state: MetricState,
  startedAt: number,
): MetricSummary | null {
  // Never trust input order or validity blindly: drop invalid, sort by time.
  const samples = state.history
    .filter((s) => s.validity !== "invalid" && Number.isFinite(s.value))
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);
  if (samples.length === 0) return null;
  const valid = samples.filter((s) => s.validity === "valid");
  return {
    metric: state.metric,
    unit: state.unit,
    sampleCount: samples.length,
    validCount: valid.length,
    stats: computeStats(valid),
    trend: computeTrend(valid),
    firstSampleAt: samples[0].timestamp,
    lastSampleAt: samples[samples.length - 1].timestamp,
    series: downsample(samples, startedAt),
  };
}

/** Returns null for a session that is still running or produced no usable sample at all. */
export function buildSessionSummary(
  session: MeasurementSession,
  metrics: Readonly<Record<MetricId, MetricState>>,
): SessionSummary | null {
  if (session.endedAt == null) return null;
  const summaries: SessionSummary["metrics"] = {};
  for (const id of METRICS) {
    const summary = summarizeMetric(metrics[id], session.startedAt);
    if (summary) summaries[id] = summary;
  }
  if (Object.keys(summaries).length === 0) return null;
  return {
    version: SUMMARY_VERSION,
    id: session.id,
    source: session.source,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs: Math.max(0, session.endedAt - session.startedAt),
    metrics: summaries,
  };
}
