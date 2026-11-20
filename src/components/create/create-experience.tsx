"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  SIMULATION_AVAILABLE,
  startSimulation,
  type MeasurementSnapshot,
} from "@/features/measurements";
import { mapToMusic } from "@/features/create/music-mapping";
import { composeSession, type SessionPlan } from "@/features/create/session-music";
import { useAudio } from "@/hooks/use-audio";
import { useMeasurements } from "@/hooks/use-measurements";
import { useSavedSessions } from "@/hooks/use-saved-sessions";
import { AppHeader } from "@/components/app-header";
import { MusicDrivers } from "./music-drivers";
import { MusicPlayer } from "./music-player";
import { SessionPicker } from "./session-picker";
import { SessionShape } from "./session-shape";

type Mode = "live" | "session";
type Phase = "resting" | "ended" | "searching" | "live" | "lost";

function phaseOf(s: MeasurementSnapshot): Phase {
  if (!s.session) return "resting";
  if (s.session.endedAt != null) return "ended";
  const metrics = [s.metrics.pulseRate, s.metrics.breathingRate];
  if (metrics.some((m) => m.freshness === "live")) return "live";
  if (metrics.some((m) => m.freshness === "stale")) return "lost";
  return "searching";
}

const MODES: readonly { id: Mode; label: string; note: string }[] = [
  { id: "live", label: "Live", note: "Follows your measurements as they arrive" },
  { id: "session", label: "From a session", note: "A finished piece made from a saved session" },
];

const button =
  "inline-flex h-9 items-center justify-center rounded-full px-4 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/70";

function Notice({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" }) {
  const tones = {
    neutral: "border-zinc-800/70 bg-zinc-950/55 text-zinc-300",
    warn: "border-amber-400/40 bg-amber-950/40 text-amber-100",
  };
  return (
    <div role="status" className={`rounded-2xl border px-5 py-4 text-sm leading-relaxed backdrop-blur-md ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function CreateExperience() {
  const snapshot = useMeasurements();
  const { status, engine } = useAudio();
  const saved = useSavedSessions();
  const [mode, setMode] = useState<Mode>("live");
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const music = useMemo(() => mapToMusic(snapshot), [snapshot]);

  // One plan per saved session that is long enough to become music.
  const plans = useMemo(() => {
    const map = new Map<string, SessionPlan>();
    for (const s of saved.sessions ?? []) {
      const plan = composeSession(s);
      if (plan) map.set(s.id, plan);
    }
    return map;
  }, [saved.sessions]);
  const usable = useMemo(() => new Set(plans.keys()), [plans]);
  // The chosen session, or the newest usable one until the user chooses.
  const selected =
    saved.sessions?.find((s) => s.id === chosenId && plans.has(s.id)) ??
    saved.sessions?.find((s) => plans.has(s.id)) ??
    null;
  const plan = selected ? (plans.get(selected.id) ?? null) : null;

  // The engine plays the chosen session's plan in Session Mode, live measurements otherwise.
  // Changing either stops what is playing.
  const loadedPlan = mode === "session" ? plan : null;
  useEffect(() => {
    engine.setPlan(loadedPlan);
  }, [engine, loadedPlan]);

  const phase = phaseOf(snapshot);
  const open = phase !== "resting" && phase !== "ended";
  const simulated = open && snapshot.session?.source === "simulation";
  const guidance = snapshot.guidance?.hint;
  const sdkError = snapshot.error?.message;

  function runSimulation() {
    setActionError("");
    try {
      startSimulation();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const unavailable =
    mode === "session" && !plan
      ? saved.sessions == null
        ? "Loading saved sessions…"
        : "Choose a saved session to play"
      : undefined;

  return (
    <div className="min-h-svh bg-background text-zinc-100">
      <AppHeader current="Create" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 pt-6 sm:px-10">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-teal-200/70">
            {mode === "live" ? "Live Mode" : "Session Mode"}
          </p>
          <h1 className="text-3xl font-light text-zinc-100">Create</h1>
          <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
            {mode === "live"
              ? "Music made on this computer from your measured pulse and breathing. It changes at each bar line, never mid-note, so it stays music while it follows you."
              : "Music made on this computer from a session you saved. Each bar reads the next moment of the session, so the piece follows it from start to end."}
          </p>
        </div>

        <fieldset>
          <legend className="sr-only">Mode</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
            {MODES.map((m) => (
              <label key={m.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="music-mode"
                  value={m.id}
                  checked={mode === m.id}
                  onChange={() => setMode(m.id)}
                  className="peer sr-only"
                />
                <span className="flex h-full flex-col gap-1 rounded-xl border border-zinc-800 px-4 py-3 transition-colors hover:border-zinc-600 peer-checked:border-teal-300/60 peer-checked:bg-teal-950/30 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-200/70">
                  <span className="text-sm text-zinc-100">{m.label}</span>
                  <span className="text-[11px] leading-relaxed text-zinc-500">{m.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "live" && (
          <>
            {!open && (
              <Notice>
                <p>
                  {phase === "ended"
                    ? "The session has ended, so the music has returned to rest."
                    : "Nothing is being measured."}{" "}
                  Play now and you will hear only a quiet resting tone, which is not your data. Start
                  a measurement and your pulse and breathing will shape the music.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href="/setup" className={`${button} bg-teal-200 font-medium text-zinc-950 hover:bg-teal-100`}>
                    Go to measurement setup →
                  </Link>
                  {SIMULATION_AVAILABLE && (
                    <button
                      type="button"
                      onClick={runSimulation}
                      className={`${button} border border-amber-400/40 text-amber-200 hover:bg-amber-950/40`}
                    >
                      Run simulation (dev only)
                    </button>
                  )}
                </div>
              </Notice>
            )}
            {phase === "searching" && (
              <Notice>Finding your pulse. The rhythm joins in when the first reading arrives.</Notice>
            )}
            {phase === "lost" && (
              <Notice tone="warn">
                Signal lost. The music is thinning toward rest; it will fill in again when readings resume.
              </Notice>
            )}
            {open && guidance && <Notice tone="warn">{guidance}</Notice>}
            {(actionError || sdkError) && <Notice tone="warn">{actionError || sdkError}</Notice>}
          </>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <MusicPlayer status={status} engine={engine} unavailable={unavailable} />
          {mode === "live" ? (
            <MusicDrivers
              snapshot={snapshot}
              targets={music.targets}
              drivers={music.drivers}
              tempoBpm={status.tempoBpm}
            />
          ) : (
            <div className="flex flex-col gap-6">
              <SessionPicker
                sessions={saved.sessions}
                error={saved.error}
                selectedId={selected?.id ?? null}
                usable={usable}
                onSelect={setChosenId}
              />
              {selected && plan && <SessionShape summary={selected} plan={plan} bar={status.bar} />}
            </div>
          )}
        </div>

        <p className="max-w-2xl text-[11px] leading-relaxed text-zinc-600">
          {(mode === "live" ? simulated : selected?.source === "simulation")
            ? "Driven by simulated values for development. Not anyone's physiology."
            : "Tempo follows your pulse rate, not individual heartbeats. The mapping is aesthetic and does not describe mood or health. LIFEFORM is not a medical device."}
        </p>
      </main>
    </div>
  );
}
