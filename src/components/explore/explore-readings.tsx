"use client";

import type { MeasurementSnapshot, MetricId, MetricState } from "@/features/measurements";
import { metricDrive } from "@/features/explore/visual-mapping";

interface MetricMeta {
  id: MetricId;
  label: string;
  unit: string;
  digits: number;
  /** What this metric controls in the world, in plain words. */
  drives: string;
  waiting: string;
  dot: string;
}

const METRICS: readonly MetricMeta[] = [
  {
    id: "pulseRate",
    label: "Pulse",
    unit: "bpm",
    digits: 0,
    drives: "Heartbeat ripples, colour and energy",
    waiting: "Reading…",
    dot: "bg-teal-300",
  },
  {
    id: "breathingRate",
    label: "Breathing",
    unit: "/min",
    digits: 1,
    drives: "The world expands and contracts",
    waiting: "Needs about 30 s",
    dot: "bg-indigo-300",
  },
  {
    id: "hrvRmssd",
    label: "HRV",
    unit: "ms",
    digits: 0,
    drives: "Shape and rhythm variation",
    waiting: "Only if the SDK reports it",
    dot: "bg-amber-300",
  },
];

function stateLabel(m: MetricState): { text: string; tone: string } {
  if (m.freshness === "stale") return { text: "Lost · last value", tone: "text-amber-300/90" };
  if (m.latest?.validity === "unsettled") return { text: "Settling", tone: "text-zinc-400" };
  return { text: "Live", tone: "text-teal-200/90" };
}

function Readout({ meta, state, open }: { meta: MetricMeta; state: MetricState; open: boolean }) {
  const has = open && state.latest != null && state.smoothed != null;
  const drive = open ? metricDrive(state) : 0;
  const confidence = state.latest?.confidence;
  const status = has ? stateLabel(state) : null;

  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400">
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full transition-opacity duration-700 ${meta.dot}`}
            style={{ opacity: 0.2 + drive * 0.8 }}
          />
          {meta.label}
        </span>
        {has ? (
          <span className={`tabular-nums ${state.freshness === "stale" ? "text-zinc-500" : "text-zinc-100"}`}>
            <span className="text-2xl font-light">{state.smoothed!.toFixed(meta.digits)}</span>{" "}
            <span className="text-xs text-zinc-500">{meta.unit}</span>
          </span>
        ) : (
          <span className="text-xs text-zinc-500">{open ? meta.waiting : "—"}</span>
        )}
      </div>

      {has && (
        <div className="flex items-center gap-3">
          <div
            className="h-0.5 flex-1 overflow-hidden rounded-full bg-zinc-800"
            role="meter"
            aria-label={`${meta.label} confidence`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={confidence != null ? Math.round(confidence) : undefined}
            aria-valuetext={confidence != null ? `${Math.round(confidence)}%` : "not reported"}
          >
            <div
              className="h-full rounded-full bg-zinc-300/70 transition-[width] duration-700"
              style={{ width: `${confidence ?? 0}%` }}
            />
          </div>
          <span className="w-24 text-right font-mono text-[10px] text-zinc-500">
            {confidence != null ? `${Math.round(confidence)}% conf.` : "no confidence"}
          </span>
        </div>
      )}

      <div className="flex justify-between gap-3 text-[11px]">
        <span className="min-w-0 text-zinc-500">{meta.drives}</span>
        {status && <span className={`shrink-0 ${status.tone}`}>{status.text}</span>}
      </div>
    </li>
  );
}

export function ExploreReadings({ snapshot }: { snapshot: MeasurementSnapshot }) {
  const open = snapshot.session != null && snapshot.session.endedAt == null;
  return (
    <section
      aria-label="Live measurements"
      className="w-80 max-w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/55 p-5 backdrop-blur-md"
    >
      <ul className="divide-y divide-zinc-800/70">
        {METRICS.map((meta) => (
          <Readout key={meta.id} meta={meta} state={snapshot.metrics[meta.id]} open={open} />
        ))}
      </ul>
    </section>
  );
}
