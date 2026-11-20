// Observations: plain sentences built from saved session numbers by fixed rules.
// No AI, no health/medical/emotional interpretation: only what the numbers did.
// Real and simulated sessions are never mixed: the pool is the latest session's source.

import type { MeasurementSource, MetricId } from "@/features/measurements/measurement.types";
import type { SessionSummary } from "@/features/sessions/session.types";
import { METRIC_META, METRIC_ORDER, formatValue, metricNoun } from "./metric-meta.ts";

/** Observations stay hidden until this many sessions of the same source exist. */
export const MIN_OBSERVATION_SESSIONS = 3;

export type ObservationKind = "baseline" | "latest-change" | "pattern" | "range" | "coverage";

export interface Observation {
  kind: ObservationKind;
  text: string;
}

/** Each session's average for one metric, for the baseline strip. */
export interface BaselineStrip {
  points: { id: string; startedAt: number; mean: number; latest: boolean }[];
  /** Median of the earlier sessions' averages (the latest is excluded), or null. */
  baseline: number | null;
}

export interface MetricObservations {
  metric: MetricId;
  /** Sessions in the pool with an average for this metric. */
  sessionsWithAverage: number;
  strip: BaselineStrip | null;
  observations: Observation[];
}

export type ObservationsResult =
  | {
      status: "needs-more";
      source: MeasurementSource;
      /** Sessions of the latest session's source. */
      have: number;
      need: number;
      /** Saved sessions of the other source, which do not count. */
      otherSource: number;
    }
  | {
      status: "ready";
      source: MeasurementSource;
      sessionCount: number;
      latest: SessionSummary;
      metrics: MetricObservations[];
    };

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function observeMetric(metric: MetricId, pool: SessionSummary[]): MetricObservations | null {
  const meta = METRIC_META[metric];
  const name = metricNoun(metric);
  const unit = meta.unit;
  const fmt = (v: number) => formatValue(metric, v);
  const latest = pool[pool.length - 1];

  const measured = pool.filter((s) => s.metrics[metric]);
  if (measured.length === 0) return null;

  const withAvg = pool.filter((s) => s.metrics[metric]?.stats);
  const observations: Observation[] = [];

  // Not enough sessions with an average: say so instead of guessing.
  if (withAvg.length < MIN_OBSERVATION_SESSIONS) {
    observations.push({
      kind: "coverage",
      text: `${meta.label} had enough steady readings for an average in ${withAvg.length} of ${plural(
        pool.length,
        "session",
      )}. Observations need at least ${MIN_OBSERVATION_SESSIONS}.`,
    });
    return { metric, sessionsWithAverage: withAvg.length, strip: null, observations };
  }

  const latestMean = latest.metrics[metric]?.stats?.mean ?? null;
  const earlier = withAvg.filter((s) => s.id !== latest.id).map((s) => s.metrics[metric]!.stats!.mean);
  const baseline = earlier.length >= MIN_OBSERVATION_SESSIONS - 1 ? median(earlier) : null;

  // 1. Latest session against the baseline (median of earlier session averages).
  if (latestMean == null) {
    observations.push({
      kind: "baseline",
      text: `Your latest session has no ${name} average, so it can't be set against your baseline.`,
    });
  } else if (baseline != null) {
    const diff = round1(latestMean - baseline);
    const min = Math.min(...earlier);
    const max = Math.max(...earlier);
    const base = `your baseline of ${fmt(baseline)} ${unit} (the median of ${plural(earlier.length, "earlier session")})`;
    let text =
      Math.abs(diff) < meta.sameWithin
        ? `Your latest average ${name}, ${fmt(latestMean)} ${unit}, was about the same as ${base}.`
        : `Your latest average ${name}, ${fmt(latestMean)} ${unit}, was ${fmt(Math.abs(diff))} ${unit} ${
            diff > 0 ? "higher" : "lower"
          } than ${base}.`;
    // Only point out a new high/low when the difference is clear, not measurement wobble.
    if (Math.abs(diff) >= meta.sameWithin) {
      if (latestMean > max) text += ` It is the highest session average so far.`;
      else if (latestMean < min) text += ` It is the lowest session average so far.`;
    }
    observations.push({ kind: "baseline", text });
  }

  // 2. How the latest session moved from its first third to its last third.
  const trend = latest.metrics[metric]?.trend;
  if (trend) {
    const d = trend.endMean - trend.startMean;
    observations.push({
      kind: "latest-change",
      text:
        Math.abs(d) < meta.sameWithin
          ? `Within your latest session, ${name} stayed about level (${fmt(trend.startMean)} → ${fmt(trend.endMean)} ${unit}, first third to last third).`
          : `Within your latest session, ${name} went from ${fmt(trend.startMean)} to ${fmt(trend.endMean)} ${unit} between the first and last third.`,
    });
  }

  // 3. The within-session direction across all sessions that have a trend.
  const trends = pool.flatMap((s) => s.metrics[metric]?.trend ?? []);
  if (trends.length >= MIN_OBSERVATION_SESSIONS) {
    let lower = 0;
    let higher = 0;
    for (const t of trends) {
      const d = t.endMean - t.startMean;
      if (d <= -meta.sameWithin) lower++;
      else if (d >= meta.sameWithin) higher++;
    }
    const level = trends.length - lower - higher;
    const n = trends.length;
    const text =
      lower > n / 2
        ? `In ${lower} of ${n} sessions, ${name} was lower in the last third than in the first third.`
        : higher > n / 2
          ? `In ${higher} of ${n} sessions, ${name} was higher in the last third than in the first third.`
          : level > n / 2
            ? `In ${level} of ${n} sessions, ${name} stayed about level from the first third to the last third.`
            : `Within sessions, ${name} showed no consistent direction: lower in ${lower}, higher in ${higher}, about level in ${level} of ${n}.`;
    observations.push({ kind: "pattern", text });
  }

  // 4. Spread of session averages.
  const means = withAvg.map((s) => s.metrics[metric]!.stats!.mean);
  // Work in displayed precision so the spread matches the two numbers shown.
  const shown = (v: number) => Number(fmt(v));
  const lo = shown(Math.min(...means));
  const hi = shown(Math.max(...means));
  observations.push({
    kind: "range",
    text:
      hi - lo < meta.sameWithin
        ? `Across ${withAvg.length} sessions, average ${name} stayed within ${fmt(lo)}–${fmt(hi)} ${unit}.`
        : `Across ${withAvg.length} sessions, average ${name} ranged from ${fmt(lo)} to ${fmt(hi)} ${unit}, a spread of ${fmt(hi - lo)} ${unit}.`,
  });

  return {
    metric,
    sessionsWithAverage: withAvg.length,
    strip: {
      points: withAvg.map((s) => ({
        id: s.id,
        startedAt: s.startedAt,
        mean: s.metrics[metric]!.stats!.mean,
        latest: s.id === latest.id,
      })),
      baseline,
    },
    observations,
  };
}

/** `sessions` in any order. Returns null when there are no sessions at all. */
export function buildObservations(sessions: readonly SessionSummary[]): ObservationsResult | null {
  if (sessions.length === 0) return null;
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const latest = sorted[sorted.length - 1];
  const pool = sorted.filter((s) => s.source === latest.source);

  if (pool.length < MIN_OBSERVATION_SESSIONS) {
    return {
      status: "needs-more",
      source: latest.source,
      have: pool.length,
      need: MIN_OBSERVATION_SESSIONS,
      otherSource: sorted.length - pool.length,
    };
  }
  return {
    status: "ready",
    source: latest.source,
    sessionCount: pool.length,
    latest,
    metrics: METRIC_ORDER.flatMap((id) => observeMetric(id, pool) ?? []),
  };
}
