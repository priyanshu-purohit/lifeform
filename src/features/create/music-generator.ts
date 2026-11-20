// Turns musical targets into the notes of one bar. Pure TypeScript: no Web Audio, no React,
// no clock. Time is counted in beats, so tempo stays the audio engine's concern.
//
// - Deterministic: the same seed, bar, style and targets always give the same notes. That
//   is what makes a session composition replayable.
// - Tonal: every pitch comes from the style's scale. Pad, bass and strong-beat melody
//   notes are chord tones, so layers never clash.
// - Honest: with no pulse data there is no percussion, and with no data at all only a
//   quiet resting pad plays.

import type { MusicTargets } from "./music-mapping.ts";

export type MusicStyle = "ambient" | "organic" | "electronic";
export type PitchedLayer = "pad" | "bass" | "melody";
export type DrumLayer = "kick" | "snare" | "hat";
export type Layer = PitchedLayer | DrumLayer;

export const BEATS_PER_BAR = 4;
const STEPS_PER_BAR = 16;
const STEPS_PER_BEAT = STEPS_PER_BAR / BEATS_PER_BAR;

export interface NoteEvent {
  layer: Layer;
  /** MIDI note number (60 = middle C); null for percussion. */
  midi: number | null;
  /** Start, in beats from the start of the bar: 0 <= beat < BEATS_PER_BAR. */
  beat: number;
  /** Length in beats. A note may ring past the end of its bar. */
  beats: number;
  /** Loudness 0..1. */
  velocity: number;
}

export interface GeneratedBar {
  bar: number;
  /** Scale degree (0-based) of this bar's chord. */
  chordDegree: number;
  /** Bars in the current phrase (one phrase follows one breath), and this bar's place in it. */
  phraseBars: number;
  phrasePosition: number;
  /** Sorted by start beat. */
  notes: NoteEvent[];
}

export interface BarRequest {
  style: MusicStyle;
  /** Bar number, counted from 0. */
  bar: number;
  /** Any string. A session composition uses the session id, so it replays identically. */
  seed: string;
  targets: MusicTargets;
}

type Range = readonly [number, number];

export interface StylePreset {
  label: string;
  /** Pitch class of the tonic (0 = C ... 11 = B). */
  tonic: number;
  /** Seven semitone offsets from the tonic. */
  scale: readonly number[];
  /** Chord per step of the progression, as 0-based scale degrees. */
  progression: readonly number[];
  barsPerChord: number;
  /** Sixteenth-note steps between possible melody notes. */
  melodyGrid: number;
  /** Chance of a melody note at the lowest and highest rhythmic density. */
  melodyChance: Range;
  /** Multiplies melody note length (above 1, notes overlap). */
  melodyHold: number;
}

export const STYLES: Readonly<Record<MusicStyle, StylePreset>> = {
  // D dorian: Dm, C, G, Dm. Slow harmony, long sparse notes.
  ambient: {
    label: "Ambient",
    tonic: 2,
    scale: [0, 2, 3, 5, 7, 9, 10],
    progression: [0, 6, 3, 0],
    barsPerChord: 2,
    melodyGrid: 4,
    melodyChance: [0.2, 0.5],
    melodyHold: 2,
  },
  // G major: G, D, Em, C.
  organic: {
    label: "Organic",
    tonic: 7,
    scale: [0, 2, 4, 5, 7, 9, 11],
    progression: [0, 4, 5, 3],
    barsPerChord: 1,
    melodyGrid: 2,
    melodyChance: [0.3, 0.7],
    melodyHold: 1,
  },
  // A minor: Am, F, C, G.
  electronic: {
    label: "Electronic",
    tonic: 9,
    scale: [0, 2, 3, 5, 7, 8, 10],
    progression: [0, 5, 2, 6],
    barsPerChord: 1,
    melodyGrid: 2,
    melodyChance: [0.35, 0.8],
    melodyHold: 0.8,
  },
};

const BASS_LOW = 36;
const PAD_LOW = 48;
const PAD_HIGH = 67;
const MELODY_RANGE: Range = [60, 81];
/** Bars that share one melodic idea before a new one starts. */
const MOTIF_BARS = 2;
const MAX_PHRASE_BARS = 4;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t;

// --- Seeded randomness ---------------------------------------------------------------

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: a small, well-distributed generator. Returns values in [0, 1). */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One independent stream per layer, so a change in one layer never reshuffles another. */
const randomFor = (seed: string, bar: number, layer: string) => seededRandom(hash(`${seed}|${bar}|${layer}`));

