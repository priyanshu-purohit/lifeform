// Turns generated notes into sound with the Web Audio API. Two parts:
//
// - createInstrument: the synthesizer. It is written against BaseAudioContext, so the same
//   code plays live (AudioContext) and renders to a file (OfflineAudioContext).
// - createMusicEngine: the scheduler. Once per bar it schedules that bar's notes on the
//   audio clock. In Live Mode it reads the current musical targets, so measurements can
//   update at any time but the music only changes at a bar line, and every change glides.
//   In Session Mode it plays a plan made from a saved session, bar by bar, to its end.
//
// Nothing here runs at import time, so the module is safe to load during server rendering.
// An AudioContext is created only inside play(), which must be called from a user gesture.

import {
  BEATS_PER_BAR,
  generateBar,
  type GeneratedBar,
  type MusicStyle,
  type NoteEvent,
} from "./music-generator.ts";
import type { MusicDrivers, MusicTargets } from "./music-mapping.ts";
import { nextTempo, type SessionPlan } from "./session-music.ts";

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Overall brightness: more data and a higher pulse open the filter. Returns Hz. */
export function toneCutoffHz(targets: MusicTargets): number {
  const openness = Math.max(0, Math.min(1, 0.2 + 0.5 * targets.clarity + 0.3 * targets.intensity));
  return 1200 * 10 ** openness;
}

// --- Sounds --------------------------------------------------------------------------

interface Tone {
  wave: OscillatorType;
  /** Cents. Above 0, two oscillators are spread by this much for a wider sound. */
  detune: number;
  /** Seconds to reach full level. */
  attack: number;
  /** Seconds to settle from full level to the sustain level. */
  decay: number;
  /** Held level as a share of full level. */
  sustain: number;
  /** Seconds to fade after the note ends. */
  release: number;
  /** Low-pass filter in Hz, or null for none. */
  cutoff: number | null;
  level: number;
}

interface Kick {
  fromHz: number;
  toHz: number;
  decay: number;
  level: number;
}

interface NoiseHit {
  filter: BiquadFilterType;
  hz: number;
  decay: number;
  level: number;
}

interface Sound {
  pad: Tone;
  bass: Tone;
  melody: Tone;
  kick: Kick;
  snare: NoiseHit;
  hat: NoiseHit;
  /** How much of the pad and melody is sent to the reverb. */
  reverb: number;
}

const SOUNDS: Readonly<Record<MusicStyle, Sound>> = {
  ambient: {
    pad: { wave: "triangle", detune: 7, attack: 1.4, decay: 1, sustain: 0.85, release: 2.5, cutoff: 1400, level: 0.16 },
    bass: { wave: "sine", detune: 0, attack: 0.08, decay: 0.5, sustain: 0.8, release: 0.8, cutoff: null, level: 0.34 },
    melody: { wave: "sine", detune: 5, attack: 0.02, decay: 0.9, sustain: 0.25, release: 1.6, cutoff: null, level: 0.2 },
    kick: { fromHz: 70, toHz: 38, decay: 0.5, level: 0.5 },
    snare: { filter: "bandpass", hz: 2000, decay: 0.1, level: 0.2 },
    hat: { filter: "highpass", hz: 7000, decay: 0.04, level: 0.1 },
    reverb: 0.55,
  },
  organic: {
    pad: { wave: "triangle", detune: 5, attack: 0.5, decay: 0.8, sustain: 0.8, release: 1.2, cutoff: 2200, level: 0.13 },
    bass: { wave: "triangle", detune: 0, attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.25, cutoff: 700, level: 0.36 },
    melody: { wave: "triangle", detune: 3, attack: 0.005, decay: 0.22, sustain: 0.2, release: 0.5, cutoff: 3200, level: 0.26 },
    kick: { fromHz: 110, toHz: 48, decay: 0.28, level: 0.7 },
    snare: { filter: "bandpass", hz: 2400, decay: 0.09, level: 0.3 },
    hat: { filter: "highpass", hz: 6000, decay: 0.05, level: 0.16 },
    reverb: 0.28,
  },
  electronic: {
    pad: { wave: "sawtooth", detune: 9, attack: 0.25, decay: 0.6, sustain: 0.75, release: 0.7, cutoff: 1600, level: 0.09 },
    bass: { wave: "sawtooth", detune: 0, attack: 0.005, decay: 0.12, sustain: 0.5, release: 0.08, cutoff: 520, level: 0.3 },
    melody: { wave: "square", detune: 6, attack: 0.005, decay: 0.15, sustain: 0.4, release: 0.2, cutoff: 2600, level: 0.12 },
    kick: { fromHz: 150, toHz: 45, decay: 0.3, level: 0.9 },
    snare: { filter: "bandpass", hz: 1800, decay: 0.16, level: 0.42 },
    hat: { filter: "highpass", hz: 8000, decay: 0.04, level: 0.2 },
    reverb: 0.18,
  },
};

