import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESTING_MUSIC, type MusicTargets } from "./music-mapping.ts";
import {
  BEATS_PER_BAR,
  STYLES,
  chordName,
  chordPitchClasses,
  generateBar,
  isInScale,
  phraseBarsFor,
  type Layer,
  type MusicStyle,
  type NoteEvent,
} from "./music-generator.ts";

const STYLE_IDS: readonly MusicStyle[] = ["ambient", "organic", "electronic"];
const DRUMS: readonly Layer[] = ["kick", "snare", "hat"];
const BARS = 32;

/** Every metric driving at full trust. */
const FULL: MusicTargets = {
  tempoBpm: 90,
  intensity: 0.6,
  pulseDrive: 1,
  phraseSeconds: 5,
  sustain: 0.6,
  breathDrive: 1,
  variation: 0.5,
  trend: 0,
  clarity: 1,
};

const bars = (style: MusicStyle, targets: MusicTargets, seed = "session-1") =>
  Array.from({ length: BARS }, (_, bar) => generateBar({ style, bar, seed, targets }));
const allNotes = (style: MusicStyle, targets: MusicTargets, seed?: string) =>
  bars(style, targets, seed).flatMap((b) => b.notes);
const count = (notes: NoteEvent[], layers: readonly Layer[]) => notes.filter((n) => layers.includes(n.layer)).length;
const melodyBeats = (style: MusicStyle, bar: number, targets: MusicTargets) =>
  generateBar({ style, bar, seed: "session-1", targets })
    .notes.filter((n) => n.layer === "melody")
    .map((n) => n.beat);

