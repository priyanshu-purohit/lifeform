// Session Mode: plans a finished piece of music from a saved session summary. Pure
// TypeScript: no Web Audio, no React, no storage.
//
// The plan is a list of bars. Each bar reads the session at one moment and carries the
// musical targets and tempo for it, using the same mapping and the same tempo glide as
// Live Mode. The plan holds no notes and no style: the engine (and later the exporter)
// generates the notes from the plan with the session id as the seed, so one session and
// one style always give the same piece.
//
// Honesty rules:
// - Only stored readings are used. Where a metric has a gap, it drives nothing there.
// - Unsettled readings count for less, exactly as they do live.
// - A long session is compressed in time, never padded or looped.

import type { MetricSummary, SeriesPoint, SessionSummary } from "@/features/sessions";
import { VISUAL_MAPPING } from "../explore/visual-mapping.ts";
import { BEATS_PER_BAR } from "./music-generator.ts";
import {
  MUSIC_MAPPING,
  musicTargets,
  type MusicDrivers,
  type MusicMappingConfig,
  type MusicTargets,
} from "./music-mapping.ts";

/** The most the tempo may change from one bar to the next, in beats per minute. */
export const MAX_TEMPO_STEP = 3;

/** Moves the tempo toward its target by at most MAX_TEMPO_STEP. */
export function nextTempo(current: number, target: number): number {
  return current + Math.max(-MAX_TEMPO_STEP, Math.min(MAX_TEMPO_STEP, target - current));
}

/** A longer session is compressed to this length. */
export const MAX_PIECE_SECONDS = 180;
/** A shorter session does not hold enough readings to become a piece. */
export const MIN_SESSION_SECONDS = 15;
/** Two stored points further apart than this are a gap: nothing is read between them. */
export const MAX_SERIES_GAP_MS = 15_000;

export interface PlannedBar {
  /** Seconds from the start of the piece. */
  startSeconds: number;
  /** The tempo this bar plays at (already glided from the bar before). */
  tempoBpm: number;
  /** Milliseconds into the session that this bar reads. */
  sessionMs: number;
  targets: MusicTargets;
  drivers: MusicDrivers;
}

export interface SessionPlan {
  /** The session id: the seed for the generator. */
  seed: string;
  sessionId: string;
  bars: PlannedBar[];
  /** Length of the music in seconds, ending on a bar line. */
  durationSeconds: number;
  sessionSeconds: number;
  /** true when the session was longer than the piece and time was compressed. */
  compressed: boolean;
  /** Share of bars (0..1) in which each metric shaped the music. */
  coverage: { pulse: number; breathing: number; hrv: number };
}

export interface SeriesReading {
  value: number;
  /** 0..1 trust, from SDK stability and SDK confidence. */
  drive: number;
}

function pointDrive(point: SeriesPoint): number {
  const stability = point.valid ? 1 : VISUAL_MAPPING.unsettledInfluence;
  const confidence = point.confidence ?? VISUAL_MAPPING.defaultConfidence;
  return stability * (0.35 + 0.65 * Math.max(0, Math.min(1, confidence / 100)));
}

/**
 * The stored value at one moment of the session, interpolated between the two nearest
 * points. null inside a gap, or more than half a gap outside the first or last point.
 */
export function readSeries(series: readonly SeriesPoint[], tMs: number): SeriesReading | null {
  if (series.length === 0) return null;
  let after = series.findIndex((p) => p.t > tMs);
  if (after === -1) after = series.length;
  const a = series[after - 1];
  const b = series[after];
  if (a && b) {
    if (b.t - a.t > MAX_SERIES_GAP_MS) return null;
    const share = (tMs - a.t) / (b.t - a.t);
    return {
      value: a.value + (b.value - a.value) * share,
      drive: pointDrive(a) + (pointDrive(b) - pointDrive(a)) * share,
    };
  }
  const edge = a ?? b;
  if (Math.abs(tMs - edge.t) > MAX_SERIES_GAP_MS / 2) return null;
  return { value: edge.value, drive: pointDrive(edge) };
}

