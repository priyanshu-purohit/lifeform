// DEVELOPMENT ONLY. Feeds clearly labelled simulated samples (source: "simulation") through
// the same store and processor as real SDK data, so the experiences can be built and tested
// without spending SmartSpectra credits. It is disabled in production builds, and every UI
// that shows its data must say that it is simulated.
//
// The numbers are a plausible random walk, not a model of anyone's physiology.

import { METRIC_UNITS } from "./measurement.adapter";
import { measurementStore } from "./measurement.store";
import type { MeasurementSample, MetricId } from "./measurement.types";

export const SIMULATION_AVAILABLE = process.env.NODE_ENV === "development";

const TICK_MS = 1_000;
/** Mimic the SDK's warm-up: breathing and HRV arrive later than pulse. */
const BREATHING_AFTER_MS = 8_000;
const HRV_AFTER_MS = 20_000;
const STABLE_AFTER_MS = 12_000;

interface Walk {
  value: number;
  target: number;
  min: number;
  max: number;
  step: number;
}

let timer: ReturnType<typeof setInterval> | null = null;
let sessionId: string | null = null;
let startedAt = 0;
let signalLost = false;
const listeners = new Set<() => void>();

const walks: Record<MetricId, Walk> = {
  pulseRate: { value: 72, target: 72, min: 58, max: 104, step: 0.9 },
  breathingRate: { value: 13, target: 13, min: 7, max: 21, step: 0.25 },
  hrvRmssd: { value: 42, target: 42, min: 18, max: 85, step: 1.5 },
};

function stepWalk(w: Walk): number {
  // Occasionally pick a new destination, then drift toward it with a little noise.
  if (Math.random() < 0.06) w.target = w.min + Math.random() * (w.max - w.min);
  w.value += (w.target - w.value) * 0.08 + (Math.random() - 0.5) * w.step;
  w.value = Math.min(w.max, Math.max(w.min, w.value));
  return w.value;
}

function sample(metric: MetricId, now: number, elapsed: number): MeasurementSample {
  const stable = elapsed > STABLE_AFTER_MS;
  const confidence = Math.min(95, 20 + elapsed / 300 + Math.random() * 8);
  return {
    metric,
    value: stepWalk(walks[metric]),
    unit: METRIC_UNITS[metric],
    timestamp: now,
    confidence,
    stable,
    validity: stable ? "valid" : "unsettled",
    source: "simulation",
  };
}

function tick() {
  const session = measurementStore.getSnapshot().session;
  // A real SDK session (or anything else) replaced ours: stop feeding it.
  if (!session || session.id !== sessionId || session.endedAt != null) {
    stopSimulation();
    return;
  }
  if (signalLost) return;
  const now = Date.now();
  const elapsed = now - startedAt;
  const samples = [sample("pulseRate", now, elapsed)];
  if (elapsed > BREATHING_AFTER_MS) samples.push(sample("breathingRate", now, elapsed));
  if (elapsed > HRV_AFTER_MS) samples.push(sample("hrvRmssd", now, elapsed));
  measurementStore.ingest(samples);
}

function notify() {
  for (const l of listeners) l();
}

export function isSimulationRunning(): boolean {
  return timer != null;
}

export function isSimulatedSignalLost(): boolean {
  return signalLost;
}

/** Subscribe to simulation on/off and signal-lost changes. */
export function subscribeSimulation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts a simulated session. Refuses while any other session is open. */
export function startSimulation(): void {
  if (!SIMULATION_AVAILABLE || timer != null) return;
  const current = measurementStore.getSnapshot().session;
  if (current && current.endedAt == null) {
    throw new Error("A measurement session is already running.");
  }
  measurementStore.beginSession("simulation");
  measurementStore.setStatus("running");
  sessionId = measurementStore.getSnapshot().session?.id ?? null;
  startedAt = Date.now();
  signalLost = false;
  timer = setInterval(tick, TICK_MS);
  tick();
  notify();
}

export function stopSimulation(): void {
  if (timer == null) return;
  clearInterval(timer);
  timer = null;
  signalLost = false;
  const session = measurementStore.getSnapshot().session;
  if (session?.id === sessionId) {
    measurementStore.endSession();
    measurementStore.setStatus("inactive");
  }
  sessionId = null;
  notify();
}

/** Pauses sample delivery to test stale/missing-data handling. */
export function setSimulatedSignalLost(lost: boolean): void {
  if (timer == null || lost === signalLost) return;
  signalLost = lost;
  notify();
}
