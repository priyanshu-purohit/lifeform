"use client";

import { useState } from "react";
import Link from "next/link";
import {
  stopMeasurement,
  stopSimulation,
  type MeasurementSnapshot,
} from "@/features/measurements";
import { useMeasurements } from "@/hooks/use-measurements";

type Experience = "Explore" | "Understand" | "Create";

const NAV: readonly { name: Experience; href: string; ready: boolean }[] = [
  { name: "Explore", href: "/explore", ready: true },
  { name: "Understand", href: "/understand", ready: true },
  { name: "Create", href: "/create", ready: false },
];

export function StatusChip({ snapshot }: { snapshot: MeasurementSnapshot }) {
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

/** Logo, the three experiences, and the measuring status with a Stop button. */
export function AppHeader({ current, className = "" }: { current: Experience; className?: string }) {
  const snapshot = useMeasurements();
  const [stopError, setStopError] = useState("");
  const open = snapshot.session != null && snapshot.session.endedAt == null;
  const simulated = snapshot.session?.source === "simulation";

  async function stop() {
    setStopError("");
    if (simulated) {
      stopSimulation();
      return;
    }
    try {
      // Ends the session; MeasurementLifecycle then switches the camera off.
      await stopMeasurement();
    } catch (e) {
      setStopError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <header className={`flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10 ${className}`}>
      <Link href="/" className="font-mono text-xs tracking-[0.4em] text-zinc-400 hover:text-zinc-200">
        LIFEFORM
      </Link>
      <nav aria-label="Experiences">
        <ul className="flex items-center gap-1 rounded-full border border-zinc-800/70 bg-zinc-950/50 p-1 backdrop-blur-md">
          {NAV.map((item, i) => {
            const active = item.name === current;
            return (
              <li key={item.name}>
                {item.ready ? (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] transition-colors ${
                      active ? "bg-zinc-100/10 text-teal-100" : "text-zinc-400 hover:text-zinc-100"
                    }`}
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
            );
          })}
        </ul>
      </nav>
      <div className="flex flex-col items-end gap-1">
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
        {stopError && (
          <p role="alert" className="text-[11px] text-amber-200">
            {stopError}
          </p>
        )}
      </div>
    </header>
  );
}
