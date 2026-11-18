// What LIFEFORM keeps after a session ends. Only derived numbers: no video, no images,
// no raw SDK packets. This is the shape stored in IndexedDB and read by Understand/Create.

import type { MeasurementSource, MetricId, Unit } from "@/features/measurements/measurement.types";

/** One point of the slimmed-down line used for charts (one per time bucket). */
export interface SeriesPoint {
  /** Milliseconds since the session started (bucket start). */
  t: number;
  value: number;
  /** Mean SDK confidence in the bucket [0, 100], or null when the SDK reported none. */
  confidence: number | null;
  /** true when built from SDK-stable samples; false when only unsettled samples existed. */
  valid: boolean;
}

/** Statistics over SDK-stable samples only. */
export interface MetricStats {
  mean: number;
  min: number;
  max: number;
  /** Population standard deviation. */
  sd: number;
  /** Mean confidence of the samples used, or null when none reported one. */
  meanConfidence: number | null;
}

/** Start vs end of the session: mean of the first third against the last third (by time). */
export interface MetricTrend {
  startMean: number;
  endMean: number;
}

export interface MetricSummary {
  metric: MetricId;
  unit: Unit;
  /** Every usable sample received (stable + unsettled). */
  sampleCount: number;
  /** SDK-stable samples; only these feed stats and trend. */
  validCount: number;
  /** null when there were too few stable samples: never shown as zero. */
  stats: MetricStats | null;
  /** null when there were too few stable samples in the first or last third. */
  trend: MetricTrend | null;
  /** Timestamp (ms epoch) of the first and last sample the summary is based on. */
  firstSampleAt: number;
  lastSampleAt: number;
  series: SeriesPoint[];
}

export interface SessionSummary {
  /** Stored-shape version (SUMMARY_VERSION in session-summary.ts). */
  version: 1;
  id: string;
  source: MeasurementSource;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  /** Only metrics that actually produced data. A missing key means "not measured". */
  metrics: Partial<Record<MetricId, MetricSummary>>;
}
