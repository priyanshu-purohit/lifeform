"use client";

import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { useMeasurements } from "@/hooks/use-measurements";
import { useSavedSessions } from "@/hooks/use-saved-sessions";
import { NowPanel } from "./now-panel";
import { SessionCompare } from "./session-compare";
import { SessionHistory } from "./session-history";
import { SessionObservations } from "./session-observations";

function Section({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`section-${index}`} className="flex flex-col gap-5">
      <h2 id={`section-${index}`} className="font-mono text-[11px] uppercase tracking-[0.35em] text-teal-200/70">
        <span className="text-zinc-600">{index}</span> {title}
      </h2>
      {children}
    </section>
  );
}

export function UnderstandExperience() {
  const snapshot = useMeasurements();
  const { sessions, error: loadError } = useSavedSessions();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  // If the viewed session is deleted, fall back to the default view.
  const viewing = sessions?.find((s) => s.id === viewingId) ?? null;
  const error = actionError || loadError;

  return (
    <div className="min-h-svh bg-background text-zinc-100">
      <AppHeader current="Understand" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-6 pb-16 pt-6 sm:px-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-light text-zinc-100">Understand</h1>
          <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
            The numbers behind your sessions, with when they were read and how confident the SDK
            was. Saved on this computer only.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-4 py-2 text-xs text-amber-100">
            {error}
          </p>
        )}

        <Section index="01" title="Now">
          <NowPanel
            snapshot={snapshot}
            sessions={sessions}
            viewing={viewing}
            onBackToLatest={() => setViewingId(null)}
            onSimulateError={setActionError}
          />
        </Section>

        <Section index="02" title="History">
          <SessionHistory
            sessions={sessions}
            viewingId={viewing?.id ?? null}
            onView={(id) => {
              setViewingId(id);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onError={setActionError}
          />
        </Section>

        <Section index="03" title="Compare">
          <SessionCompare sessions={sessions} />
        </Section>

        <Section index="04" title="Observations">
          <SessionObservations sessions={sessions} />
        </Section>

        <p className="text-[11px] text-zinc-600">
          LIFEFORM is not a medical device. Readings are camera-based estimates from the SmartSpectra SDK.
        </p>
      </main>
    </div>
  );
}
