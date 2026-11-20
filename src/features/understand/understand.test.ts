import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MeasurementSample } from "../measurements/measurement.types.ts";
import type { MetricSummary, SessionSummary } from "../sessions/session.types.ts";
import { samplesToPoints, seriesToPoints } from "./chart-data.ts";
import { compareSessions } from "./compare.ts";
import { formatDuration } from "./format.ts";

const T0 = 1_800_000_000_000;

function metric(mean: number | null, id: MetricSummary["metric"] = "pulseRate"): MetricSummary {
  return {
    metric: id,
    unit: id === "pulseRate" ? "bpm" : id === "breathingRate" ? "breaths/min" : "ms",
    sampleCount: 30,
    validCount: mean == null ? 2 : 30,
    stats: mean == null ? null : { mean, min: mean - 3, max: mean + 3, sd: 1, meanConfidence: 80 },
    trend: null,
    firstSampleAt: T0,
    lastSampleAt: T0 + 30_000,
    series: [],
  };
}

function session(
  id: string,
  startedAt: number,
  durationMs: number,
  metrics: SessionSummary["metrics"],
  source: SessionSummary["source"] = "presage-sdk",
): SessionSummary {
  return { version: 1, id, source, startedAt, endedAt: startedAt + durationMs, durationMs, metrics };
}

describe("compareSessions", () => {
  const older = session("a", T0, 180_000, { pulseRate: metric(72), breathingRate: metric(14, "breathingRate") });
  const newer = session("b", T0 + 86_400_000, 300_000, {
    pulseRate: metric(68),
    breathingRate: metric(14.5, "breathingRate"),
  });

  it("orders sessions by start time regardless of argument order", () => {
    const c = compareSessions(newer, older);
    assert.equal(c.earlier.id, "a");
    assert.equal(c.later.id, "b");
  });

  it("describes a clear difference with direction and both values", () => {
    const pulse = compareSessions(older, newer).metrics.find((m) => m.metric === "pulseRate")!;
    assert.equal(pulse.difference, -4);
    assert.equal(pulse.sentence, "Average pulse was 4 bpm lower in the later session (68 vs 72 bpm).");
  });

  it("calls small differences 'about the same'", () => {
    const b = compareSessions(older, newer).metrics.find((m) => m.metric === "breathingRate")!;
    assert.match(b.sentence, /about the same/);
  });

  it("never compares against missing data", () => {
    const noStats = session("c", T0 + 1, 60_000, { pulseRate: metric(null) });
    const pulse = compareSessions(older, noStats).metrics.find((m) => m.metric === "pulseRate")!;
    assert.equal(pulse.difference, null);
    assert.match(pulse.sentence, /later session did not have enough steady readings/);
    const breathing = compareSessions(older, noStats).metrics.find((m) => m.metric === "breathingRate")!;
    assert.match(breathing.sentence, /later session was not measured/);
  });

  it("omits metrics neither session measured (e.g. HRV)", () => {
    assert.equal(compareSessions(older, newer).metrics.some((m) => m.metric === "hrvRmssd"), false);
  });

  it("describes duration and flags simulated vs real", () => {
    const sim = session("d", T0 + 2, 300_000, {}, "simulation");
    const c = compareSessions(older, sim);
    assert.equal(c.durationSentence, "The later session was 2 min longer (5 min vs 3 min).");
    assert.equal(c.mixedSources, true);
  });

  it("uses only descriptive language", () => {
    const text = [compareSessions(older, newer).durationSentence, ...compareSessions(older, newer).metrics.map((m) => m.sentence)].join(" ");
    assert.doesNotMatch(text, /stress|calm|relax|health|better|worse|anxi|normal/i);
  });
});

describe("chart points", () => {
  const s = (sec: number, value: number, validity: MeasurementSample["validity"] = "valid"): MeasurementSample => ({
    metric: "pulseRate",
    value,
    unit: "bpm",
    timestamp: T0 + sec * 1000,
    confidence: 80,
    stable: validity === "valid",
    validity,
    source: "simulation",
  });

  it("breaks the line on long silences instead of drawing through them", () => {
    const points = samplesToPoints([s(0, 70), s(1, 71), s(20, 72)], T0, 6_000);
    assert.deepEqual(points.map((p) => p.y), [70, 71, null, 72]);
  });

  it("marks unsettled samples and drops invalid ones", () => {
    const points = samplesToPoints([s(0, 70, "unsettled"), s(1, 0, "invalid")], T0, 6_000);
    assert.deepEqual(points, [{ x: 0, y: 70, valid: false }]);
  });

  it("keeps neighbouring stored buckets connected", () => {
    const series = [
      { t: 0, value: 70, confidence: 80, valid: true },
      { t: 5_000, value: 71, confidence: 80, valid: true },
      { t: 60_000, value: 72, confidence: 80, valid: true },
    ];
    assert.deepEqual(seriesToPoints(series, 6_000).map((p) => p.y), [70, 71, null, 72]);
  });
});

describe("formatDuration", () => {
  it("formats seconds, minutes and hours", () => {
    assert.equal(formatDuration(42_000), "42 s");
    assert.equal(formatDuration(125_000), "2 min 5 s");
    assert.equal(formatDuration(3_720_000), "1 h 2 min");
  });
});