/** Repeatable noise, so an exported file is the same every time it is rendered. */
function noiseSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 4294967296) * 2 - 1;
  };
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const next = noiseSource(1);
  for (let i = 0; i < data.length; i++) data[i] = next();
  return buffer;
}

/** A simple room: noise that dies away over a few seconds. */
function reverbImpulse(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 2.8);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    const next = noiseSource(7 + channel);
    for (let i = 0; i < length; i++) data[i] = next() * (1 - i / length) ** 3;
  }
  return buffer;
}

// --- Instrument ----------------------------------------------------------------------

export interface Instrument {
  /** Tap for visualisation. */
  readonly analyser: AnalyserNode;
  /** Schedules every note of a bar. `time` is the bar's start on the context clock. */
  playBar(generated: GeneratedBar, style: MusicStyle, time: number, secondsPerBeat: number): void;
  /** Glides brightness, the breathing swell and the reverb toward the targets. */
  express(style: MusicStyle, targets: MusicTargets, time: number): void;
  setVolume(volume: number, time: number): void;
  fadeOut(time: number, seconds: number): void;
  dispose(): void;
}

export function createInstrument(ctx: BaseAudioContext, volume: number): Instrument {
  const master = ctx.createGain();
  master.gain.value = volume;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  // A safety limiter, so stacked layers never clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 10;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3000;
  tone.Q.value = 0.3;
  const reverb = ctx.createConvolver();
  reverb.buffer = reverbImpulse(ctx);
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.3;

  const padBus = ctx.createGain();
  const bassBus = ctx.createGain();
  const melodyBus = ctx.createGain();
  const drumBus = ctx.createGain();

  padBus.connect(tone);
  bassBus.connect(tone);
  melodyBus.connect(tone);
  padBus.connect(reverbSend);
  melodyBus.connect(reverbSend);
  reverbSend.connect(reverb);
  reverb.connect(limiter);
  tone.connect(limiter);
  // Percussion skips the tone filter so it stays crisp.
  drumBus.connect(limiter);
  limiter.connect(master);
  master.connect(analyser);
  analyser.connect(ctx.destination);

  // The breathing swell: a slow wave on the pad level, at the measured breathing rate.
  // It follows the rate, not the timing of individual breaths.
  const breath = ctx.createOscillator();
  breath.type = "sine";
  breath.frequency.value = 1 / 8;
  const breathDepth = ctx.createGain();
  breathDepth.gain.value = 0;
  breath.connect(breathDepth);
  breathDepth.connect(padBus.gain);
  breath.start();

  const noise = noiseBuffer(ctx);

  function pitched(tone: Tone, midi: number, start: number, seconds: number, velocity: number, bus: AudioNode) {
    const detunes = tone.detune > 0 ? [-tone.detune, tone.detune] : [0];
    const peak = (tone.level * velocity) / Math.sqrt(detunes.length);
    const end = Math.max(start + tone.attack, start + seconds);
    const stopAt = end + tone.release * 2;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(peak, start + tone.attack);
    amp.gain.setTargetAtTime(peak * tone.sustain, start + tone.attack, tone.decay / 3);
    amp.gain.setTargetAtTime(0, end, tone.release / 3);

    let out: AudioNode = amp;
    if (tone.cutoff != null) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = tone.cutoff;
      amp.connect(filter);
      out = filter;
    }
    out.connect(bus);

    detunes.forEach((cents, i) => {
      const osc = ctx.createOscillator();
      osc.type = tone.wave;
      osc.frequency.value = midiToHz(midi);
      osc.detune.value = cents;
      osc.connect(amp);
      osc.start(start);
      osc.stop(stopAt);
      if (i === 0) osc.onended = () => out.disconnect();
    });
  }

  function kick(sound: Kick, start: number, velocity: number) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(sound.fromHz, start);
    osc.frequency.exponentialRampToValueAtTime(sound.toHz, start + 0.12);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(sound.level * velocity, start + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + sound.decay);
    osc.connect(amp);
    amp.connect(drumBus);
    osc.start(start);
    osc.stop(start + sound.decay + 0.02);
    osc.onended = () => amp.disconnect();
  }

  function noiseHit(sound: NoiseHit, start: number, velocity: number) {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = sound.filter;
    filter.frequency.value = sound.hz;
    filter.Q.value = 0.7;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(sound.level * velocity, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + sound.decay);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(drumBus);
    source.start(start, 0, sound.decay + 0.02);
    source.onended = () => amp.disconnect();
  }

  function playNote(note: NoteEvent, sound: Sound, start: number, seconds: number) {
    switch (note.layer) {
      case "pad":
        if (note.midi != null) pitched(sound.pad, note.midi, start, seconds, note.velocity, padBus);
        break;
      case "bass":
        if (note.midi != null) pitched(sound.bass, note.midi, start, seconds, note.velocity, bassBus);
        break;
      case "melody":
        if (note.midi != null) pitched(sound.melody, note.midi, start, seconds, note.velocity, melodyBus);
        break;
      case "kick":
        kick(sound.kick, start, note.velocity);
        break;
      case "snare":
        noiseHit(sound.snare, start, note.velocity);
        break;
      case "hat":
        noiseHit(sound.hat, start, note.velocity);
        break;
    }
  }

  return {
    analyser,
    playBar(generated, style, time, secondsPerBeat) {
      const sound = SOUNDS[style];
      for (const note of generated.notes) {
        playNote(note, sound, time + note.beat * secondsPerBeat, note.beats * secondsPerBeat);
      }
    },
    express(style, targets, time) {
      const depth = 0.3 * Math.max(0, Math.min(1, targets.breathDrive));
      tone.frequency.setTargetAtTime(toneCutoffHz(targets), time, 0.6);
      breath.frequency.setTargetAtTime(1 / targets.phraseSeconds, time, 1.5);
      breathDepth.gain.setTargetAtTime(depth, time, 1);
      padBus.gain.setTargetAtTime(1 - depth, time, 1);
      reverbSend.gain.setTargetAtTime(SOUNDS[style].reverb, time, 0.5);
    },
    setVolume(value, time) {
      master.gain.setTargetAtTime(value, time, 0.03);
    },
    fadeOut(time, seconds) {
      master.gain.cancelScheduledValues(time);
      master.gain.setTargetAtTime(0, time, seconds / 4);
    },
    dispose() {
      breath.stop();
      breath.disconnect();
      analyser.disconnect();
      master.disconnect();
    },
  };
}

