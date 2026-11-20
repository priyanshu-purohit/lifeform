// Maps the shared measurement snapshot to the musical targets the Create engine steers
// toward. Pure TypeScript: no Web Audio, no React, no SDK. The engine reads these at bar
// lines and glides toward them, so a measurement update never causes an audible jump.
//
// Honesty rules (the same as Explore):
// - A metric with no usable sample drives nothing ("drive" 0). The music never plays a
//   pulse-driven rhythm or breath-shaped phrase that is not the person's.
// - Stale and low-confidence metrics keep their value but lose most of their influence.
// - The mappings are aesthetic. They do not imply emotional or health states.

import type { MeasurementSample, MeasurementSnapshot } from "@/features/measurements";
// Shared trust rule (freshness x SDK stability x SDK confidence), so both experiences
// weigh a reading the same way.
import { metricDrive } from "../explore/visual-mapping.ts";

type Range = readonly [number, number];

/** Every number that shapes the mapping. Pass a modified copy to mapToMusic to retune it. */
export interface MusicMappingConfig {
  /** Pulse (bpm) range mapped onto the tempo bounds and onto intensity 0..1. */
  pulseRange: Range;
  /** Tempo limits in beats per minute, so the music never drags or races. */
  tempoBounds: Range;
  /** Breathing (breaths/min) range mapped onto note length. */
  breathRange: Range;
  /** Limits on one musical phrase in seconds (one phrase follows one breath). */
  phraseBounds: Range;
  /** HRV RMSSD (ms) range mapped onto variation 0..1. */
  hrvRange: Range;
  /** The pulse trend compares the mean of the last window against the window before it. */
  trendWindowMs: number;
  /** Pulse change (bpm) between the two windows that counts as a full trend of 1. */
  trendFullScaleBpm: number;
  /** Samples needed in each window before a trend is reported at all. */
  trendMinSamples: number;
}

export const MUSIC_MAPPING: MusicMappingConfig = {
  pulseRange: [55, 110],
  tempoBounds: [60, 120],
  breathRange: [6, 24],
  phraseBounds: [2.5, 15],
  hrvRange: [15, 90],
  trendWindowMs: 30_000,
  trendFullScaleBpm: 8,
  trendMinSamples: 5,
};

/** Neutral values used while a metric is not driving anything. */
const NEUTRAL = {
  tempoBpm: 72,
  intensity: 0.25,
  phraseSeconds: 8,
  sustain: 0.6,
  variation: 0.2,
} as const;

export interface MusicTargets {
  /** Beats per minute. Pulse-driven, always inside tempoBounds. */
  tempoBpm: number;
  /** 0..1. Rhythmic intensity: how busy and strong the rhythm is. Pulse-driven. */
  intensity: number;
  /** 0..1. How much the pulse shapes the rhythm. 0 = no pulse data, so no percussion. */
  pulseDrive: number;
  /** Length of one musical phrase in seconds (one breathing cycle). */
  phraseSeconds: number;
  /** 0..1. Note length: slower breathing gives longer, more connected notes. */
  sustain: number;
  /** 0..1. How much breathing shapes phrasing and ambient layers. 0 = no breathing data. */
  breathDrive: number;
  /** 0..1. Melodic and harmonic variation. HRV-driven, else neutral. */
  variation: number;
  /** -1..1. Pulse falling (-) or rising (+) over the last minute: slow dynamics changes. */
  trend: number;
  /** 0..1. How much data is driving the music at all: fullness of the arrangement. */
  clarity: number;
}

/** What drives the music right now, for the UI legend. */
export interface MusicDrivers {
  pulse: boolean;
  breathing: boolean;
  hrv: boolean;
}

export const RESTING_MUSIC: MusicTargets = {
  tempoBpm: NEUTRAL.tempoBpm,
  intensity: NEUTRAL.intensity,
  pulseDrive: 0,
  phraseSeconds: NEUTRAL.phraseSeconds,
  sustain: NEUTRAL.sustain,
  breathDrive: 0,
  variation: NEUTRAL.variation,
  trend: 0,
  clarity: 0,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, [lo, hi]: Range) => Math.min(hi, Math.max(lo, v));
const normalize = (v: number, [lo, hi]: Range) => clamp01((v - lo) / (hi - lo));
const lerp = ([lo, hi]: Range, t: number) => lo + (hi - lo) * t;
const mix = (neutral: number, value: number, drive: number) => neutral + (value - neutral) * drive;

