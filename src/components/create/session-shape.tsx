"use client";

import type { MetricId } from "@/features/measurements";
import type { SessionSummary } from "@/features/sessions";
import type { SessionPlan } from "@/features/create/session-music";
import { formatDuration } from "@/features/understand/format";
import { METRIC_META, METRIC_ORDER, formatValue } from "@/features/understand/metric-meta";
import { effectText } from "./music-drivers";

const COVERAGE_KEY = { pulseRate: "pulse", breathingRate: "breathing", hrvRmssd: "hrv" } as const;

const DOT: Record<MetricId, string> = {
  pulseRate: "bg-teal-300",
  breathingRate: "bg-indigo-300",
  hrvRmssd: "bg-amber-300",
};

/** What a metric shapes, and what the piece does where the session has no reading of it. */
const SHAPES: Record<MetricId, { shapes: string; without: string }> = {
  pulseRate: { shapes: "tempo, rhythm and percussion", without: "No percussion, and a neutral tempo" },
  breathingRate: { shapes: "phrase length, note length and the pad", without: "Phrases keep a neutral length" },
  hrvRmssd: { shapes: "melodic and harmonic variation", without: "Variation stays neutral" },
};

const percent = (v: number) => `${Math.round(v * 100)}%`;

/** How the chosen session shapes its piece: the piece's length, and each metric's part. */
export function SessionShape({
  summary,
  plan,
  bar,
}: {
  summary: SessionSummary;
  plan: SessionPlan;
  /** The bar that is playing, or null while silent. */
  bar: number | null;
}) {
  const current = bar != null ? plan.bars[bar] : undefined;
  return (
    <section
      aria-label="What shapes this piece"
      className="rounded-2xl border border-zinc-800/70 bg-zinc-950/55 p-6 backdrop-blur-md"
    >
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.35em] text-teal-200/70">
        What shapes this piece
      </h2>
      <p className="mb-5 text-sm leading-relaxed text-zinc-400">
        {formatDuration(plan.durationSeconds * 1000)} of music in {plan.bars.length} bars
        {plan.compressed
          ? `, compressed from a ${formatDuration(summary.durationMs)} session.`
          : `, following the ${formatDuration(summary.durationMs)} session from start to end.`}{" "}
        The same session and style always give the same piece.
      </p>
      <ul className="divide-y divide-zinc-800/70">
        {METRIC_ORDER.map((id) => {
          const meta = METRIC_META[id];
          const metric = summary.metrics[id];
          const coverage = plan.coverage[COVERAGE_KEY[id]];
          const driving = current ? current.drivers[COVERAGE_KEY[id]] : coverage > 0;
          return (
            <li key={id} className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-4">
                <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400">
                  <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${DOT[id]}`}
                    style={{ opacity: driving ? 1 : 0.2 }}
                  />
                  {meta.label}
                </span>
                <span className="text-xs text-zinc-400">
                  {metric?.stats
                    ? `Session average ${formatValue(id, metric.stats.mean)} ${meta.unit}`
                    : metric
                      ? "Too few steady readings for an average"
                      : "Not measured in this session"}
                </span>
              </div>
              <p className={`text-sm ${driving ? "text-teal-100" : "text-zinc-500"}`}>
                <span aria-hidden="true" className="text-zinc-600">→ </span>
                {current
                  ? current.drivers[COVERAGE_KEY[id]]
                    ? effectText(id, current.targets, current.tempoBpm)
                    : `${SHAPES[id].without} here: no reading at this point`
                  : coverage > 0
                    ? `Shapes ${SHAPES[id].shapes} in ${percent(coverage)} of the piece`
                    : SHAPES[id].without}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
