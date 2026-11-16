"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_SNAPSHOT, measurementStore } from "@/features/measurements/measurement.store";
import type {
  MeasurementSnapshot,
  MetricId,
  MetricState,
} from "@/features/measurements/measurement.types";

const getServerSnapshot = () => EMPTY_SNAPSHOT;

/** The whole shared measurement state. Re-renders on any change. */
export function useMeasurements(): MeasurementSnapshot {
  return useSyncExternalStore(
    measurementStore.subscribe,
    measurementStore.getSnapshot,
    getServerSnapshot,
  );
}

/** One metric only. Re-renders only when that metric changes. */
export function useMetric(metric: MetricId): MetricState {
  return useSyncExternalStore(
    measurementStore.subscribe,
    () => measurementStore.getSnapshot().metrics[metric],
    () => EMPTY_SNAPSHOT.metrics[metric],
  );
}