// --- Live engine ---------------------------------------------------------------------

export type EngineState = "idle" | "playing" | "paused";

/** Everything the UI reads. Immutable: a new object on every change. */
export interface EngineStatus {
  state: EngineState;
  /** "session" while a saved session's plan is loaded; otherwise live measurements. */
  mode: "live" | "session";
  /** Bars in the loaded session plan, or null in Live Mode (which has no end). */
  totalBars: number | null;
  /** true after a session piece has played to its end; cleared by the next play. */
  finished: boolean;
  style: MusicStyle;
  /** 0..1. */
  volume: number;
  /** The bar most recently scheduled, or null when idle. */
  bar: number | null;
  /** The tempo actually playing (it glides toward the target), or null when idle. */
  tempoBpm: number | null;
  chordDegree: number | null;
  phraseBars: number | null;
  error: string | null;
}

export const IDLE_STATUS: EngineStatus = Object.freeze({
  state: "idle",
  mode: "live",
  totalBars: null,
  finished: false,
  style: "ambient",
  volume: 0.8,
  bar: null,
  tempoBpm: null,
  chordDegree: null,
  phraseBars: null,
  error: null,
});

export interface MusicEngine {
  subscribe(listener: () => void): () => void;
  getStatus(): EngineStatus;
  /** Starts, or resumes after a pause. Call from a user gesture (browser audio policy). */
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): void;
  /**
   * Loads a session plan to play instead of live measurements, or null to return to Live
   * Mode. Stops whatever is playing.
   */
  setPlan(plan: SessionPlan | null): void;
  /** Takes effect at the next bar line. */
  setStyle(style: MusicStyle): void;
  setVolume(volume: number): void;
  /** The live signal for visualisation, or null when idle. */
  getAnalyser(): AnalyserNode | null;
}

/** How far ahead of the audio clock a bar is scheduled, and how often that is checked. */
const LOOKAHEAD_S = 0.3;
const TICK_MS = 25;
const START_DELAY_S = 0.1;
const STOP_FADE_S = 0.12;
/** After the last bar of a session piece, its notes ring out this long before the stop. */
export const ENDING_TAIL_S = 2.5;

/**
 * @param readTargets Called once per bar in Live Mode for the current musical targets.
 * Keeping it a callback leaves the engine independent of where measurements come from.
 */