// --- Harmony -------------------------------------------------------------------------

/** Semitones above the tonic for a scale degree, which may run past one octave. */
function degreeOffset(preset: StylePreset, degree: number): number {
  const size = preset.scale.length;
  return preset.scale[degree % size] + 12 * Math.floor(degree / size);
}

const pitchClass = (preset: StylePreset, degree: number) => (preset.tonic + degreeOffset(preset, degree)) % 12;

/** True when the MIDI note belongs to the style's scale. */
export function isInScale(style: MusicStyle, midi: number): boolean {
  const preset = STYLES[style];
  return preset.scale.includes((((midi - preset.tonic) % 12) + 12) % 12);
}

/** Pitch classes of the triad on the bar's chord (root, third, fifth). */
export function chordPitchClasses(style: MusicStyle, bar: number): number[] {
  const preset = STYLES[style];
  const degree = chordDegreeAt(preset, bar);
  return [0, 2, 4].map((step) => pitchClass(preset, degree + step));
}

function chordDegreeAt(preset: StylePreset, bar: number): number {
  const step = Math.floor(bar / preset.barsPerChord) % preset.progression.length;
  return preset.progression[step];
}

/** Bars in one phrase: the breathing cycle rounded to whole bars at the current tempo. */
export function phraseBarsFor(targets: MusicTargets): number {
  const beats = (targets.phraseSeconds * targets.tempoBpm) / 60;
  return Math.min(MAX_PHRASE_BARS, Math.max(1, Math.round(beats / BEATS_PER_BAR)));
}

// --- Generation ----------------------------------------------------------------------