/** Change between the mean of the window ending at tMs and the window before it, or null. */
export function seriesTrend(
  series: readonly SeriesPoint[],
  tMs: number,
  windowMs: number,
  minPoints: number,
): number | null {
  let recentSum = 0;
  let recentCount = 0;
  let earlierSum = 0;
  let earlierCount = 0;
  for (const p of series) {
    if (p.t > tMs) break;
    if (p.t > tMs - windowMs) {
      recentSum += p.value;
      recentCount++;
    } else if (p.t > tMs - 2 * windowMs) {
      earlierSum += p.value;
      earlierCount++;
    }
  }
  if (recentCount < minPoints || earlierCount < minPoints) return null;
  return recentSum / recentCount - earlierSum / earlierCount;
}

/** Stored points come one per 5 s, so a 30 s window holds 6: half of them is enough. */
const TREND_MIN_POINTS = 3;

function targetsAt(
  summary: SessionSummary,
  tMs: number,
  config: MusicMappingConfig,
): { targets: MusicTargets; drivers: MusicDrivers } {
  const read = (m: MetricSummary | undefined) => (m ? readSeries(m.series, tMs) : null);
  const pulse = read(summary.metrics.pulseRate);
  const breathing = read(summary.metrics.breathingRate);
  const hrv = read(summary.metrics.hrvRmssd);
  return musicTargets(
    {
      pulseBpm: pulse?.value ?? null,
      breathsPerMin: breathing?.value ?? null,
      hrvMs: hrv?.value ?? null,
      pulseDrive: pulse?.drive ?? 0,
      breathDrive: breathing?.drive ?? 0,
      hrvDrive: hrv?.drive ?? 0,
      pulseTrendBpm: summary.metrics.pulseRate
        ? seriesTrend(summary.metrics.pulseRate.series, tMs, config.trendWindowMs, TREND_MIN_POINTS)
        : null,
    },
    config,
  );
}

/**
 * Plans the piece for one saved session. Returns null when the session is too short or
 * has no stored readings: there is nothing honest to compose from.
 */
export function composeSession(
  summary: SessionSummary,
  config: MusicMappingConfig = MUSIC_MAPPING,
): SessionPlan | null {
  const sessionSeconds = summary.durationMs / 1000;
  if (sessionSeconds < MIN_SESSION_SECONDS) return null;
  const hasReadings = Object.values(summary.metrics).some((m) => m.series.length > 0);
  if (!hasReadings) return null;

  const pieceSeconds = Math.min(sessionSeconds, MAX_PIECE_SECONDS);
  const bars: PlannedBar[] = [];
  const counts = { pulse: 0, breathing: 0, hrv: 0 };
  let startSeconds = 0;
  let tempo = 0;
  while (startSeconds < pieceSeconds) {
    const sessionMs = (startSeconds / pieceSeconds) * summary.durationMs;
    const { targets, drivers } = targetsAt(summary, sessionMs, config);
    tempo = bars.length === 0 ? targets.tempoBpm : nextTempo(tempo, targets.tempoBpm);
    bars.push({ startSeconds, tempoBpm: tempo, sessionMs, targets, drivers });
    if (drivers.pulse) counts.pulse++;
    if (drivers.breathing) counts.breathing++;
    if (drivers.hrv) counts.hrv++;
    startSeconds += (BEATS_PER_BAR * 60) / tempo;
  }

  return {
    seed: summary.id,
    sessionId: summary.id,
    bars,
    durationSeconds: startSeconds,
    sessionSeconds,
    compressed: sessionSeconds > MAX_PIECE_SECONDS,
    coverage: {
      pulse: counts.pulse / bars.length,
      breathing: counts.breathing / bars.length,
      hrv: counts.hrv / bars.length,
    },
  };
}
