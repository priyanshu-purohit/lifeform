"use client";

import Link from "next/link";
import {
  SIMULATION_AVAILABLE,
  startSimulation,
  type MeasurementSnapshot,
} from "@/features/measurements";
import type { SessionSummary } from "@/features/sessions";
import { formatClock, formatDateTime, formatDuration } from "@/features/understand/format";
import { LiveMetricCard, StoredMetricCard } from "./metric-cards";

export function SimulatedBadge({ long = false }: { long?: boolean }) {
  return (
    <span className="rounded-full border border-amber-400/40 bg-amber-950/50 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200">
      {long ? "Simulated data · not a camera reading" : "Simulated"}
    </span>
  );
}

function Heading({ title, detail, simulated }: { title: string; detail: string; simulated: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-light text-zinc-100">{title}</h3>
        {simulated && <SimulatedBadge long />}
      </div>
      <p className="font-mono text-[11px] text-zinc-500">{detail}</p>
    </div>
  );
}

const grid = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";

/** The running session, straight from the shared store. HRV appears only once it arrives. */
function LiveSession({ snapshot }: { snapshot: MeasurementSnapshot }) {
  const session = snapshot.session!;
  const { pulseRate, breathingRate, hrvRmssd } = snapshot.metrics;
  return (
    <div className="flex flex-col gap-4">
      <Heading
        title="Current session"
        detail={`Started ${formatClock(session.startedAt)}`}
        simulated={session.source === "simulation"}
      />
      {snapshot.guidance?.hint && (
        <p role="status" className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-4 py-2 text-xs text-amber-100">
          {snapshot.guidance.hint}
        </p>
      )}
      <div className={grid}>
        <LiveMetricCard state={pulseRate} />
        <LiveMetricCard state={breathingRate} />
        {hrvRmssd.latest && <LiveMetricCard state={hrvRmssd} />}
      </div>
    </div>
  );
}

function StoredSession({ summary, title }: { summary: SessionSummary; title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Heading
        title={title}
        detail={`${formatDateTime(summary.startedAt)} · ${formatDuration(summary.durationMs)}`}
        simulated={summary.source === "simulation"}
      />
      <div className={grid}>
        <StoredMetricCard metric="pulseRate" summary={summary.metrics.pulseRate} />
        <StoredMetricCard metric="breathingRate" summary={summary.metrics.breathingRate} />
        {summary.metrics.hrvRmssd && <StoredMetricCard metric="hrvRmssd" summary={summary.metrics.hrvRmssd} />}
      </div>
    </div>
  );
}

/** How to start a new session from here: the real path, plus the labelled dev simulation. */
function StartActions({ primary, onSimulateError }: { primary: string; onSimulateError: (message: string) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/setup"
        className="inline-flex h-10 items-center rounded-full bg-teal-200 px-5 text-sm font-medium text-zinc-950 hover:bg-teal-100"
      >
        {primary}
      </Link>
      {SIMULATION_AVAILABLE && (
        <button
          type="button"
          onClick={() => {
            try {
              startSimulation();
            } catch (e) {
              onSimulateError(e instanceof Error ? e.message : String(e));
            }
          }}
          className="inline-flex h-10 items-center rounded-full border border-amber-400/40 px-5 text-sm text-amber-200 hover:bg-amber-950/40"
        >
          Run simulation (dev only)
        </button>
      )}
    </div>
  );
}

function Empty({ onSimulateError }: { onSimulateError: (message: string) => void }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-zinc-800 p-8">
      <p className="text-sm text-zinc-400">
        No sessions yet. Measure once and your pulse and breathing will appear here.
      </p>
      <StartActions primary="Go to measurement setup →" onSimulateError={onSimulateError} />
    </div>
  );
}

export function NowPanel({
  snapshot,
  sessions,
  viewing,
  onBackToLatest,
  onSimulateError,
}: {
  snapshot: MeasurementSnapshot;
  sessions: SessionSummary[] | null;
  /** A session picked from History, or null for the default view. */
  viewing: SessionSummary | null;
  onBackToLatest: () => void;
  onSimulateError: (message: string) => void;
}) {
  const running = snapshot.session != null && snapshot.session.endedAt == null;

  if (viewing) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={onBackToLatest}
          className="self-start font-mono text-[11px] text-zinc-400 hover:text-teal-100"
        >
          ← Back to {running ? "current" : "most recent"} session
        </button>
        <StoredSession summary={viewing} title="Saved session" />
      </div>
    );
  }
  if (running) return <LiveSession snapshot={snapshot} />;
  if (sessions == null) return <p className="text-sm text-zinc-500">Loading saved sessions…</p>;
  if (sessions.length === 0) return <Empty onSimulateError={onSimulateError} />;
  return (
    <div className="flex flex-col gap-6">
      <StoredSession summary={sessions[0]} title="Most recent session" />
      <StartActions primary="Measure again →" onSimulateError={onSimulateError} />
    </div>
  );
}
