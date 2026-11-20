"use client";

import type { EngineStatus, MusicEngine } from "@/features/create/audio-engine";
import { STYLES, chordName, type MusicStyle } from "@/features/create/music-generator";
import { MusicVisualizer } from "./music-visualizer";

const STYLE_NOTES: Record<MusicStyle, string> = {
  ambient: "Slow chords, long notes, a soft pulse",
  organic: "Warm plucked tones, light percussion",
  electronic: "Synth bass, steady beat, bright lead",
};

const button =
  "inline-flex h-10 items-center justify-center rounded-full px-6 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/70 disabled:cursor-not-allowed disabled:opacity-40";

function nowPlaying(status: EngineStatus): string {
  if (status.state === "idle") {
    return status.finished ? "Finished · press Play to hear it again" : "Silent until you press Play";
  }
  const parts = [status.state === "paused" ? "Paused" : "Playing"];
  if (status.bar != null) {
    parts.push(status.totalBars != null ? `Bar ${status.bar + 1} of ${status.totalBars}` : `Bar ${status.bar + 1}`);
  }
  if (status.chordDegree != null) parts.push(chordName(status.style, status.chordDegree));
  if (status.tempoBpm != null) parts.push(`${Math.round(status.tempoBpm)} beats/min`);
  return parts.join(" · ");
}

/** Play, pause, resume, stop, volume and style, for Live Mode and Session Mode. */
export function MusicPlayer({
  status,
  engine,
  unavailable,
}: {
  status: EngineStatus;
  engine: MusicEngine;
  /** Why there is nothing to play (Session Mode with no usable session), or undefined. */
  unavailable?: string;
}) {
  const playing = status.state === "playing";
  const idle = status.state === "idle";
  const progress =
    status.totalBars != null && status.bar != null ? (status.bar + 1) / status.totalBars : status.finished ? 1 : 0;

  return (
    <section
      aria-label="Music player"
      className="flex flex-col gap-6 rounded-2xl border border-zinc-800/70 bg-zinc-950/55 p-6 backdrop-blur-md"
    >
      <MusicVisualizer getAnalyser={engine.getAnalyser} active={playing} />

      <p aria-live="polite" className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400">
        {unavailable && idle ? unavailable : nowPlaying(status)}
      </p>

      {status.mode === "session" && (
        <div
          role="progressbar"
          aria-label="Position in the piece"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-1 overflow-hidden rounded-full bg-zinc-800"
        >
          <div className="h-full rounded-full bg-teal-200/80 transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {playing ? (
          <button
            type="button"
            onClick={() => void engine.pause()}
            className={`${button} bg-teal-200 font-medium text-zinc-950 hover:bg-teal-100`}
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void engine.play()}
            disabled={unavailable != null}
            className={`${button} bg-teal-200 font-medium text-zinc-950 hover:bg-teal-100`}
          >
            {idle ? "Play" : "Resume"}
          </button>
        )}
        <button
          type="button"
          onClick={engine.stop}
          disabled={idle}
          className={`${button} border border-zinc-700 text-zinc-200 hover:border-red-400/60 hover:text-red-200`}
        >
          Stop
        </button>

        <label className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={status.volume}
            onChange={(e) => engine.setVolume(Number(e.target.value))}
            aria-valuetext={`${Math.round(status.volume * 100)}%`}
            className="w-32 accent-teal-200"
          />
          <span className="w-9 text-right font-mono text-[11px] tabular-nums text-zinc-500">
            {Math.round(status.volume * 100)}%
          </span>
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400">Style</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(STYLES) as MusicStyle[]).map((id) => (
            <label key={id} className="cursor-pointer">
              <input
                type="radio"
                name="music-style"
                value={id}
                checked={status.style === id}
                onChange={() => engine.setStyle(id)}
                className="peer sr-only"
              />
              <span className="flex h-full flex-col gap-1 rounded-xl border border-zinc-800 px-4 py-3 transition-colors hover:border-zinc-600 peer-checked:border-teal-300/60 peer-checked:bg-teal-950/30 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-200/70">
                <span className="text-sm text-zinc-100">{STYLES[id].label}</span>
                <span className="text-[11px] leading-relaxed text-zinc-500">{STYLE_NOTES[id]}</span>
              </span>
            </label>
          ))}
        </div>
        {playing && <p className="text-[11px] text-zinc-500">A new style starts at the next bar.</p>}
      </fieldset>

      {status.error && (
        <p role="alert" className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-4 py-2 text-xs text-amber-100">
          {status.error}
        </p>
      )}
    </section>
  );
}
