// Converts live samples or a stored series into chart points. A long silence becomes a
// gap (y: null) so the line breaks instead of drawing across time with no data.

import type { MeasurementSample } from "@/features/measurements/measurement.types";
import type { SeriesPoint } from "@/features/sessions/session.types";

export interface ChartPoint {
  /** Seconds since the session started. */
  x: number;
  /** null marks a gap in the data. */
  y: number | null;
  /** false = unsettled (not SDK-stable); drawn faintly. */
  valid: boolean;
}

function withGaps(
  points: readonly { tMs: number; y: number; valid: boolean }[],
  maxGapMs: number,
): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    if (prev && p.tMs - prev.tMs > maxGapMs) {
      out.push({ x: (prev.tMs + p.tMs) / 2000, y: null, valid: false });
    }
    out.push({ x: p.tMs / 1000, y: p.y, valid: p.valid });
  }
  return out;
}

export function samplesToPoints(
  samples: readonly MeasurementSample[],
  startedAt: number,
  maxGapMs: number,
): ChartPoint[] {
  return withGaps(
    samples
      .filter((s) => s.validity !== "invalid")
      .map((s) => ({ tMs: s.timestamp - startedAt, y: s.value, valid: s.validity === "valid" })),
    maxGapMs,
  );
}

/** Stored series are bucketed, so neighbouring buckets are always allowed to connect. */
export function seriesToPoints(
  series: readonly SeriesPoint[],
  maxGapMs: number,
  bucketMs = 5_000,
): ChartPoint[] {
  return withGaps(
    series.map((p) => ({ tMs: p.t, y: p.value, valid: p.valid })),
    Math.max(maxGapMs, bucketMs * 2),
  );
}