describe("generateBar", () => {
  it("is deterministic for the same seed and differs for another seed", () => {
    for (const style of STYLE_IDS) {
      assert.deepEqual(bars(style, FULL), bars(style, FULL));
      assert.notDeepEqual(bars(style, FULL, "session-1"), bars(style, FULL, "session-2"));
    }
  });

  it("keeps every pitch inside the style's scale", () => {
    for (const style of STYLE_IDS) {
      for (const variation of [0, 0.5, 1]) {
        for (const note of allNotes(style, { ...FULL, variation })) {
          if (note.midi != null) assert.ok(isInScale(style, note.midi), `${style} note ${note.midi}`);
        }
      }
    }
  });

  it("uses chord tones for bass and strong-beat melody, and for the pad without a seventh", () => {
    for (const style of STYLE_IDS) {
      for (const generated of bars(style, { ...FULL, variation: 0.4 })) {
        const chord = chordPitchClasses(style, generated.bar);
        for (const note of generated.notes) {
          if (note.midi == null) continue;
          const anchored = note.layer !== "melody" || Number.isInteger(note.beat);
          if (anchored) assert.ok(chord.includes(note.midi % 12), `${style} ${note.layer} ${note.midi}`);
        }
      }
    }
  });

  it("adds the seventh to the pad only at higher variation", () => {
    const padSize = (variation: number) =>
      generateBar({ style: "organic", bar: 0, seed: "s", targets: { ...FULL, variation } }).notes.filter(
        (n) => n.layer === "pad",
      ).length;
    assert.equal(padSize(0.2), 3);
    assert.equal(padSize(0.9), 4);
  });

  it("gives well-formed, sorted notes", () => {
    for (const style of STYLE_IDS) {
      for (const generated of bars(style, { ...FULL, trend: 1, intensity: 1 })) {
        let previous = 0;
        for (const note of generated.notes) {
          assert.ok(note.beat >= previous && note.beat < BEATS_PER_BAR);
          assert.ok(note.beats > 0);
          assert.ok(note.velocity > 0 && note.velocity <= 1);
          assert.equal(note.midi == null, DRUMS.includes(note.layer));
          previous = note.beat;
        }
      }
    }
  });

  it("plays only a quiet pad when nothing is being measured", () => {
    for (const style of STYLE_IDS) {
      const notes = allNotes(style, RESTING_MUSIC);
      assert.ok(notes.length > 0);
      assert.ok(notes.every((n) => n.layer === "pad"));
    }
  });

  it("has no percussion without pulse data, and has it with pulse data", () => {
    for (const style of STYLE_IDS) {
      assert.equal(count(allNotes(style, { ...FULL, pulseDrive: 0 }), DRUMS), 0);
      assert.ok(count(allNotes(style, FULL), DRUMS) > 0);
    }
  });

  it("scales percussion loudness with trust in the pulse", () => {
    const kick = (pulseDrive: number) =>
      generateBar({ style: "electronic", bar: 0, seed: "s", targets: { ...FULL, pulseDrive } }).notes.find(
        (n) => n.layer === "kick",
      )!.velocity;
    assert.ok(kick(0.3) < kick(1));
  });

  it("makes the rhythm busier as intensity rises", () => {
    for (const style of STYLE_IDS) {
      const at = (intensity: number) => allNotes(style, { ...FULL, intensity }).length;
      assert.ok(at(0.1) < at(0.5) && at(0.5) < at(0.95), style);
    }
  });

  it("lets a rising pulse trend fill the arrangement and lift the level", () => {
    const at = (trend: number) => allNotes("electronic", { ...FULL, intensity: 0.25, trend });
    assert.ok(at(1).length > at(-1).length);
    const pad = (trend: number) => at(trend).find((n) => n.layer === "pad")!.velocity;
    assert.ok(pad(1) > pad(-1));
  });

  it("makes notes longer as sustain rises", () => {
    for (const style of STYLE_IDS) {
      const length = (sustain: number) => allNotes(style, { ...FULL, sustain }).find((n) => n.layer === "melody")!.beats;
      assert.ok(length(0.1) < length(0.9), style);
    }
  });

  it("repeats a melodic rhythm in bar pairs when there is no variation", () => {
    const steady = { ...FULL, variation: 0, breathDrive: 0 };
    for (const style of STYLE_IDS) {
      for (const bar of [0, 2, 4, 6]) {
        assert.deepEqual(melodyBeats(style, bar, steady), melodyBeats(style, bar + 1, steady));
      }
    }
  });

  it("breaks the repeat more often as variation rises", () => {
    const repeats = (variation: number) => {
      let same = 0;
      for (let bar = 0; bar < 200; bar += 2) {
        const targets = { ...FULL, variation, breathDrive: 0 };
        const a = melodyBeats("organic", bar, targets);
        const b = melodyBeats("organic", bar + 1, targets);
        if (JSON.stringify(a) === JSON.stringify(b)) same++;
      }
      return same;
    };
    assert.equal(repeats(0), 100);
    assert.ok(repeats(1) < 80);
  });

  it("leaves room at the end of a phrase when breathing drives it", () => {
    // 5 s phrases at 96 bpm are 2 bars: the rest falls in the second half of odd bars.
    const late = (breathDrive: number) =>
      bars("organic", { ...FULL, tempoBpm: 96, breathDrive })
        .filter((b) => b.phrasePosition === b.phraseBars - 1)
        .flatMap((b) => b.notes)
        .filter((n) => n.layer === "melody" && n.beat >= 2).length;
    assert.ok(late(1) < late(0));
  });

  it("follows the chord progression and loops it", () => {
    for (const style of STYLE_IDS) {
      const { progression, barsPerChord } = STYLES[style];
      const loop = progression.length * barsPerChord;
      for (let bar = 0; bar < loop; bar++) {
        const degree = generateBar({ style, bar, seed: "s", targets: FULL }).chordDegree;
        assert.equal(degree, progression[Math.floor(bar / barsPerChord)]);
        assert.equal(generateBar({ style, bar: bar + loop, seed: "s", targets: FULL }).chordDegree, degree);
      }
    }
  });
});

describe("chordName", () => {
  it("names each style's progression", () => {
    const names = (style: MusicStyle) => STYLES[style].progression.map((degree) => chordName(style, degree));
    assert.deepEqual(names("ambient"), ["Dm", "C", "G", "Dm"]);
    assert.deepEqual(names("organic"), ["G", "D", "Em", "C"]);
    assert.deepEqual(names("electronic"), ["Am", "F", "C", "G"]);
  });
});

describe("phraseBarsFor", () => {
  it("rounds one breath to whole bars at the current tempo, between 1 and 4", () => {
    const at = (phraseSeconds: number, tempoBpm: number) => phraseBarsFor({ ...FULL, phraseSeconds, tempoBpm });
    assert.equal(at(4, 60), 1);
    assert.equal(at(5, 96), 2);
    assert.equal(at(8, 90), 3);
    assert.equal(at(15, 120), 4);
    assert.equal(at(2.5, 60), 1);
  });
});
