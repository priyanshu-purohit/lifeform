// Watches the shared measurement store and saves a summary the moment a session ends,
// wherever that happens (Setup, Explore, the no-pulse credit guard, leaving the app).

import { measurementStore } from "@/features/measurements";
import { buildSessionSummary } from "./session-summary";
import { saveSession } from "./session-storage";

/** Sessions already handled, so repeated snapshots of the same ended session save once. */
const handled = new Set<string>();
let stop: (() => void) | null = null;
let users = 0;

function check() {
  const { session, metrics } = measurementStore.getSnapshot();
  if (!session || session.endedAt == null || handled.has(session.id)) return;
  handled.add(session.id);
  const summary = buildSessionSummary(session, metrics);
  if (!summary) return; // nothing usable was measured; nothing to keep
  saveSession(summary).catch((error: unknown) => {
    console.error("LIFEFORM: could not save session summary", error);
  });
}

/** Starts recording (idempotent, reference-counted). Returns a function that stops it. */
export function startSessionRecorder(): () => void {
  users += 1;
  if (!stop) {
    // A session that is already over when we start (e.g. before mount) was either
    // saved earlier or ended before recording existed; don't re-save it.
    const current = measurementStore.getSnapshot().session;
    if (current?.endedAt != null) handled.add(current.id);
    stop = measurementStore.subscribe(check);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    users -= 1;
    if (users === 0 && stop) {
      stop();
      stop = null;
    }
  };
}
