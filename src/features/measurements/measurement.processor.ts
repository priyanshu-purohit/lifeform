// Per-metric processing: de-duplication, validation filtering, smoothing, missing-data
// detection and bounded history. Pure TypeScript with no SDK or React knowledge.

import { METRIC_UNITS } from "./measurement.adapter";
import type { Freshness, MeasurementSample, MetricId, MetricState } from "./measurement.types";

interface MetricTuning {
  /** Samples newer than (latest - window) feed the smoothed value. */
  smoothingWindowMs: number;
  /** With no new usable sample for this long, the metric is "stale". */
  staleAfterMs: number;
}

// Breathing and HRV are computed over longer windows and update more slowly than pulse.
const TUNING: Record<MetricId, MetricTuning> = {
  pulseRate: { smoothingWindowMs: 5_000, staleAfterMs: 6_000 },
  breathingRate: { smoothingWindowMs: 10_000, staleAfterMs: 15_000 },
  hrvRmssd: { smoothingWindowMs: 20_000, staleAfterMs: 30_000 },
};

/** Roughly 30 minutes at one sample per second; enough for one session's history. */
const HISTORY_LIMIT = 1_800;
/** Weight for samples without an SDK confidence, so they count but never dominate. */
const DEFAULT_WEIGHT = 25;

export class MetricTrack {
  readonly metric: MetricId;
  private readonly tuning: MetricTuning;
  private history: MeasurementSample[] = [];
  private smoothed: number | null = null;
  /** Wall-clock time (Date.now) of the last usable sample, for staleness. */
  private receivedAt: number | null = null;

  constructor(metric: MetricId) {
    this.metric = metric;
    this.tuning = TUNING[metric];
  }

  /**
   * Adds samples for this metric. Returns true if anything changed. Packets can repeat
   * readings already seen, so only samples newer than the latest are kept, and invalid
   * ones are dropped (they never reach history or smoothing).
   */
  ingest(samples: readonly MeasurementSample[], now: number): boolean {
    let lastTs = this.history.at(-1)?.timestamp ?? -Infinity;
    let changed = false;
    for (const s of samples) {
      if (s.metric !== this.metric || s.validity === "invalid" || s.timestamp <= lastTs) continue;
      this.history.push(s);
      lastTs = s.timestamp;
      changed = true;
    }
    if (!changed) return false;
    if (this.history.length > HISTORY_LIMIT) {
      this.history = this.history.slice(-HISTORY_LIMIT);
    }
    this.receivedAt = now;
    this.smoothed = this.computeSmoothed(lastTs);
    return true;
  }

  freshness(now: number): Freshness {
    if (this.receivedAt == null) return "waiting";
    return now - this.receivedAt > this.tuning.staleAfterMs ? "stale" : "live";
  }

  /** Confidence-weighted mean of samples inside the smoothing window. */
  private computeSmoothed(latestTs: number): number | null {
    const from = latestTs - this.tuning.smoothingWindowMs;
    let sum = 0;
    let weight = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const s = this.history[i];
      if (s.timestamp < from) break;
      const w = Math.max(1, s.confidence ?? DEFAULT_WEIGHT);
      sum += s.value * w;
      weight += w;
    }
    return weight > 0 ? sum / weight : null;
  }

  toState(now: number): MetricState {
    return {
      metric: this.metric,
      unit: METRIC_UNITS[this.metric],
      freshness: this.freshness(now),
      latest: this.history.at(-1) ?? null,
      smoothed: this.smoothed,
      // Copy so consumers holding an old snapshot never see it mutate.
      history: this.history.slice(),
    };
  }
}
