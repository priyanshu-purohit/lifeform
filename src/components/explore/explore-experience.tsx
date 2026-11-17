"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  SIMULATION_AVAILABLE,
  isSimulatedSignalLost,
  isSimulationRunning,
  setSimulatedSignalLost,
  startSimulation,
  stopMeasurement,
  stopSimulation,
  subscribeSimulation,
  type MeasurementSnapshot,
} from "@/features/measurements";
import type { ExploreOptions } from "@/features/explore/canvas-engine";
import { useMeasurements } from "@/hooks/use-measurements";
import { ExploreWorld } from "./explore-world";
import { ExploreReadings } from "./explore-readings";
import { ExploreControls } from "./explore-controls";

const NAV = [
  { name: "Explore", href: "/explore", ready: true },
  { name: "Understand", href: "/understand", ready: false },
  { name: "Create", href: "/create", ready: false },
] as const;

function useSimulation() {
  const running = useSyncExternalStore(subscribeSimulation, isSimulationRunning, () => false);
  const signalLost = useSyncExternalStore(subscribeSimulation, isSimulatedSignalLost, () => false);
  return { running, signalLost };
}

type Phase = "resting" | "ended" | "searching" | "live" | "lost";

function phaseOf(s: MeasurementSnapshot): Phase {
  if (!s.session) return "resting";
  if (s.session.endedAt != null) return "ended";
  const { pulseRate, breathingRate } = s.metrics;
  const metrics = [pulseRate, breathingRate];
  if (metrics.some((m) => m.freshness === "live")) return "live";
  if (metrics.some((m) => m.freshness === "stale")) return "lost";
  return "searching";
}

