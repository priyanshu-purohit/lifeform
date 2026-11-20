"use client";

import type { MetricId, MetricState } from "@/features/measurements";
import { MIN_VALID_SAMPLES, type MetricSummary } from "@/features/sessions";
import { seriesToPoints } from "@/features/understand/chart-data";
import { formatClock } from "@/features/understand/format";
import { METRIC_META, formatValue, metricNoun } from "@/features/understand/metric-meta";
import { LiveMetricChart, StaticMetricChart } from "./metric-chart";

function CardShell({ metric, children }: { metric: MetricId; children: React.ReactNode }) {
  const meta = METRIC_META[metric];
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-950/55 p-5">
      <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400">
        <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: meta.color }} />
        {meta.label}
      </h3>
      {children}
    </article>
  );
}

function Value({ metric, value, dim = false }: { metric: MetricId; value: number; dim?: boolean }) {
  return (
    <p className={`tabular-nums ${dim ? "text-zinc-500" : "text-zinc-100"}`}>
      <span className="text-4xl font-light">{formatValue(metric, value)}</span>{" "}
      <span className="text-sm text-zinc-500">{METRIC_META[metric].unit}</span>
    </p>
  );
}

/** Placeholder the same size as a chart, so the layout doesn't jump when data arrives. */
function NoChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-800 px-4 text-center text-xs text-zinc-500">
      {children}
    </div>
  );
}

function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-zinc-500">{k}</dt>
          <dd className="whitespace-nowrap text-right font-mono text-zinc-300">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function liveStatus(state: MetricState): { text: string; tone: string } {
  if (state.freshness === "stale") return { text: "Signal lost · showing last value", tone: "text-amber-300/90" };
  if (state.latest?.validity === "unsettled") return { text: "Settling", tone: "text-zinc-400" };
  return { text: "Live", tone: "text-teal-200/90" };
}

/** A metric in the running session: smoothed value, when it was read, and SDK confidence. */
export function LiveMetricCard({ state }: { state: MetricState }) {
  const meta = METRIC_META[state.metric];
  const latest = state.latest;
  if (!latest || state.smoothed == null) {
    return (
      <CardShell metric={state.metric}>
        <p className="text-sm text-zinc-500">No reading yet</p>
        <NoChart>{meta.waiting}</NoChart>
      </CardShell>
    );
  }
  const status = liveStatus(state);
  return (
    <CardShell metric={state.metric}>
      <div className="flex items-end justify-between gap-3">
        <Value metric={state.metric} value={state.smoothed} dim={state.freshness === "stale"} />
        <span className={`pb-1.5 text-[11px] ${status.tone}`}>{status.text}</span>
      </div>
      <Facts
        items={[
          ["Read at", formatClock(latest.timestamp)],
          ["Confidence", latest.confidence != null ? `${Math.round(latest.confidence)}%` : "Not reported"],
          ["Latest raw", `${formatValue(state.metric, latest.value)} ${meta.unit}`],
        ]}
      />
      <LiveMetricChart metric={state.metric} />
    </CardShell>
  );
}

/** A metric from a saved session. `summary` undefined means it was not measured. */
export function StoredMetricCard({ metric, summary }: { metric: MetricId; summary?: MetricSummary }) {
  const meta = METRIC_META[metric];
  if (!summary) {
    return (
      <CardShell metric={metric}>
        <p className="text-sm text-zinc-500">Not measured</p>
        <NoChart>No {metricNoun(metric)} readings in this session</NoChart>
      </CardShell>
    );
  }
  const { stats } = summary;
  return (
    <CardShell metric={metric}>
      {stats ? (
        <div className="flex items-end justify-between gap-3">
          <Value metric={metric} value={stats.mean} />
          <span className="pb-1.5 text-[11px] text-zinc-500">session average</span>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          No average: {summary.validCount} steady {summary.validCount === 1 ? "reading" : "readings"}, at
          least {MIN_VALID_SAMPLES} needed
        </p>
      )}
      <Facts
        items={[
          [
            "Range",
            stats ? `${formatValue(metric, stats.min)}–${formatValue(metric, stats.max)} ${meta.unit}` : "—",
          ],
          [
            "Confidence",
            !stats ? "—" : stats.meanConfidence != null ? `${Math.round(stats.meanConfidence)}% avg` : "Not reported",
          ],
          ["Steady readings", `${summary.validCount} of ${summary.sampleCount}`],
          ["Measured", `${formatClock(summary.firstSampleAt)}–${formatClock(summary.lastSampleAt)}`],
        ]}
      />
      {summary.series.length > 0 ? (
        <StaticMetricChart metric={metric} points={seriesToPoints(summary.series, meta.maxGapMs)} />
      ) : (
        <NoChart>No chart data</NoChart>
      )}
    </CardShell>
  );
}
