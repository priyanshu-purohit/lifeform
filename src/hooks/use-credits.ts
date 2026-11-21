"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_SESSION_LIMIT_MIN,
  estimateCredits,
  getCreditsUsedEstimate,
  getSessionLimitMin,
  subscribeCredits,
  type MeasurementSession,
} from "@/features/measurements";

/** Estimated credits spent so far by real sessions on this device. */
export function useCreditsUsed(): number {
  return useSyncExternalStore(subscribeCredits, getCreditsUsedEstimate, () => 0);
}

/** Minutes after which a real session stops by itself. */
export function useSessionLimitMin(): number {
  return useSyncExternalStore(subscribeCredits, getSessionLimitMin, () => DEFAULT_SESSION_LIMIT_MIN);
}

/** How long a session has run (ticks each second while open) and what that costs. */
export function useSessionCost(session: MeasurementSession | null): {
  elapsedMs: number;
  credits: number;
} {
  const open = session != null && session.endedAt == null;
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  const end = session?.endedAt ?? now;
  const elapsedMs = session ? Math.max(0, end - session.startedAt) : 0;
  return { elapsedMs, credits: estimateCredits(elapsedMs) };
}

/** 83_000 -> "1:23" */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
