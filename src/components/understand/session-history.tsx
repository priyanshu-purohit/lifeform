"use client";

import { useState } from "react";
import { deleteAllSessions, deleteSession, type SessionSummary } from "@/features/sessions";
import { formatDateTime, formatDuration } from "@/features/understand/format";
import { METRIC_META, METRIC_ORDER, formatValue } from "@/features/understand/metric-meta";
import { SimulatedBadge } from "./now-panel";

const small =
  "rounded-full border px-3 py-1 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60";

function Averages({ summary }: { summary: SessionSummary }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {METRIC_ORDER.map((id) => {
        const m = summary.metrics[id];
        if (!m && id === "hrvRmssd") return null; // HRV only when it was measured
        const meta = METRIC_META[id];
        return (
          <div key={id} className="flex items-baseline gap-1.5">
            <dt className="text-zinc-500">{meta.label}</dt>
            <dd className="font-mono tabular-nums text-zinc-200">
              {m?.stats ? `${formatValue(id, m.stats.mean)} ${meta.unit}` : m ? "too few readings" : "not measured"}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Row({
  summary,
  viewing,
  onView,
  onError,
}: {
  summary: SessionSummary;
  viewing: boolean;
  onView: () => void;
  onError: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-100">{formatDateTime(summary.startedAt)}</span>
          <span className="font-mono text-[11px] text-zinc-500">{formatDuration(summary.durationMs)}</span>
          {summary.source === "simulation" && <SimulatedBadge />}
        </div>
        <Averages summary={summary} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onView}
          aria-pressed={viewing}
          className={`${small} ${viewing ? "border-teal-300/60 text-teal-100" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
        >
          {viewing ? "Viewing" : "View"}
        </button>
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => deleteSession(summary.id).catch((e) => onError(String(e)))}
              className={`${small} border-red-400/60 text-red-200 hover:bg-red-950/40`}
            >
              Confirm delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={`${small} border-zinc-700 text-zinc-400`}>
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${small} border-zinc-800 text-zinc-500 hover:border-red-400/50 hover:text-red-200`}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

export function SessionHistory({
  sessions,
  viewingId,
  onView,
  onError,
}: {
  sessions: SessionSummary[] | null;
  viewingId: string | null;
  onView: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [confirmAll, setConfirmAll] = useState(false);
  if (sessions == null) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (sessions.length === 0) {
    return <p className="text-sm text-zinc-500">Finished sessions are saved here, on this computer only.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-zinc-800/70 rounded-2xl border border-zinc-800/70 bg-zinc-950/55 px-5">
        {sessions.map((s) => (
          <Row key={s.id} summary={s} viewing={s.id === viewingId} onView={() => onView(s.id)} onError={onError} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <p className="text-[11px] text-zinc-500">
          {sessions.length} saved · only summaries (no video or images), stored on this computer.
        </p>
        {confirmAll ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-red-200">Delete all {sessions.length} sessions?</span>
            <button
              type="button"
              onClick={() => {
                setConfirmAll(false);
                deleteAllSessions().catch((e) => onError(String(e)));
              }}
              className={`${small} border-red-400/60 text-red-200 hover:bg-red-950/40`}
            >
              Delete all
            </button>
            <button type="button" onClick={() => setConfirmAll(false)} className={`${small} border-zinc-700 text-zinc-400`}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmAll(true)}
            className={`${small} border-zinc-800 text-zinc-500 hover:border-red-400/50 hover:text-red-200`}
          >
            Delete all sessions
          </button>
        )}
      </div>
    </div>
  );
}
