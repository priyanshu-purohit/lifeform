import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  Freshness,
  MeasurementSample,
  MeasurementSnapshot,
  MetricId,
  MetricState,
  Unit,
  Validity,
} from "../measurements/measurement.types.ts";
import { MUSIC_MAPPING, RESTING_MUSIC, mapToMusic, musicTargets, recentTrend } from "./music-mapping.ts";

const T0 = 1_800_000_000_000;
const UNITS: Record<MetricId, Unit> = { pulseRate: "bpm", breathingRate: "breaths/min", hrvRmssd: "ms" };

function sample(metric: MetricId, value: number, timestamp = T0, validity: Validity = "valid"): MeasurementSample {
  return { metric, value, unit: UNITS[metric], timestamp, confidence: 100, stable: true, validity, source: "presage-sdk" };
}

function waiting(metric: MetricId): MetricState {
  return { metric, unit: UNITS[metric], freshness: "waiting", latest: null, smoothed: null, history: [] };
}

/** A metric at full trust: live, SDK-stable, confidence 100. */
function reading(
  metric: MetricId,
  value: number,
  opts: { freshness?: Freshness; validity?: Validity; history?: MeasurementSample[] } = {},
): MetricState {
  const latest = sample(metric, value, T0, opts.validity);
  return {
    metric,
    unit: UNITS[metric],
    freshness: opts.freshness ?? "live",
    latest,
    smoothed: value,
    history: opts.history ?? [latest],
  };
}

function snapshot(metrics: Partial<Record<MetricId, MetricState>>, endedAt: number | null = null): MeasurementSnapshot {
  return {
    status: "running",
    session: { id: "s1", source: "presage-sdk", startedAt: T0, endedAt },
    guidance: null,
    error: null,
    metrics: {
      pulseRate: metrics.pulseRate ?? waiting("pulseRate"),
      breathingRate: metrics.breathingRate ?? waiting("breathingRate"),
      hrvRmssd: metrics.hrvRmssd ?? waiting("hrvRmssd"),
    },
  };
}

/** One pulse sample per second: `before` bpm for the earlier window, `after` for the recent one. */
function pulseHistory(before: number, after: number, perWindow = 30): MeasurementSample[] {
  const out: MeasurementSample[] = [];
  for (let i = 0; i < perWindow * 2; i++) {
    out.push(sample("pulseRate", i < perWindow ? before : after, T0 + (i + 1) * 1_000));
  }
  return out;
}

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

