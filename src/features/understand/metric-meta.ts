// Display facts about each metric, shared by the Understand cards, charts and comparisons.
// Type-only imports so this runs under `node --test` too.

import type { MetricId } from "@/features/measurements/measurement.types";

export interface MetricMeta {
  id: MetricId;
  label: string;
  unit: string;
  digits: number;
  /** Line colour (matches the dot colours used in Explore). */
  color: string;
  /** Shown while a session runs and the metric has not arrived yet. */
  waiting: string;
  /** Differences smaller than this are described as "about the same" (measurement wobble). */
  sameWithin: number;
  /** A gap between readings longer than this breaks the chart line (mirrors "stale"). */
  maxGapMs: number;
}

export const METRIC_ORDER: readonly MetricId[] = ["pulseRate", "breathingRate", "hrvRmssd"];

export const METRIC_META: Readonly<Record<MetricId, MetricMeta>> = {
  pulseRate: {
    id: "pulseRate",
    label: "Pulse",
    unit: "bpm",
    digits: 0,
    color: "#5eead4",
    waiting: "Waiting for pulse · usually a few seconds",
    sameWithin: 2,
    maxGapMs: 6_000,
  },
  breathingRate: {
    id: "breathingRate",
    label: "Breathing",
    unit: "breaths/min",
    digits: 1,
    color: "#a5b4fc",
    waiting: "Waiting for breathing · needs about 30 s",
    sameWithin: 1,
    maxGapMs: 15_000,
  },
  hrvRmssd: {
    id: "hrvRmssd",
    label: "HRV",
    unit: "ms",
    digits: 0,
    color: "#fcd34d",
    waiting: "Waiting for HRV · only if the SDK reports it",
    sameWithin: 5,
    maxGapMs: 30_000,
  },
};

export function formatValue(metric: MetricId, value: number): string {
  return value.toFixed(METRIC_META[metric].digits);
}

/** The label as it reads mid-sentence: "pulse", "breathing", but "HRV" keeps its capitals. */
export function metricNoun(metric: MetricId): string {
  const label = METRIC_META[metric].label;
  return label === label.toUpperCase() ? label : label.toLowerCase();
}
