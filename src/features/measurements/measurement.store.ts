// The single shared place for measurement state. One instance for the whole app (a module
// singleton), so every route reads the same session. Framework-agnostic: React reads it
// through useSyncExternalStore (src/hooks/use-measurements.ts).

import { MetricTrack } from "./measurement.processor";
import type {
  MeasurementError,
  MeasurementSample,
  MeasurementSnapshot,
  MeasurementSource,
  MeasurementStatus,
  MetricId,
  MetricState,
  SignalGuidance,
} from "./measurement.types";

const METRICS: readonly MetricId[] = ["pulseRate", "breathingRate", "hrvRmssd"];
/** How often freshness (live -> stale) is re-checked while a session runs. */
const FRESHNESS_CHECK_MS = 1_000;

type Listener = () => void;

function newTracks(): Record<MetricId, MetricTrack> {
  return {
    pulseRate: new MetricTrack("pulseRate"),
    breathingRate: new MetricTrack("breathingRate"),
    hrvRmssd: new MetricTrack("hrvRmssd"),
  };
}

function metricStates(tracks: Record<MetricId, MetricTrack>, now: number) {
  return Object.fromEntries(METRICS.map((id) => [id, tracks[id].toState(now)])) as Record<
    MetricId,
    MetricState
  >;
}

/** Snapshot before any session: used for the server render and as the initial state. */
export const EMPTY_SNAPSHOT: MeasurementSnapshot = Object.freeze({
  status: "inactive",
  session: null,
  guidance: null,
  error: null,
  metrics: metricStates(newTracks(), 0),
});

class MeasurementStore {
  private snapshot: MeasurementSnapshot = EMPTY_SNAPSHOT;
  private tracks = newTracks();
  private listeners = new Set<Listener>();
  private freshnessTimer: ReturnType<typeof setInterval> | null = null;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): MeasurementSnapshot => this.snapshot;

  /** Starts a fresh session: clears previous metrics, history, guidance and errors. */
  beginSession(source: MeasurementSource): void {
    const now = Date.now();
    this.tracks = newTracks();
    this.set({
      session: { id: crypto.randomUUID(), source, startedAt: now, endedAt: null },
      guidance: null,
      error: null,
      metrics: metricStates(this.tracks, now),
    });
    this.startFreshnessChecks();
  }

  /** Closes the session. Its data stays readable until the next beginSession(). */
  endSession(): void {
    this.stopFreshnessChecks();
    const session = this.snapshot.session;
    if (!session || session.endedAt != null) return;
    this.set({ session: { ...session, endedAt: Date.now() }, guidance: null });
  }

  setStatus(status: MeasurementStatus): void {
    if (status !== this.snapshot.status) this.set({ status });
  }

  setGuidance(guidance: SignalGuidance | null): void {
    const prev = this.snapshot.guidance;
    if (prev?.code === guidance?.code && prev?.hint === guidance?.hint) return;
    this.set({ guidance });
  }

  setError(error: MeasurementError | null): void {
    this.set({ error });
  }

  /** Feeds normalized samples. Ignored outside a running session. */
  ingest(samples: readonly MeasurementSample[]): void {
    const session = this.snapshot.session;
    if (!session || session.endedAt != null || samples.length === 0) return;
    const now = Date.now();
    const metrics = { ...this.snapshot.metrics };
    let changed = false;
    for (const id of METRICS) {
      if (this.tracks[id].ingest(samples, now)) {
        metrics[id] = this.tracks[id].toState(now);
        changed = true;
      }
    }
    if (changed) this.set({ metrics });
  }

  private startFreshnessChecks() {
    this.stopFreshnessChecks();
    this.freshnessTimer = setInterval(() => {
      const now = Date.now();
      let metrics: Record<MetricId, MetricState> | null = null;
      for (const id of METRICS) {
        const freshness = this.tracks[id].freshness(now);
        if (freshness !== this.snapshot.metrics[id].freshness) {
          metrics ??= { ...this.snapshot.metrics };
          metrics[id] = { ...metrics[id], freshness };
        }
      }
      if (metrics) this.set({ metrics });
    }, FRESHNESS_CHECK_MS);
  }

  private stopFreshnessChecks() {
    if (this.freshnessTimer != null) clearInterval(this.freshnessTimer);
    this.freshnessTimer = null;
  }

  private set(patch: Partial<MeasurementSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}

export const measurementStore = new MeasurementStore();