function StatusChip({ snapshot }: { snapshot: MeasurementSnapshot }) {
  const open = snapshot.session != null && snapshot.session.endedAt == null;
  if (open && snapshot.session?.source === "simulation") {
    return (
      <span className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-950/50 px-3 py-1 font-mono text-[11px] text-amber-200 backdrop-blur">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-300" />
        Simulated data · not a camera reading
      </span>
    );
  }
  if (open) {
    return (
      <span className="flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-950/40 px-3 py-1 font-mono text-[11px] text-teal-100 backdrop-blur">
        <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-red-400" />
        Camera on · measuring
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1 font-mono text-[11px] text-zinc-400 backdrop-blur">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-zinc-600" />
      Not measuring
    </span>
  );
}

const button =
  "inline-flex h-10 items-center justify-center rounded-full px-5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/70";

function RestingCard({ phase, onSimulate }: { phase: "resting" | "ended"; onSimulate: () => void }) {
  return (
    <div className="pointer-events-auto flex max-w-md flex-col items-center gap-5 rounded-2xl border border-zinc-800/70 bg-zinc-950/60 p-8 text-center backdrop-blur-md">
      <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-teal-200/70">
        {phase === "ended" ? "Session ended" : "Resting"}
      </span>
      <h2 className="text-2xl font-light text-zinc-100">
        {phase === "ended" ? "The world has returned to rest" : "This world is waiting for you"}
      </h2>
      <p className="text-sm leading-relaxed text-zinc-400">
        Nothing is being measured, so nothing you see here is your data. Start a measurement
        and the world will take on the rhythm of your pulse and breathing.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/setup" className={`${button} bg-teal-200 font-medium text-zinc-950 hover:bg-teal-100`}>
          Go to measurement setup →
        </Link>
        {SIMULATION_AVAILABLE && (
          <button
            type="button"
            onClick={onSimulate}
            className={`${button} border border-amber-400/40 text-amber-200 hover:bg-amber-950/40`}
          >
            Run simulation (dev only)
          </button>
        )}
      </div>
    </div>
  );
}

function Notice({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" }) {
  const tones = {
    neutral: "border-zinc-700/70 bg-zinc-950/60 text-zinc-300",
    warn: "border-amber-400/40 bg-amber-950/50 text-amber-100",
  };
  return (
    <p
      role="status"
      className={`pointer-events-auto max-w-md rounded-full border px-4 py-2 text-center text-xs backdrop-blur-md ${tones[tone]}`}
    >
      {children}
    </p>
  );
}

export function ExploreExperience() {
  const snapshot = useMeasurements();
  const simulation = useSimulation();
  const [options, setOptions] = useState<ExploreOptions>({ palette: "tide", density: 1 });
  const [showReadings, setShowReadings] = useState(true);
  const [actionError, setActionError] = useState("");

  const phase = phaseOf(snapshot);
  const open = phase !== "resting" && phase !== "ended";
  const simulated = snapshot.session?.source === "simulation";

  function runSimulation() {
    setActionError("");
    try {
      startSimulation();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function stop() {
    setActionError("");
    if (simulated) {
      stopSimulation();
      return;
    }
    try {
      // Ends the session; MeasurementLifecycle then switches the camera off.
      await stopMeasurement();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const guidance = snapshot.guidance?.hint;
  const sdkError = snapshot.error?.message;

  return (
    <div className="relative isolate min-h-svh overflow-hidden bg-background text-zinc-100">
      <ExploreWorld options={options} />

      {/* Overlay UI. The wrapper ignores the pointer so the world stays interactive. */}
      <div className="pointer-events-none relative z-10 flex min-h-svh flex-col">
        <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10">
          <Link href="/" className="font-mono text-xs tracking-[0.4em] text-zinc-400 hover:text-zinc-200">
            LIFEFORM
          </Link>
          <nav aria-label="Experiences">
            <ul className="flex items-center gap-1 rounded-full border border-zinc-800/70 bg-zinc-950/50 p-1 backdrop-blur-md">
              {NAV.map((item, i) => (
                <li key={item.name}>
                  {item.ready ? (
                    <Link
                      href={item.href}
                      aria-current={item.name === "Explore" ? "page" : undefined}
                      className="block rounded-full bg-zinc-100/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-teal-100"
                    >
                      <span className="text-zinc-500">0{i + 1}</span> {item.name}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      title="Coming soon"
                      className="block cursor-not-allowed px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-600"
                    >
                      0{i + 1} {item.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-2">
            <StatusChip snapshot={snapshot} />
            {open && (
              <button
                type="button"
                onClick={() => void stop()}
                className="rounded-full border border-zinc-700 bg-zinc-950/60 px-3 py-1 font-mono text-[11px] text-zinc-200 backdrop-blur hover:border-red-400/60 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
              >
                {simulated ? "Stop simulation" : "Stop"}
              </button>
            )}
          </div>
        </header>

        {/* Centre: state messages. */}
        <main className="flex flex-1 flex-col items-center justify-start gap-3 px-6 pt-4">
          <h1 className="sr-only">Explore</h1>
          {(phase === "resting" || phase === "ended") && (
            <div className="flex flex-1 items-center">
              <RestingCard phase={phase} onSimulate={runSimulation} />
            </div>
          )}
          {phase === "searching" && (
            <Notice>Finding your pulse. Sit still and face a soft, even light.</Notice>
          )}
          {phase === "lost" && (
            <Notice tone="warn">
              Signal lost. The world is fading toward rest; it will return when readings resume.
            </Notice>
          )}
          {open && guidance && <Notice tone="warn">{guidance}</Notice>}
          {(actionError || sdkError) && <Notice tone="warn">{actionError || sdkError}</Notice>}
        </main>

        <footer className="flex flex-col items-stretch gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between sm:px-10">
          <div className="pointer-events-auto flex flex-col gap-3">
            {showReadings && <ExploreReadings snapshot={snapshot} />}
            {simulation.running && (
              <button
                type="button"
                aria-pressed={simulation.signalLost}
                onClick={() => setSimulatedSignalLost(!simulation.signalLost)}
                className="self-start rounded-full border border-amber-400/40 px-3 py-1 font-mono text-[11px] text-amber-200 hover:bg-amber-950/40"
              >
                {simulation.signalLost ? "Restore simulated signal" : "Drop simulated signal (test)"}
              </button>
            )}
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-3">
            <ExploreControls
              options={options}
              onOptionsChange={(patch) => setOptions((o) => ({ ...o, ...patch }))}
              showReadings={showReadings}
              onShowReadingsChange={setShowReadings}
            />
            <p className="max-w-xs text-right text-[10px] leading-relaxed text-zinc-600">
              {simulated
                ? "Driven by simulated values for development. Not anyone's physiology."
                : "Ripples follow your pulse rate, not individual heartbeats. Not a medical device."}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
