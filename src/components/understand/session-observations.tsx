"use client";

import { useMemo } from "react";
import type { SessionSummary } from "@/features/sessions";
import { formatDateTime } from "@/features/understand/format";
import { METRIC_META, formatValue, metricNoun } from "@/features/understand/metric-meta";
import {
  buildObservations,
  type BaselineStrip,
  type MetricObservations,
} from "@/features/understand/observations";
import type { MetricId } from "@/features/measurements";
import { SimulatedBadge } from "./now-panel";

/** Each session average as a dot on one line; the latest is coloured, the baseline is a tick. */
function Strip({ metric, strip }: { metric: MetricId; strip: BaselineStrip }) {
  const meta = METRIC_META[metric];
  const values = strip.points.map((p) => p.mean);
  if (strip.baseline != null) values.push(strip.baseline);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.1, meta.sameWithin);
  const min = lo - pad;
  const span = hi + pad - min;
  const x = (v: number) => `${((v - min) / span) * 100}%`;
  const latest = strip.points.find((p) => p.latest);
  const fmt = (v: number) => `${formatValue(metric, v)} ${meta.unit}`;

  const label =
    `Session averages for ${metricNoun(metric)}: ${strip.points.map((p) => formatValue(metric, p.mean)).join(", ")} ${meta.unit}.` +
    (strip.baseline != null ? ` Baseline ${fmt(strip.baseline)}.` : "") +
    (latest ? ` Latest ${fmt(latest.mean)}.` : "");

  return (
    <figure className="flex flex-col gap-2">
      <div role="img" aria-label={label} className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-800" />
        {strip.baseline != null && (
          <div
            className="absolute top-1 bottom-1 w-px bg-zinc-400/70"
            style={{ left: x(strip.baseline) }}
            title={`Baseline ${fmt(strip.baseline)}`}
          />
        )}
        {strip.points
          .filter((p) => !p.latest)
          .map((p) => (
            <span
              key={p.id}
              title={`${formatDateTime(p.startedAt)} · ${fmt(p.mean)}`}
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-500/80"
              style={{ left: x(p.mean) }}
            />
          ))}
        {latest && (
          <span
            title={`Latest · ${fmt(latest.mean)}`}
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-zinc-950"
            style={{ left: x(latest.mean), background: meta.color }}
          />
        )}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: meta.color }} /> latest
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-zinc-500/80" /> earlier sessions
        </span>
        {strip.baseline != null && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-px bg-zinc-400/70" /> baseline {fmt(strip.baseline)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function MetricBlock({ m }: { m: MetricObservations }) {
  const meta = METRIC_META[m.metric];
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-950/55 p-5">
      <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400">
        <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: meta.color }} />
        {meta.label}
      </h3>
      {m.strip && <Strip metric={m.metric} strip={m.strip} />}
      <ul className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-300">
        {m.observations.map((o) => (
          <li key={o.kind} className={o.kind === "coverage" ? "text-zinc-500" : undefined}>
            {o.text}
          </li>
        ))}
      </ul>
    </article>
  );
}

function Progress({ have, need }: { have: number; need: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: need }, (_, i) => (
        <span key={i} className={`h-1 w-8 rounded-full ${i < have ? "bg-teal-200/70" : "bg-zinc-800"}`} />
      ))}
    </div>
  );
}

export function SessionObservations({ sessions }: { sessions: SessionSummary[] | null }) {
  const result = useMemo(() => (sessions ? buildObservations(sessions) : null), [sessions]);

  if (sessions == null) return <p className="text-sm text-zinc-500">Loading…</p>;

  if (!result || result.status === "needs-more") {
    const have = result?.have ?? 0;
    const need = result?.need ?? 3;
    const simulated = result?.source === "simulation";
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-zinc-800 p-5">
        <Progress have={have} need={need} />
        <p className="text-sm text-zinc-300">
          Observations need at least {need} saved {simulated ? "simulated " : ""}sessions. You have {have}
          {" "}— {need - have} more to go.
        </p>
        <p className="text-xs text-zinc-500">
          With fewer sessions there is no baseline to set a session against, so nothing is shown.
          {result && result.otherSource > 0 &&
            ` Simulated and camera sessions are counted separately, so the ${result.otherSource} ${
              simulated ? "camera" : "simulated"
            } ${result.otherSource === 1 ? "session doesn't" : "sessions don't"} count here.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-zinc-400">
          Based on {result.sessionCount} {result.source === "simulation" ? "simulated" : "camera"} sessions. Latest:{" "}
          {formatDateTime(result.latest.startedAt)}.
        </p>
        {result.source === "simulation" && <SimulatedBadge long />}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {result.metrics.map((m) => (
          <MetricBlock key={m.metric} m={m} />
        ))}
      </div>
      <p className="text-[11px] text-zinc-500">
        Baseline is the median of your earlier session averages. Averages use only readings the SDK marked as
        steady. These observations describe the numbers only; they are not health advice.
      </p>
    </div>
  );
}
