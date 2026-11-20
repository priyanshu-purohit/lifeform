import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MetricId } from "../measurements/measurement.types.ts";
import type { MetricSummary, SessionSummary } from "../sessions/session.types.ts";
import { buildObservations, median, type ObservationsResult } from "./observations.ts";

const T0 = 1_800_000_000_000;
const DAY = 86_400_000;

function metric(
  mean: number | null,
  trend: [number, number] | null = null,
  id: MetricId = "pulseRate",
): MetricSummary {
  return {
    metric: id,
    unit: id === "pulseRate" ? "bpm" : id === "breathingRate" ? "breaths/min" : "ms",
    sampleCount: 30,
    validCount: mean == null ? 2 : 30,
    stats: mean == null ? null : { mean, min: mean - 3, max: mean + 3, sd: 1, meanConfidence: 80 },
    trend: trend && { startMean: trend[0], endMean: trend[1] },
    firstSampleAt: T0,
    lastSampleAt: T0 + 30_000,
    series: [],
  };
}

function session(
  i: number,
  metrics: SessionSummary["metrics"],
  source: SessionSummary["source"] = "presage-sdk",
): SessionSummary {
  const startedAt = T0 + i * DAY;
  return { version: 1, id: `s${i}`, source, startedAt, endedAt: startedAt + 120_000, durationMs: 120_000, metrics };
}

function ready(r: ObservationsResult | null) {
  assert.ok(r && r.status === "ready", "expected ready observations");
  return r;
}

const texts = (r: ReturnType<typeof ready>, id: MetricId) =>
  r.metrics.find((m) => m.metric === id)!.observations.map((o) => o.text);

describe("buildObservations", () => {
  it("returns null with no sessions and asks for more below three", () => {
    assert.equal(buildObservations([]), null);
    const r = buildObservations([session(0, { pulseRate: metric(70) }), session(1, { pulseRate: metric(72) })]);
    assert.deepEqual(r, { status: "needs-more", source: "presage-sdk", have: 2, need: 3, otherSource: 0 });
  });

  it("never mixes simulated and real sessions", () => {
    const r = buildObservations([
      session(0, { pulseRate: metric(70) }, "simulation"),
      session(1, { pulseRate: metric(70) }, "simulation"),
      session(2, { pulseRate: metric(70) }),
      session(3, { pulseRate: metric(70) }),
    ]);
    assert.ok(r && r.status === "needs-more");
    assert.equal(r.have, 2);
    assert.equal(r.otherSource, 2);
  });

  it("sets the latest session against the median of earlier sessions", () => {
    const r = ready(
      buildObservations([
        session(2, { pulseRate: metric(80) }),
        session(0, { pulseRate: metric(70) }),
        session(1, { pulseRate: metric(72) }),
        session(3, { pulseRate: metric(64) }),
      ]),
    );
    assert.equal(r.latest.id, "s3");
    const pulse = r.metrics.find((m) => m.metric === "pulseRate")!;
    assert.equal(pulse.strip?.baseline, 72);
    assert.equal(
      pulse.observations[0].text,
      "Your latest average pulse, 64 bpm, was 8 bpm lower than your baseline of 72 bpm (the median of 3 earlier sessions). It is the lowest session average so far.",
    );
    assert.match(texts(r, "pulseRate").at(-1)!, /ranged from 64 to 80 bpm, a spread of 16 bpm/);
  });

  it("calls a small difference from the baseline 'about the same'", () => {
    const r = ready(
      buildObservations([
        session(0, { pulseRate: metric(70) }),
        session(1, { pulseRate: metric(72) }),
        session(2, { pulseRate: metric(71.5) }),
      ]),
    );
    assert.match(texts(r, "pulseRate")[0], /about the same as your baseline of 71 bpm/);
  });

  it("describes within-session direction and its pattern across sessions", () => {
    const r = ready(
      buildObservations([
        session(0, { pulseRate: metric(70, [74, 68]) }),
        session(1, { pulseRate: metric(70, [73, 69]) }),
        session(2, { pulseRate: metric(70, [70, 75]) }),
        session(3, { pulseRate: metric(70, [76, 70]) }),
      ]),
    );
    const t = texts(r, "pulseRate");
    assert.ok(t.includes("Within your latest session, pulse went from 76 to 70 bpm between the first and last third."));
    assert.ok(t.includes("In 3 of 4 sessions, pulse was lower in the last third than in the first third."));
  });

  it("reports coverage instead of observations when a metric has too few averages", () => {
    const r = ready(
      buildObservations([
        session(0, { pulseRate: metric(70), hrvRmssd: metric(40, null, "hrvRmssd") }),
        session(1, { pulseRate: metric(70), hrvRmssd: metric(null, null, "hrvRmssd") }),
        session(2, { pulseRate: metric(70) }),
      ]),
    );
    const hrv = r.metrics.find((m) => m.metric === "hrvRmssd")!;
    assert.equal(hrv.strip, null);
    assert.deepEqual(hrv.observations.map((o) => o.kind), ["coverage"]);
    assert.match(hrv.observations[0].text, /in 1 of 3 sessions/);
    // Breathing was never measured: no section at all, never a zero.
    assert.equal(r.metrics.find((m) => m.metric === "breathingRate"), undefined);
  });

  it("says so when the latest session has no average", () => {
    const r = ready(
      buildObservations([
        session(0, { pulseRate: metric(70) }),
        session(1, { pulseRate: metric(70) }),
        session(2, { pulseRate: metric(70) }),
        session(3, { pulseRate: metric(null) }),
      ]),
    );
    assert.match(texts(r, "pulseRate")[0], /no pulse average, so it can't be set against your baseline/);
  });

  it("uses only descriptive words", () => {
    const r = ready(
      buildObservations(
        [0, 1, 2, 3, 4].map((i) =>
          session(i, {
            pulseRate: metric(60 + i * 5, [70, 60 + i]),
            breathingRate: metric(12 + i, [14, 12], "breathingRate"),
            hrvRmssd: metric(30 + i * 8, [30, 40], "hrvRmssd"),
          }),
        ),
      ),
    );
    for (const m of r.metrics)
      for (const o of m.observations)
        assert.doesNotMatch(o.text, /stress|calm|relax|health|better|worse|anxi|normal|good|bad|fit/i);
  });
});

describe("median", () => {
  it("handles odd and even counts", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });
});

describe("observation wording", () => {
  it("keeps HRV capitalised, skips 'lowest so far' for tiny changes, and matches the shown spread", () => {
    const r = ready(
      buildObservations([
        session(0, { pulseRate: metric(70.4), hrvRmssd: metric(50, null, "hrvRmssd") }),
        session(1, { pulseRate: metric(86.9), hrvRmssd: metric(52, null, "hrvRmssd") }),
        session(2, { pulseRate: metric(70), hrvRmssd: metric(49, null, "hrvRmssd") }),
      ]),
    );
    const pulse = texts(r, "pulseRate");
    assert.match(pulse[0], /9 bpm lower .* It is the lowest session average so far\./);
    assert.match(pulse.at(-1)!, /ranged from 70 to 87 bpm, a spread of 17 bpm/);
    assert.match(texts(r, "hrvRmssd")[0], /^Your latest average HRV/);

    const wobble = ready(
      buildObservations([
        session(0, { pulseRate: metric(71) }),
        session(1, { pulseRate: metric(71.5) }),
        session(2, { pulseRate: metric(70) }),
      ]),
    );
    assert.match(texts(wobble, "pulseRate")[0], /about the same/);
    assert.doesNotMatch(texts(wobble, "pulseRate")[0], /lowest/);
  });
});
