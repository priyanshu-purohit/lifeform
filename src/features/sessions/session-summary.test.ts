// Run with `npm test` (Node's built-in test runner; no extra dependency).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MeasurementSample,
  MeasurementSession,
  MetricId,
  MetricState,
  Validity,
} from "../measurements/measurement.types.ts";
import {
  buildSessionSummary,
  computeStats,
  computeTrend,
  downsample,
  MIN_VALID_SAMPLES,
} from "./session-summary.ts";

const T0 = 1_800_000_000_000;

function sample(
  value: number,
  secondsIn: number,
  validity: Validity = "valid",
  metric: MetricId = "pulseRate",
  confidence: number | null = 80,
): MeasurementSample {
  return {
    metric,
    value,
    unit: metric === "pulseRate" ? "bpm" : metric === "breathingRate" ? "breaths/min" : "ms",
    timestamp: T0 + secondsIn * 1000,
    confidence,
    stable: validity === "valid",
    validity,
    source: "simulation",
  };
}

function state(metric: MetricId, history: MeasurementSample[]): MetricState {
  return {
    metric,
    unit: metric === "pulseRate" ? "bpm" : metric === "breathingRate" ? "breaths/min" : "ms",
    freshness: history.length ? "stale" : "waiting",
    latest: history.at(-1) ?? null,
    smoothed: null,
    history,
  };
}

function metrics(partial: Partial<Record<MetricId, MeasurementSample[]>>) {
  return {
    pulseRate: state("pulseRate", partial.pulseRate ?? []),
    breathingRate: state("breathingRate", partial.breathingRate ?? []),
    hrvRmssd: state("hrvRmssd", partial.hrvRmssd ?? []),
  };
}

const ended: MeasurementSession = {
  id: "s1",
  source: "simulation",
  startedAt: T0,
  endedAt: T0 + 60_000,
};

describe("computeStats", () => {
  it("withholds stats when there are too few stable samples (never zero)", () => {
    const few = Array.from({ length: MIN_VALID_SAMPLES - 1 }, (_, i) => sample(70, i));
    assert.equal(computeStats(few), null);
  });

  it("computes mean, min, max, sd and confidence", () => {
    const values = [70, 72, 74, 76, 78, 70, 72, 74, 76, 78];
    const stats = computeStats(values.map((v, i) => sample(v, i)));
    assert.deepEqual(stats, { mean: 74, min: 70, max: 78, sd: 2.8, meanConfidence: 80 });
  });

  it("reports null confidence when the SDK gave none", () => {
    const stats = computeStats(Array.from({ length: 10 }, (_, i) => sample(70, i, "valid", "pulseRate", null)));
    assert.equal(stats?.meanConfidence, null);
  });
});

describe("computeTrend", () => {
  it("compares the first third with the last third", () => {
    // 30 s span -> thirds end at 10 s and start at 20 s (inclusive).
    const s = Array.from({ length: 31 }, (_, i) => sample(i <= 10 ? 80 : i < 20 ? 75 : 70, i));
    assert.deepEqual(computeTrend(s), { startMean: 80, endMean: 70 });
  });

  it("returns null when everything happened at one instant", () => {
    assert.equal(computeTrend(Array.from({ length: 12 }, () => sample(70, 0))), null);
  });
});

describe("downsample", () => {
  it("prefers stable samples and skips empty buckets instead of filling zeros", () => {
    const points = downsample(
      [sample(70, 0), sample(90, 1, "unsettled"), sample(80, 12, "unsettled")],
      T0,
    );
    assert.deepEqual(points, [
      { t: 0, value: 70, confidence: 80, valid: true },
      { t: 10_000, value: 80, confidence: 80, valid: false },
    ]);
  });
});

describe("buildSessionSummary", () => {
  it("returns null while the session is still running", () => {
    const running = { ...ended, endedAt: null };
    assert.equal(buildSessionSummary(running, metrics({ pulseRate: [sample(70, 1)] })), null);
  });

  it("returns null when nothing usable was measured", () => {
    assert.equal(buildSessionSummary(ended, metrics({})), null);
  });

  it("omits metrics that never produced data (e.g. HRV not supported)", () => {
    const pulse = Array.from({ length: 20 }, (_, i) => sample(70 + (i % 3), i));
    const summary = buildSessionSummary(ended, metrics({ pulseRate: pulse }));
    assert.ok(summary);
    assert.deepEqual(Object.keys(summary.metrics), ["pulseRate"]);
    assert.equal(summary.durationMs, 60_000);
    assert.equal(summary.source, "simulation");
  });

  it("uses only stable samples for stats but keeps unsettled ones in the series", () => {
    const pulse = [
      ...Array.from({ length: 10 }, (_, i) => sample(70, i)),
      sample(150, 20, "unsettled"),
      sample(Number.NaN, 21, "invalid"),
    ];
    const m = buildSessionSummary(ended, metrics({ pulseRate: pulse }))!.metrics.pulseRate!;
    assert.equal(m.sampleCount, 11);
    assert.equal(m.validCount, 10);
    assert.equal(m.stats?.max, 70);
    assert.equal(m.series.at(-1)?.valid, false);
  });

  it("keeps a metric with only unsettled data but withholds its stats", () => {
    const breathing = [sample(14, 5, "unsettled", "breathingRate")];
    const m = buildSessionSummary(ended, metrics({ breathingRate: breathing }))!.metrics
      .breathingRate!;
    assert.equal(m.validCount, 0);
    assert.equal(m.stats, null);
    assert.equal(m.trend, null);
  });
});
