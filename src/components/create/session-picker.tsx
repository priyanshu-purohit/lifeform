"use client";

import Link from "next/link";
import type { SessionSummary } from "@/features/sessions";
import { formatDateTime, formatDuration } from "@/features/understand/format";
import { SimulatedBadge } from "@/components/understand/now-panel";

/** Choose which saved session becomes the piece. */
export function SessionPicker({
  sessions,
  error,
  selectedId,
  usable,
  onSelect,
}: {
  /** null while loading. Newest first. */
  sessions: SessionSummary[] | null;
  error: string | null;
  selectedId: string | null;
  /** Ids of the sessions long enough to become music. */
  usable: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <section
      aria-label="Saved sessions"
      className="rounded-2xl border border-zinc-800/70 bg-zinc-950/55 p-6 backdrop-blur-md"
    >
      <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.35em] text-teal-200/70">Choose a session</h2>
      {error && (
        <p role="alert" className="mb-3 text-xs text-amber-200">
          Saved sessions could not be read: {error}
        </p>
      )}
      {sessions == null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-start gap-3 text-sm text-zinc-400">
          <p>No saved sessions yet. Finish a measurement and it will appear here, ready to become music.</p>
          <Link
            href="/setup"
            className="inline-flex h-9 items-center rounded-full bg-teal-200 px-4 text-xs font-medium text-zinc-950 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/70"
          >
            Go to measurement setup →
          </Link>
        </div>
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
          {sessions.map((s) => {
            const ok = usable.has(s.id);
            return (
              <li key={s.id}>
                <label className={ok ? "cursor-pointer" : "cursor-not-allowed"}>
                  <input
                    type="radio"
                    name="music-session"
                    value={s.id}
                    checked={selectedId === s.id}
                    disabled={!ok}
                    onChange={() => onSelect(s.id)}
                    className="peer sr-only"
                  />
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-zinc-800 px-4 py-3 transition-colors hover:border-zinc-600 peer-checked:border-teal-300/60 peer-checked:bg-teal-950/30 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-200/70 peer-disabled:opacity-50 peer-disabled:hover:border-zinc-800">
                    <span className="text-sm text-zinc-100">{formatDateTime(s.startedAt)}</span>
                    <span className="font-mono text-[11px] text-zinc-500">{formatDuration(s.durationMs)}</span>
                    {s.source === "simulation" && <SimulatedBadge />}
                    {!ok && <span className="text-[11px] text-zinc-500">Too short to become music</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
