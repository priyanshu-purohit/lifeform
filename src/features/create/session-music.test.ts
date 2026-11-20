import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MetricSummary, SeriesPoint, SessionSummary } from "@/features/sessions";
import { generateBar } from "./music-generator.ts";
import {
  MAX_PIECE_SECONDS,
  MAX_TEMPO_STEP,
  composeSession,
  nextTempo,
  readSeries,
  seriesTrend,
} from "./session-music.ts";

const point = (t: number, value: number, valid = true, confidence: number | null = 100): SeriesPoint => ({
  t,
  value,
  confidence,
  valid,
});

/** One point every 5 s, as the recorder stores them. */
function series(seconds: number, valueAt: (t: number) => number): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let t = 0; t < seconds * 1000; t += 5000) points.push(point(t, valueAt(t)));
  return points;
}

function metric(id: MetricSummary["metric"], points: SeriesPoint[]): MetricSummary {
  return {
    metric: id,
    unit: id === "pulseRate" ? "bpm" : id === "breathingRate" ? "breaths/min" : "ms",
    sampleCount: points.length,
    validCount: points.length,
    stats: null,
    trend: null,
    firstSampleAt: 0,
    lastSampleAt: 0,
    series: points,
  };
}

function session(seconds: number, metrics: SessionSummary["metrics"], id = "session-a"): SessionSummary {
  return {
    version: 1,
    id,
    source: "presage-sdk",
    startedAt: 0,
    endedAt: seconds * 1000,
    durationMs: seconds * 1000,
    metrics,
  };
}

describe("nextTempo", () => {
  it("moves toward the target by a limited step per bar", () => {
    assert.equal(nextTempo(72, 120), 72 + MAX_TEMPO_STEP);
    assert.equal(nextTempo(100, 60), 100 - MAX_TEMPO_STEP);
    assert.equal(nextTempo(80, 81), 81);
  });
});

describe("readSeries", () => {
  it("interpolates between neighbouring points", () => {
    const reading = readSeries([point(0, 60), point(5000, 70)], 2500);
    assert.equal(reading?.value, 65);
    assert.equal(reading?.drive, 1);
  });

  it("returns nothing inside a gap, instead of inventing a value", () => {
    assert.equal(readSeries([point(0, 60), point(40_000, 70)], 20_000), null);
  });

  it("holds the edge value briefly, then returns nothing", () => {
    const points = [point(10_000, 60), point(15_000, 62)];
    assert.equal(readSeries(points, 5000)?.value, 60);
    assert.equal(readSeries(points, 20_000)?.value, 62);
    assert.equal(readSeries(points, 0), null);
    assert.equal(readSeries(points, 30_000), null);
    assert.equal(readSeries([], 0), null);
  });

  it("trusts unsettled and low-confidence points less", () => {
    const steady = readSeries([point(0, 60)], 0)!.drive;
    const unsettled = readSeries([point(0, 60, false)], 0)!.drive;
    const unsure = readSeries([point(0, 60, true, 10)], 0)!.drive;
    assert.ok(unsettled < steady && unsettled > 0);
    assert.ok(unsure < steady && unsure > 0);
  });
});

describe("seriesTrend", () => {
  const rising = series(120, (t) => 60 + t / 5000);

  it("compares the last window with the one before it", () => {
    assert.equal(seriesTrend(rising, 100_000, 30_000, 3), 6);
  });

  it("is unknown until both windows hold enough points", () => {
    assert.equal(seriesTrend(rising, 20_000, 30_000, 3), null);
  });
});

describe("composeSession", () => {
  const full = session(60, {
    pulseRate: metric("pulseRate", series(60, (t) => 70 + t / 3000)),
    breathingRate: metric("breathingRate", series(60, () => 12)),
  });

  it("refuses a session that is too short or has no readings", () => {
    assert.equal(composeSession(session(10, full.metrics)), null);
    assert.equal(composeSession(session(60, {})), null);
  });

  it("follows the session from start to end at its own length", () => {
    const plan = composeSession(full)!;
    assert.equal(plan.compressed, false);
    assert.ok(plan.durationSeconds >= 60 && plan.durationSeconds < 65);
    assert.equal(plan.bars[0].sessionMs, 0);
    const last = plan.bars.at(-1)!;
    assert.ok(last.sessionMs < 60_000);
    assert.ok(last.targets.tempoBpm > plan.bars[0].targets.tempoBpm);
    for (let i = 1; i < plan.bars.length; i++) {
      assert.ok(plan.bars[i].startSeconds > plan.bars[i - 1].startSeconds);
      assert.ok(Math.abs(plan.bars[i].tempoBpm - plan.bars[i - 1].tempoBpm) <= MAX_TEMPO_STEP + 1e-9);
    }
  });

  it("compresses a long session instead of running long", () => {
    const long = session(600, { pulseRate: metric("pulseRate", series(600, () => 80)) });
    const plan = composeSession(long)!;
    assert.equal(plan.compressed, true);
    assert.ok(plan.durationSeconds >= MAX_PIECE_SECONDS && plan.durationSeconds < MAX_PIECE_SECONDS + 5);
    assert.ok(plan.bars.at(-1)!.sessionMs > 580_000);
  });

  it("lets a metric shape only the bars where the session has readings of it", () => {
    // Pulse for the first 30 s only; breathing never.
    const partial = session(60, { pulseRate: metric("pulseRate", series(30, () => 80)) });
    const plan = composeSession(partial)!;
    assert.ok(plan.coverage.pulse > 0.4 && plan.coverage.pulse < 0.7);
    assert.equal(plan.coverage.breathing, 0);
    assert.equal(plan.coverage.hrv, 0);
    const last = plan.bars.at(-1)!;
    assert.equal(last.drivers.pulse, false);
    assert.equal(last.targets.pulseDrive, 0);
    const notes = generateBar({ style: "electronic", bar: plan.bars.length - 1, seed: plan.seed, targets: last.targets }).notes;
    assert.ok(!notes.some((n) => n.layer === "kick" || n.layer === "snare" || n.layer === "hat"));
  });

  it("gives the same plan every time, seeded by the session", () => {
    const a = composeSession(full)!;
    assert.deepEqual(a, composeSession(full));
    assert.equal(a.seed, full.id);
  });
});