export function createMusicEngine(
  readTargets: () => { targets: MusicTargets; drivers: MusicDrivers },
): MusicEngine {
  let status: EngineStatus = IDLE_STATUS;
  const listeners = new Set<() => void>();
  let ctx: AudioContext | null = null;
  let instrument: Instrument | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let nextBarTime = 0;
  let bar = 0;
  let tempo = 0;
  let seed = "";
  let plan: SessionPlan | null = null;
  /** Audio-clock time at which a finished session piece stops, or null while bars remain. */
  let endAt: number | null = null;

  /** What survives a stop: the user's choices and the loaded plan. */
  const idle = (): EngineStatus => ({
    ...IDLE_STATUS,
    style: status.style,
    volume: status.volume,
    mode: plan ? "session" : "live",
    totalBars: plan ? plan.bars.length : null,
  });

  function set(patch: Partial<EngineStatus>) {
    status = { ...status, ...patch };
    for (const listener of listeners) listener();
  }

  function scheduleBar(synth: Instrument) {
    let targets: MusicTargets;
    if (plan) {
      const planned = plan.bars[bar];
      if (!planned) {
        // The piece is over: let the last notes ring, then stop (see tick).
        endAt = nextBarTime + ENDING_TAIL_S;
        return;
      }
      targets = planned.targets;
      tempo = planned.tempoBpm;
    } else {
      targets = readTargets().targets;
      tempo = bar === 0 ? targets.tempoBpm : nextTempo(tempo, targets.tempoBpm);
    }
    const secondsPerBeat = 60 / tempo;
    const style = status.style;
    // The generator plans phrases at the tempo that is really playing.
    const generated = generateBar({ style, bar, seed, targets: { ...targets, tempoBpm: tempo } });
    synth.express(style, targets, nextBarTime);
    synth.playBar(generated, style, nextBarTime, secondsPerBeat);
    set({ bar, tempoBpm: tempo, chordDegree: generated.chordDegree, phraseBars: generated.phraseBars });
    nextBarTime += BEATS_PER_BAR * secondsPerBeat;
    bar++;
  }

  function tick() {
    if (!ctx || !instrument) return;
    if (endAt != null) {
      if (ctx.currentTime >= endAt) {
        release(true);
        set({ ...idle(), finished: true });
      }
      return;
    }
    // After a long stall (sleep, a throttled timer) continue from now instead of rushing
    // through every missed bar.
    if (nextBarTime < ctx.currentTime - 0.05) nextBarTime = ctx.currentTime + 0.05;
    while (endAt == null && nextBarTime < ctx.currentTime + LOOKAHEAD_S) scheduleBar(instrument);
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(tick, TICK_MS);
  }

  function stopTimer() {
    if (timer != null) clearInterval(timer);
    timer = null;
  }

  function release(fade: boolean) {
    stopTimer();
    const audio = ctx;
    const synth = instrument;
    ctx = null;
    instrument = null;
    if (!audio || !synth) return;
    const close = () => {
      synth.dispose();
      void audio.close().catch(() => {});
    };
    if (fade && audio.state === "running") {
      synth.fadeOut(audio.currentTime, STOP_FADE_S);
      setTimeout(close, STOP_FADE_S * 1000 + 150);
    } else {
      close();
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getStatus: () => status,

    async play() {
      if (status.state === "playing") return;
      try {
        if (status.state === "paused" && ctx) {
          const audio = ctx;
          await audio.resume();
          if (ctx !== audio) return; // stopped while resuming
        } else {
          release(false);
          const audio = new AudioContext({ latencyHint: "interactive" });
          ctx = audio;
          instrument = createInstrument(audio, status.volume);
          await audio.resume();
          if (ctx !== audio) return; // stopped while starting
          // A session piece is seeded by its session, so it is the same every time.
          seed = plan ? plan.seed : `live-${Date.now()}`;
          bar = 0;
          endAt = null;
          nextBarTime = audio.currentTime + START_DELAY_S;
        }
        set({ state: "playing", error: null, finished: false });
        startTimer();
        tick();
      } catch (e) {
        release(false);
        set({
          ...idle(),
          error: `Audio could not start: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    },

    async pause() {
      if (status.state !== "playing" || !ctx) return;
      stopTimer();
      set({ state: "paused" });
      // Suspending freezes the audio clock, so notes already scheduled wait in place.
      await ctx.suspend().catch(() => {});
    },

    stop() {
      if (status.state === "idle") return;
      release(true);
      set(idle());
    },

    setPlan(next) {
      // A plan is fully determined by its session, so reloading the same session (the
      // saved list refreshed) must not interrupt it.
      if (next === plan || (next && plan && next.sessionId === plan.sessionId)) return;
      release(true);
      plan = next;
      set(idle());
    },

    setStyle(style) {
      if (style !== status.style) set({ style });
    },

    setVolume(volume) {
      const value = Math.max(0, Math.min(1, volume));
      if (ctx && instrument) instrument.setVolume(value, ctx.currentTime);
      set({ volume: value });
    },

    getAnalyser: () => instrument?.analyser ?? null,
  };
}
