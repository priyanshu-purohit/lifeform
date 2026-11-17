// Maps the shared measurement snapshot to the targets the Explore world animates toward.
// Pure TypeScript: no Canvas, no React, no SDK. The engine eases toward these targets, so
// a measurement update never causes a visual jump.
//
// Honesty rules:
// - A metric with no usable sample drives nothing ("drive" 0). The world never shows a
//   heartbeat or breath rhythm that is not the person's.
// - Stale metrics keep their last value but lose most of their influence.
// - The mappings are aesthetic. They do not imply emotional or health states.

import type { MeasurementSnapshot, MetricState } from "@/features/measurements";

/** Configurable mapping ranges. Inputs outside a range are clamped. */
export const VISUAL_MAPPING = {
  /** Pulse (bpm) range mapped onto energy 0..1 (colour warmth, particle speed and density). */
  pulseEnergyRange: [55, 110] as const,
  /** Breathing (breaths/min) range mapped onto pace 0..1 (flow turbulence, trail length). */
  breathPaceRange: [6, 24] as const,
  /** HRV RMSSD (ms) range mapped onto variation 0..1 (shape irregularity, rhythm variation). */
  hrvVariationRange: [15, 90] as const,
  /** Bounds on the breathing cycle length in seconds, so the world never strobes or stalls. */
  breathPeriodBounds: [2.5, 15] as const,
  /** Bounds on the heartbeat ripple rate in Hz. */
  beatHzBounds: [0.5, 3] as const,
  /** Influence of a metric whose samples stopped arriving. */
  staleInfluence: 0.3,
  /** Weight for an SDK reading not yet marked stable. */
  unsettledInfluence: 0.55,
  /** Confidence assumed when the SDK reports none. */
  defaultConfidence: 75,
} as const;

/** Neutral values used while a metric is not driving anything. */
const NEUTRAL = {
  energy: 0.25,
  pace: 0.35,
  variation: 0.2,
  breathPeriodS: 8,
  beatHz: 1,
} as const;

export interface VisualTargets {
  /** 0..1. Overall activity: warmth of colour, particle speed and density. Pulse-driven. */
  energy: number;
  /** Heartbeat ripples per second (the pulse rate, not synchronised to individual beats). */
  beatHz: number;
  /** 0..1. Strength of heartbeat ripples and core contractions. 0 = no pulse data. */
  pulseDrive: number;
  /** Length of one breathing cycle in seconds. */
  breathPeriodS: number;
  /** 0..1. How much the world expands and contracts with breathing. 0 = no breathing data. */
  breathDrive: number;
  /** 0..1. Breathing pace: turbulence and trail length. */
  pace: number;
  /** 0..1. Organic irregularity of shape and rhythm. HRV-driven, else neutral. */
  variation: number;
  /** 0..1. How much data is driving the world at all: saturation and sharpness. */
  clarity: number;
}

/** What drives the world right now, for the UI legend. */
export interface VisualDrivers {
  pulse: boolean;
  breathing: boolean;
  hrv: boolean;
}

export const RESTING_TARGETS: VisualTargets = {
  energy: NEUTRAL.energy,
  beatHz: NEUTRAL.beatHz,
  pulseDrive: 0,
  breathPeriodS: NEUTRAL.breathPeriodS,
  breathDrive: 0,
  pace: NEUTRAL.pace,
  variation: NEUTRAL.variation,
  clarity: 0,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const normalize = (v: number, [lo, hi]: readonly [number, number]) => clamp01((v - lo) / (hi - lo));
const mix = (neutral: number, value: number, drive: number) => neutral + (value - neutral) * drive;

/** 0..1 influence of one metric, from freshness, SDK stability and SDK confidence. */
export function metricDrive(m: MetricState): number {
  if (!m.latest || m.smoothed == null || m.freshness === "waiting") return 0;
  const freshness = m.freshness === "live" ? 1 : VISUAL_MAPPING.staleInfluence;
  const stability = m.latest.validity === "valid" ? 1 : VISUAL_MAPPING.unsettledInfluence;
  const confidence = m.latest.confidence ?? VISUAL_MAPPING.defaultConfidence;
  // Low confidence still counts a little, so the world responds while the SDK settles.
  const trust = 0.35 + 0.65 * clamp01(confidence / 100);
  return freshness * stability * trust;
}

export function mapToVisual(snapshot: MeasurementSnapshot): {
  targets: VisualTargets;
  drivers: VisualDrivers;
} {
  // Only an open session drives the world; an ended one returns it to rest.
  const open = snapshot.session != null && snapshot.session.endedAt == null;
  if (!open) return { targets: RESTING_TARGETS, drivers: { pulse: false, breathing: false, hrv: false } };

  const { pulseRate, breathingRate, hrvRmssd } = snapshot.metrics;
  const pulseDrive = metricDrive(pulseRate);
  const breathDrive = metricDrive(breathingRate);
  const hrvDrive = metricDrive(hrvRmssd);

  const bpm = pulseRate.smoothed;
  const brpm = breathingRate.smoothed;
  const rmssd = hrvRmssd.smoothed;

  const energy =
    bpm != null && pulseDrive > 0
      ? mix(NEUTRAL.energy, normalize(bpm, VISUAL_MAPPING.pulseEnergyRange), pulseDrive)
      : NEUTRAL.energy;
  const beatHz =
    bpm != null && pulseDrive > 0 ? clamp(bpm / 60, VISUAL_MAPPING.beatHzBounds) : NEUTRAL.beatHz;

  const breathPeriodS =
    brpm != null && breathDrive > 0
      ? clamp(60 / brpm, VISUAL_MAPPING.breathPeriodBounds)
      : NEUTRAL.breathPeriodS;
  const pace =
    brpm != null && breathDrive > 0
      ? mix(NEUTRAL.pace, normalize(brpm, VISUAL_MAPPING.breathPaceRange), breathDrive)
      : NEUTRAL.pace;

  const variation =
    rmssd != null && hrvDrive > 0
      ? mix(NEUTRAL.variation, normalize(rmssd, VISUAL_MAPPING.hrvVariationRange), hrvDrive)
      : NEUTRAL.variation;

  // Pulse and breathing are the primary signals; HRV only adds a little clarity.
  const clarity = clamp01(pulseDrive * 0.55 + breathDrive * 0.35 + hrvDrive * 0.1);

  return {
    targets: { energy, beatHz, pulseDrive, breathPeriodS, breathDrive, pace, variation, clarity },
    drivers: { pulse: pulseDrive > 0, breathing: breathDrive > 0, hrv: hrvDrive > 0 },
  };
}
