"use client";

import type { MeasurementSnapshot, MetricId, MetricState } from "@/features/measurements";
import { phraseBarsFor } from "@/features/create/music-generator";
import type { MusicDrivers as Drivers, MusicTargets } from "@/features/create/music-mapping";

interface Row {
  id: MetricId;
  label: string;
  unit: string;
  digits: number;
  dot: string;
  /** What the metric shapes, shown while it has no reading. */
  shapes: string;
  waiting: string;
  /** What happens in the music while this metric has no reading. */
  without: string;
}

const ROWS: readonly Row[] = [
  {
    id: "pulseRate",
    label: "Pulse",
    unit: "bpm",
    digits: 0,
    dot: "bg-teal-300",
    shapes: "Tempo, rhythm and percussion",
    waiting: "Reading…",
    without: "No percussion until a pulse reading arrives",
  },
  {
    id: "breathingRate",
    label: "Breathing",
    unit: "/min",
    digits: 1,
    dot: "bg-indigo-300",
    shapes: "Phrase length, note length and the pad",
    waiting: "Needs about 30 s",
    without: "Phrases keep a neutral length",
  },
  {
    id: "hrvRmssd",
    label: "HRV",
    unit: "ms",
    digits: 0,
    dot: "bg-amber-300",
    shapes: "Melodic and harmonic variation",
    waiting: "Only if the SDK reports it",
    without: "Variation stays neutral",
  },
];

const percent = (v: number) => `${Math.round(v * 100)}%`;

function effect(id: MetricId, targets: MusicTargets, tempoBpm: number): string {
  if (id === "pulseRate") {
    const trend = targets.trend > 0.15 ? " · building" : targets.trend < -0.15 ? " · easing" : "";
    return `Tempo ${Math.round(tempoBpm)} beats/min · rhythm ${percent(targets.intensity)}${trend}`;
  }
  if (id === "breathingRate") {
    const bars = phraseBarsFor({ ...targets, tempoBpm });
    return `Phrase of ${bars} ${bars === 1 ? "bar" : "bars"} · note length ${percent(targets.sustain)}`;
  }
  return `Variation ${percent(targets.variation)}`;
}

function DriverRow({
  row,
  state,
  open,
  driving,
  influence,
  text,
}: {
  row: Row;
  state: MetricState;
  open: boolean;
  driving: boolean;
  influence: number;
  text: string;
}) {
  const has = open && state.smoothed != null;
  return (
    <li className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400">
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full transition-opacity duration-700 ${row.dot}`}
            style={{ opacity: 0.2 + influence * 0.8 }}
          />
          {row.label}
        </span>
        {has ? (
          <span className={`tabular-nums ${state.freshness === "stale" ? "text-zinc-500" : "text-zinc-100"}`}>
            <span className="text-2xl font-light">{state.smoothed!.toFixed(row.digits)}</span>{" "}
            <span className="text-xs text-zinc-500">{row.unit}</span>
          </span>
        ) : (
          <span className="text-xs text-zinc-500">{open ? row.waiting : "—"}</span>
        )}
      </div>
      <p className={`text-sm ${driving ? "text-teal-100" : "text-zinc-500"}`}>
        <span aria-hidden="true" className="text-zinc-600">→ </span>
        {driving ? text : open ? row.without : row.shapes}
      </p>
      {driving && state.freshness === "stale" && (
        <p className="text-[11px] text-amber-300/90">Signal lost · last value, fading out</p>
      )}
    </li>
  );
}

/** Which measurement is shaping which part of the music right now. */
export function MusicDrivers({
  snapshot,
  targets,
  drivers,
  tempoBpm,
}: {
  snapshot: MeasurementSnapshot;
  targets: MusicTargets;
  drivers: Drivers;
  /** The tempo actually playing; it glides toward the target. null while silent. */
  tempoBpm: number | null;
}) {
  const open = snapshot.session != null && snapshot.session.endedAt == null;
  const driving: Record<MetricId, boolean> = {
    pulseRate: drivers.pulse,
    breathingRate: drivers.breathing,
    hrvRmssd: drivers.hrv,
  };
  const influence: Record<MetricId, number> = {
    pulseRate: targets.pulseDrive,
    breathingRate: targets.breathDrive,
    // HRV has no drive of its own in the targets; it is on or off here.
    hrvRmssd: drivers.hrv ? 1 : 0,
  };
  const tempo = tempoBpm ?? targets.tempoBpm;

  return (
    <section
      aria-label="What is shaping the music"
      className="rounded-2xl border border-zinc-800/70 bg-zinc-950/55 p-6 backdrop-blur-md"
    >
      <h2 className="mb-5 font-mono text-[11px] uppercase tracking-[0.35em] text-teal-200/70">
        What is shaping the music
      </h2>
      <ul className="divide-y divide-zinc-800/70">
        {ROWS.map((row) => (
          <DriverRow
            key={row.id}
            row={row}
            state={snapshot.metrics[row.id]}
            open={open}
            driving={driving[row.id]}
            influence={influence[row.id]}
            text={effect(row.id, targets, tempo)}
          />
        ))}
      </ul>
    </section>
  );
}
