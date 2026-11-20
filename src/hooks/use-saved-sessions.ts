"use client";

import { useEffect, useState } from "react";
import { listSessions, subscribeSessions, type SessionSummary } from "@/features/sessions";

export interface SavedSessions {
  /** null while the first load is in progress. Newest first. */
  sessions: SessionSummary[] | null;
  error: string | null;
}

/** Locally saved session summaries; refreshes when one is saved or deleted. */
export function useSavedSessions(): SavedSessions {
  const [state, setState] = useState<SavedSessions>({ sessions: null, error: null });

  useEffect(() => {
    let alive = true;
    const load = () => {
      listSessions().then(
        (all) => {
          // Ignore records written by an incompatible (future or older) shape.
          if (alive) setState({ sessions: all.filter((s) => s.version === 1), error: null });
        },
        (e: unknown) => {
          if (!alive) return;
          const message = e instanceof Error ? e.message : String(e);
          setState((prev) => ({ sessions: prev.sessions ?? [], error: message }));
        },
      );
    };
    load();
    const unsubscribe = subscribeSessions(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return state;
}
