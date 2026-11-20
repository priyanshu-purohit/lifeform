// The sound itself needs a real Web Audio implementation, which Node does not have. These
// tests cover the pure rules; the synthesizer and scheduler are checked in the app.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IDLE_STATUS, MAX_TEMPO_STEP, createLiveEngine, midiToHz, nextTempo, toneCutoffHz } from "./audio-engine.ts";
import { RESTING_MUSIC } from "./music-mapping.ts";

describe("midiToHz", () => {
  it("uses concert pitch", () => {
    assert.equal(midiToHz(69), 440);
    assert.equal(midiToHz(57), 220);
    assert.ok(Math.abs(midiToHz(60) - 261.6256) < 0.001);
  });
});

describe("nextTempo", () => {
  it("moves toward the target by a limited step per bar", () => {
    assert.equal(nextTempo(72, 120), 72 + MAX_TEMPO_STEP);
    assert.equal(nextTempo(100, 60), 100 - MAX_TEMPO_STEP);
    assert.equal(nextTempo(80, 81), 81);
    assert.equal(nextTempo(80, 80), 80);
  });
});

describe("toneCutoffHz", () => {
  it("opens the filter as more data drives the music", () => {
    const rest = toneCutoffHz(RESTING_MUSIC);
    const full = toneCutoffHz({ ...RESTING_MUSIC, clarity: 1, intensity: 1 });
    assert.ok(rest >= 1200 && rest < full);
    assert.equal(full, 12000);
  });
});

describe("createLiveEngine", () => {
  const drivers = { pulse: false, breathing: false, hrv: false };
  const engine = () => createLiveEngine(() => ({ targets: RESTING_MUSIC, drivers }));

  it("starts idle without touching Web Audio", () => {
    const live = engine();
    assert.deepEqual(live.getStatus(), IDLE_STATUS);
    assert.equal(live.getAnalyser(), null);
    live.stop();
  });

  it("keeps style and volume choices made while idle, and notifies listeners", () => {
    const live = engine();
    let calls = 0;
    const unsubscribe = live.subscribe(() => calls++);
    live.setStyle("electronic");
    live.setStyle("electronic");
    live.setVolume(1.7);
    assert.equal(live.getStatus().style, "electronic");
    assert.equal(live.getStatus().volume, 1);
    assert.equal(calls, 2);
    unsubscribe();
    live.setVolume(0.2);
    assert.equal(calls, 2);
  });

  it("reports a clear error when audio is unavailable", async () => {
    const live = engine();
    await live.play();
    assert.equal(live.getStatus().state, "idle");
    assert.match(live.getStatus().error ?? "", /Audio could not start/);
  });
});