describe("mapToMusic", () => {
  it("rests when there is no session or the session has ended", () => {
    const none: MeasurementSnapshot = { ...snapshot({}), session: null };
    assert.deepEqual(mapToMusic(none).targets, RESTING_MUSIC);
    const ended = mapToMusic(snapshot({ pulseRate: reading("pulseRate", 100) }, T0 + 60_000));
    assert.deepEqual(ended.targets, RESTING_MUSIC);
    assert.deepEqual(ended.drivers, { pulse: false, breathing: false, hrv: false });
  });

  it("maps pulse onto tempo and intensity inside the tempo bounds", () => {
    const at = (bpm: number) => mapToMusic(snapshot({ pulseRate: reading("pulseRate", bpm) })).targets;
    near(at(55).tempoBpm, 60);
    near(at(110).tempoBpm, 120);
    near(at(82.5).tempoBpm, 90);
    near(at(82.5).intensity, 0.5);
    near(at(200).tempoBpm, 120);
    near(at(30).tempoBpm, 60);
    near(at(110).pulseDrive, 1);
  });

  it("drives nothing from a metric that has no reading", () => {
    const { targets, drivers } = mapToMusic(snapshot({ breathingRate: reading("breathingRate", 12) }));
    assert.equal(targets.pulseDrive, 0);
    assert.equal(targets.tempoBpm, RESTING_MUSIC.tempoBpm);
    assert.equal(targets.intensity, RESTING_MUSIC.intensity);
    assert.equal(targets.variation, RESTING_MUSIC.variation);
    assert.equal(targets.trend, 0);
    assert.deepEqual(drivers, { pulse: false, breathing: true, hrv: false });
  });

  it("maps breathing onto phrase length and note length", () => {
    const at = (brpm: number) => mapToMusic(snapshot({ breathingRate: reading("breathingRate", brpm) })).targets;
    near(at(6).phraseSeconds, 10);
    near(at(6).sustain, 1);
    near(at(24).sustain, 0);
    near(at(60).phraseSeconds, 2.5);
    near(at(2).phraseSeconds, 15);
    assert.ok(at(8).sustain > at(18).sustain, "slower breathing gives longer notes");
  });

  it("uses HRV for variation only when it is available", () => {
    const pulse = reading("pulseRate", 70);
    const without = mapToMusic(snapshot({ pulseRate: pulse }));
    assert.equal(without.targets.variation, RESTING_MUSIC.variation);
    assert.equal(without.drivers.hrv, false);
    const withHrv = mapToMusic(snapshot({ pulseRate: pulse, hrvRmssd: reading("hrvRmssd", 90) }));
    near(withHrv.targets.variation, 1);
    assert.equal(withHrv.drivers.hrv, true);
  });

  it("gives stale and unsettled readings less influence", () => {
    const tempo = (state: MetricState) => mapToMusic(snapshot({ pulseRate: state })).targets;
    const live = tempo(reading("pulseRate", 110));
    const stale = tempo(reading("pulseRate", 110, { freshness: "stale" }));
    const unsettled = tempo(reading("pulseRate", 110, { validity: "unsettled" }));
    assert.ok(stale.pulseDrive < unsettled.pulseDrive && unsettled.pulseDrive < live.pulseDrive);
    assert.ok(stale.tempoBpm > RESTING_MUSIC.tempoBpm && stale.tempoBpm < unsettled.tempoBpm);
    assert.ok(unsettled.tempoBpm < live.tempoBpm);
  });

  it("reports full clarity only when every metric drives", () => {
    const all = mapToMusic(
      snapshot({
        pulseRate: reading("pulseRate", 70),
        breathingRate: reading("breathingRate", 12),
        hrvRmssd: reading("hrvRmssd", 40),
      }),
    );
    near(all.targets.clarity, 1);
    near(mapToMusic(snapshot({ pulseRate: reading("pulseRate", 70) })).targets.clarity, 0.55);
    assert.equal(mapToMusic(snapshot({})).targets.clarity, 0);
  });

  it("turns a rising or falling pulse into a trend", () => {
    const trend = (before: number, after: number) =>
      mapToMusic(snapshot({ pulseRate: reading("pulseRate", after, { history: pulseHistory(before, after) }) }))
        .targets.trend;
    near(trend(70, 74), 0.5);
    near(trend(74, 70), -0.5);
    near(trend(60, 90), 1);
    assert.equal(trend(70, 70), 0);
  });

  it("accepts a retuned mapping", () => {
    const config = { ...MUSIC_MAPPING, tempoBounds: [80, 100] as const };
    near(mapToMusic(snapshot({ pulseRate: reading("pulseRate", 110) }), config).targets.tempoBpm, 100);
  });
});

describe("musicTargets", () => {
  it("ignores a drive when the value itself is missing", () => {
    const { targets, drivers } = musicTargets({
      pulseBpm: null,
      breathsPerMin: null,
      hrvMs: null,
      pulseDrive: 1,
      breathDrive: 1,
      hrvDrive: 1,
      pulseTrendBpm: 6,
    });
    assert.deepEqual(targets, RESTING_MUSIC);
    assert.deepEqual(drivers, { pulse: false, breathing: false, hrv: false });
  });
});

describe("recentTrend", () => {
  it("is null without enough samples in both windows", () => {
    assert.equal(recentTrend([], 30_000, 5), null);
    assert.equal(recentTrend([sample("pulseRate", 70)], 30_000, 5), null);
    // 30 s of data fills the recent window only.
    assert.equal(recentTrend(pulseHistory(70, 80).slice(30), 30_000, 5), null);
  });

  it("is the difference between the two window means", () => {
    assert.equal(recentTrend(pulseHistory(70, 76), 30_000, 5), 6);
  });
});