export function generateBar(request: BarRequest): GeneratedBar {
  const { style, seed, targets } = request;
  const bar = Math.max(0, Math.floor(request.bar));
  const preset = STYLES[style];

  const degree = chordDegreeAt(preset, bar);
  const chordStart = bar % preset.barsPerChord === 0;
  const chordBeats = BEATS_PER_BAR * preset.barsPerChord;
  const triad = [0, 2, 4].map((step) => pitchClass(preset, degree + step));

  const phraseBars = phraseBarsFor(targets);
  const phrasePosition = bar % phraseBars;

  const variation = clamp01(targets.variation);
  const sustain = clamp01(targets.sustain);
  const clarity = clamp01(targets.clarity);
  const pulseDrive = clamp01(targets.pulseDrive);
  const breathDrive = clamp01(targets.breathDrive);
  // A rising pulse slowly fills the rhythm and lifts the level; a falling one thins it.
  const density = clamp01(targets.intensity + 0.2 * targets.trend);
  const dynamics = 0.85 + 0.15 * Math.max(-1, Math.min(1, targets.trend));

  const notes: NoteEvent[] = [];
  const add = (layer: Layer, midi: number | null, step: number, beats: number, velocity: number) => {
    const v = clamp01(velocity * dynamics);
    if (v > 0) notes.push({ layer, midi, beat: step / STEPS_PER_BEAT, beats, velocity: v });
  };

  // Pad: the ambient bed. It swells and settles across the phrase, like a breath.
  if (chordStart) {
    const swell = Math.sin((Math.PI * (phrasePosition + 0.5)) / phraseBars);
    const level = (0.35 + 0.3 * clarity) * (1 - 0.5 * breathDrive * (1 - swell));
    // Higher variation adds the seventh for a richer chord.
    const steps = variation > 0.55 ? [0, 2, 4, 6] : [0, 2, 4];
    for (const step of steps) {
      let midi = PAD_LOW + preset.tonic + degreeOffset(preset, degree + step);
      while (midi > PAD_HIGH) midi -= 12;
      add("pad", midi, 0, chordBeats, level);
    }
  }

  // Everything below needs real data. At rest only the pad plays.
  if (clarity > 0) {
    addBass();
    addMelody();
  }
  if (pulseDrive > 0) addDrums();

  notes.sort((a, b) => a.beat - b.beat);
  return { bar, chordDegree: degree, phraseBars, phrasePosition, notes };

  function addBass() {
    const random = randomFor(seed, bar, "bass");
    const root = BASS_LOW + triad[0];
    const fifth = BASS_LOW + triad[2];
    const hold = lerp([0.5, 0.95], sustain);
    if (style === "ambient") {
      if (chordStart) add("bass", root, 0, chordBeats, 0.5);
      return;
    }
    if (style === "organic") {
      const pickup = random() < 0.5;
      add("bass", root, 0, 2 * hold, 0.7);
      if (density > 0.3) add("bass", fifth, 8, 1.5 * hold, 0.55);
      if (density > 0.6 && pickup) add("bass", root, 14, 0.5 * hold, 0.5);
      return;
    }
    // Electronic: a steady eighth-note pulse on the root.
    for (let step = 0; step < STEPS_PER_BAR; step += 2) {
      const octaveUp = random() < variation * 0.4;
      const onBeat = step % STEPS_PER_BEAT === 0;
      if (!onBeat && density <= 0.35) continue;
      add("bass", root + (octaveUp ? 12 : 0), step, 0.5 * hold, onBeat ? 0.7 : 0.5);
    }
  }

  function addMelody() {
    // Bars share a melodic idea in pairs. Higher variation breaks the repeat more often.
    const fresh = randomFor(seed, bar, "vary")() < variation * 0.6;
    const motifBar = fresh ? bar : bar - (bar % MOTIF_BARS);
    const random = randomFor(seed, motifBar, fresh ? "melody-fresh" : "melody");

    const pool: number[] = [];
    for (let midi = MELODY_RANGE[0]; midi <= MELODY_RANGE[1]; midi++) {
      if (isInScale(style, midi)) pool.push(midi);
    }
    const isChordTone = (midi: number) => triad.includes(midi % 12);
    const nearestChordTone = (index: number) => {
      for (let d = 0; d < pool.length; d++) {
        if (index - d >= 0 && isChordTone(pool[index - d])) return index - d;
        if (index + d < pool.length && isChordTone(pool[index + d])) return index + d;
      }
      return index;
    };

    const maxLeap = 1 + Math.round(variation * 2);
    const length = (preset.melodyGrid / STEPS_PER_BEAT) * lerp([0.45, 1], sustain) * preset.melodyHold;
    const lastBarOfPhrase = phrasePosition === phraseBars - 1;
    const restFrom = phraseBars === 1 ? 12 : 8;
    let index = Math.floor((0.2 + 0.6 * random()) * pool.length);

    for (let step = 0; step < STEPS_PER_BAR; step += preset.melodyGrid) {
      // Always three draws per slot, so the rhythm of a motif does not depend on the targets.
      const play = random();
      const move = random();
      const passing = random();

      index += Math.round((move * 2 - 1) * maxLeap);
      index = Math.max(0, Math.min(pool.length - 1, index));

      const strong = step % STEPS_PER_BEAT === 0;
      // The end of a phrase leaves room, like the pause after breathing out.
      const breath = lastBarOfPhrase && step >= restFrom ? 1 - 0.7 * breathDrive : 1;
      const chance = lerp(preset.melodyChance, density) * (strong ? 1.25 : 1) * breath * (0.5 + 0.5 * clarity);
      if (play >= chance) continue;

      // Off the beat, higher variation lets a passing scale note through.
      if (strong || passing >= variation * 0.5) index = nearestChordTone(index);
      add("melody", pool[index], step, length, 0.5 + (strong ? 0.2 : 0) + 0.2 * targets.intensity);
    }
  }

  function addDrums() {
    const random = randomFor(seed, bar, "drums");
    const level = (0.45 + 0.55 * clamp01(targets.intensity)) * pulseDrive;
    const hit = (layer: DrumLayer, steps: readonly number[], velocity: number) => {
      for (const step of steps) add(layer, null, step, 0.25, velocity * level);
    };
    if (style === "ambient") {
      // A soft, slow thump only.
      hit("kick", [0], 0.5);
      if (density > 0.5) hit("kick", [8], 0.35);
      return;
    }
    if (style === "organic") {
      const extraKick = random() < 0.3 + 0.4 * variation;
      hit("kick", [0, 8], 0.7);
      if (extraKick) hit("kick", [10], 0.5);
      if (density > 0.4) hit("snare", [4, 12], 0.45);
      if (density > 0.25) {
        hit("hat", [0, 4, 8, 12], 0.4);
        hit("hat", [2, 6, 10, 14], 0.25);
      }
      return;
    }
    hit("kick", density < 0.3 ? [0, 8] : [0, 4, 8, 12], 0.9);
    if (density > 0.3) hit("snare", [4, 12], 0.7);
    if (density > 0.15) hit("hat", [2, 6, 10, 14], 0.45);
    if (density > 0.7) hit("hat", [1, 3, 5, 7, 9, 11, 13, 15], 0.25);
  }
}
