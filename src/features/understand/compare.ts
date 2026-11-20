// Describes how two stored sessions differ. Only facts from the stored numbers:
// no health, medical or emotional interpretation.

import type { MetricId } from "@/features/measurements/measurement.types";
import type { SessionSummary } from "@/features/sessions/session.types";
import { formatDuration } from "./format.ts";
import { METRIC_META, METRIC_ORDER, formatValue, metricNoun } from "./metric-meta.ts";

/** Durations closer than this are "about the same length". */
const SAME_DURATION_MS = 10_000;

export interface MetricComparison {
  metric: MetricId;
  /** Session averages from SDK-stable readings, or null when unavailable. */
  earlier: number | null;
  later: number | null;
  /** later - earlier, or null when either side is unavailable. */
  difference: number | null;
  sentence: string;
}

export interface SessionComparison {
  earlier: SessionSummary;
  later: SessionSummary;
  durationSentence: string;
  /** Only metrics measured in at least one of the two sessions. */
  metrics: MetricComparison[];
  /** true when one session is simulated and the other is not. */
  mixedSources: boolean;
}

function unavailable(s: SessionSummary, metric: MetricId): string | null {
  const m = s.metrics[metric];
  if (!m) return "was not measured";
  if (!m.stats) return "did not have enough steady readings";
  return null;
}

function compareMetric(
  metric: MetricId,
  earlier: SessionSummary,
  later: SessionSummary,
): MetricComparison | null {
  if (!earlier.metrics[metric] && !later.metrics[metric]) return null;
  const meta = METRIC_META[metric];
  const a = earlier.metrics[metric]?.stats?.mean ?? null;
  const b = later.metrics[metric]?.stats?.mean ?? null;

  if (a == null || b == null) {
    const reasons = [
      a == null ? `the earlier session ${unavailable(earlier, metric)}` : null,
      b == null ? `the later session ${unavailable(later, metric)}` : null,
    ].filter(Boolean);
    return {
      metric,
      earlier: a,
      later: b,
      difference: null,
      sentence: `${meta.label} can't be compared: ${reasons.join(" and ")}.`,
    };
  }

  const diff = Math.round((b - a) * 10) / 10;
  const pair = `${formatValue(metric, b)} vs ${formatValue(metric, a)} ${meta.unit}`;
  const sentence =
    Math.abs(diff) < meta.sameWithin
      ? `Average ${metricNoun(metric)} was about the same in both sessions (${pair}).`
      : `Average ${metricNoun(metric)} was ${formatValue(metric, Math.abs(diff))} ${meta.unit} ${
          diff > 0 ? "higher" : "lower"
        } in the later session (${pair}).`;
  return { metric, earlier: a, later: b, difference: diff, sentence };
}

function durationSentence(earlier: SessionSummary, later: SessionSummary): string {
  const diff = later.durationMs - earlier.durationMs;
  const pair = `${formatDuration(later.durationMs)} vs ${formatDuration(earlier.durationMs)}`;
  if (Math.abs(diff) < SAME_DURATION_MS) return `Both sessions lasted about the same time (${pair}).`;
  return `The later session was ${formatDuration(Math.abs(diff))} ${
    diff > 0 ? "longer" : "shorter"
  } (${pair}).`;
}

/** Order does not matter: the older session is always "earlier". */
export function compareSessions(a: SessionSummary, b: SessionSummary): SessionComparison {
  const [earlier, later] = a.startedAt <= b.startedAt ? [a, b] : [b, a];
  return {
    earlier,
    later,
    durationSentence: durationSentence(earlier, later),
    metrics: METRIC_ORDER.flatMap((id) => compareMetric(id, earlier, later) ?? []),
    mixedSources: earlier.source !== later.source,
  };
}
