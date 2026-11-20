"use client";

import { useState } from "react";
import type { SessionSummary } from "@/features/sessions";
import { compareSessions } from "@/features/understand/compare";
import { formatClock, formatDateTime, formatDuration } from "@/features/understand/format";
import { METRIC_META, formatValue } from "@/features/understand/metric-meta";

function optionLabel(s: SessionSummary): string {
  return `${formatDateTime(s.startedAt)} · ${formatDuration(s.durationMs)}${s.source === "simulation" ? " · simulated" : ""}`;
}

function Picker({
  label,
  value,
  sessions,
  onChange,
}: {
  label: string;
  value: string;
  sessions: SessionSummary[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {optionLabel(s)}
          </option>
        ))}
      </select>
    </label>
  );
}

function signed(metricValue: string, diff: number): string {
  if (diff === 0) return metricValue;
  return `${diff > 0 ? "+" : "−"}${metricValue}`;
}

export function SessionCompare({ sessions }: { sessions: SessionSummary[] | null }) {
  // Defaults: the two most recent sessions. Choices are dropped if a session is deleted.
  const [picked, setPicked] = useState<[string | null, string | null]>([null, null]);

  if (sessions == null) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (sessions.length < 2) {
    return (
      <p className="text-sm text-zinc-500">
        Comparing needs two saved sessions. You have {sessions.length}.
      </p>
    );
  }

  const byId = (id: string | null) => sessions.find((s) => s.id === id);
  const first = byId(picked[0]) ?? sessions[1];
  const second = byId(picked[1]) ?? sessions[0];
  const same = first.id === second.id;
  const c = same ? null : compareSessions(first, second);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Picker label="Session A" value={first.id} sessions={sessions} onChange={(id) => setPicked([id, second.id])} />
        <Picker label="Session B" value={second.id} sessions={sessions} onChange={(id) => setPicked([first.id, id])} />
      </div>

      {same && <p className="text-sm text-zinc-500">Pick two different sessions.</p>}

      {c && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-950/55 p-5">
          {c.mixedSources && (
            <p role="note" className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-4 py-2 text-xs text-amber-100">
              One of these sessions is simulated, so this compares a real reading with made-up development data.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="sr-only">Session averages, earlier and later</caption>
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  <th scope="col" className="pb-2 font-normal">Average</th>
                  <th scope="col" className="pb-2 text-right font-normal">
                    Earlier
                    <span className="block normal-case tracking-normal text-zinc-600">{formatClock(c.earlier.startedAt)}</span>
                  </th>
                  <th scope="col" className="pb-2 text-right font-normal">
                    Later
                    <span className="block normal-case tracking-normal text-zinc-600">{formatClock(c.later.startedAt)}</span>
                  </th>
                  <th scope="col" className="pb-2 text-right font-normal">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 tabular-nums">
                {c.metrics.map((m) => {
                  const meta = METRIC_META[m.metric];
                  const cell = (v: number | null) => (v == null ? "—" : `${formatValue(m.metric, v)} ${meta.unit}`);
                  return (
                    <tr key={m.metric}>
                      <th scope="row" className="py-2.5 text-left font-normal text-zinc-300">{meta.label}</th>
                      <td className="py-2.5 text-right text-zinc-300">{cell(m.earlier)}</td>
                      <td className="py-2.5 text-right text-zinc-300">{cell(m.later)}</td>
                      <td className="py-2.5 text-right text-zinc-100">
                        {m.difference == null
                          ? "—"
                          : `${signed(formatValue(m.metric, Math.abs(m.difference)), m.difference)} ${meta.unit}`}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <th scope="row" className="py-2.5 text-left font-normal text-zinc-300">Duration</th>
                  <td className="py-2.5 text-right text-zinc-300">{formatDuration(c.earlier.durationMs)}</td>
                  <td className="py-2.5 text-right text-zinc-300">{formatDuration(c.later.durationMs)}</td>
                  <td className="py-2.5 text-right text-zinc-100">
                    {signed(formatDuration(Math.abs(c.later.durationMs - c.earlier.durationMs)), c.later.durationMs - c.earlier.durationMs)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm text-zinc-300">
            {c.metrics.map((m) => (
              <li key={m.metric}>{m.sentence}</li>
            ))}
            <li>{c.durationSentence}</li>
          </ul>
          <p className="text-[11px] text-zinc-500">
            Averages use only readings the SDK marked as steady. These describe differences in the numbers, not health.
          </p>
        </div>
      )}
    </div>
  );
}