/** Plain numbers in, so a live snapshot and a stored session can share one mapping. */
export interface MusicInputs {
  /** Smoothed values; null when the metric has no usable reading. */
  pulseBpm: number | null;
  breathsPerMin: number | null;
  hrvMs: number | null;
  /** 0..1 trust in each value (see metricDrive). */
  pulseDrive: number;
  breathDrive: number;
  hrvDrive: number;
  /** Pulse change in bpm between two consecutive windows; null when not known. */
  pulseTrendBpm: number | null;
}

export function musicTargets(
  input: MusicInputs,
  config: MusicMappingConfig = MUSIC_MAPPING,
): { targets: MusicTargets; drivers: MusicDrivers } {
  const pulseDrive = input.pulseBpm == null ? 0 : clamp01(input.pulseDrive);
  const breathDrive = input.breathsPerMin == null ? 0 : clamp01(input.breathDrive);
  const hrvDrive = input.hrvMs == null ? 0 : clamp01(input.hrvDrive);

  let tempoBpm: number = NEUTRAL.tempoBpm;
  let intensity: number = NEUTRAL.intensity;
  let trend = 0;
  if (input.pulseBpm != null && pulseDrive > 0) {
    const level = normalize(input.pulseBpm, config.pulseRange);
    tempoBpm = mix(NEUTRAL.tempoBpm, lerp(config.tempoBounds, level), pulseDrive);
    intensity = mix(NEUTRAL.intensity, level, pulseDrive);
    if (input.pulseTrendBpm != null) {
      trend = clamp(input.pulseTrendBpm / config.trendFullScaleBpm, [-1, 1]) * pulseDrive;
    }
  }

  let phraseSeconds: number = NEUTRAL.phraseSeconds;
  let sustain: number = NEUTRAL.sustain;
  if (input.breathsPerMin != null && breathDrive > 0) {
    phraseSeconds = clamp(60 / input.breathsPerMin, config.phraseBounds);
    sustain = mix(NEUTRAL.sustain, 1 - normalize(input.breathsPerMin, config.breathRange), breathDrive);
  }

  const variation =
    input.hrvMs != null && hrvDrive > 0
      ? mix(NEUTRAL.variation, normalize(input.hrvMs, config.hrvRange), hrvDrive)
      : NEUTRAL.variation;

  // Pulse and breathing are the primary signals; HRV only adds a little.
  const clarity = clamp01(pulseDrive * 0.55 + breathDrive * 0.35 + hrvDrive * 0.1);

  return {
    targets: {
      tempoBpm: clamp(tempoBpm, config.tempoBounds),
      intensity,
      pulseDrive,
      phraseSeconds,
      sustain,
      breathDrive,
      variation,
      trend,
      clarity,
    },
    drivers: { pulse: pulseDrive > 0, breathing: breathDrive > 0, hrv: hrvDrive > 0 },
  };
}

/**
 * Change between the mean of the last window and the window before it, in the metric's
 * own unit. null when either window has too few samples: never reported as zero change.
 */
export function recentTrend(
  history: readonly MeasurementSample[],
  windowMs: number,
  minSamples: number,
): number | null {
  const last = history.at(-1);
  if (!last) return null;
  const recentFrom = last.timestamp - windowMs;
  const earlierFrom = recentFrom - windowMs;
  let recentSum = 0;
  let recentCount = 0;
  let earlierSum = 0;
  let earlierCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const s = history[i];
    if (s.timestamp <= earlierFrom) break;
    if (s.timestamp > recentFrom) {
      recentSum += s.value;
      recentCount++;
    } else {
      earlierSum += s.value;
      earlierCount++;
    }
  }
  if (recentCount < minSamples || earlierCount < minSamples) return null;
  return recentSum / recentCount - earlierSum / earlierCount;
}

/** Live mapping: the current shared snapshot to musical targets. */
export function mapToMusic(
  snapshot: MeasurementSnapshot,
  config: MusicMappingConfig = MUSIC_MAPPING,
): { targets: MusicTargets; drivers: MusicDrivers } {
  // Only an open session drives the music; an ended one returns it to rest.
  const open = snapshot.session != null && snapshot.session.endedAt == null;
  if (!open) return { targets: RESTING_MUSIC, drivers: { pulse: false, breathing: false, hrv: false } };

  const { pulseRate, breathingRate, hrvRmssd } = snapshot.metrics;
  return musicTargets(
    {
      pulseBpm: pulseRate.smoothed,
      breathsPerMin: breathingRate.smoothed,
      hrvMs: hrvRmssd.smoothed,
      pulseDrive: metricDrive(pulseRate),
      breathDrive: metricDrive(breathingRate),
      hrvDrive: metricDrive(hrvRmssd),
      pulseTrendBpm: recentTrend(pulseRate.history, config.trendWindowMs, config.trendMinSamples),
    },
    config,
  );
}
