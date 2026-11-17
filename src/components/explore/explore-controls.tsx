"use client";

import { useSyncExternalStore } from "react";
import { PALETTES, type ExploreOptions, type PaletteId } from "@/features/explore/canvas-engine";

const SWATCH: Record<PaletteId, string> = {
  tide: "from-teal-300 to-indigo-400",
  ember: "from-amber-300 to-rose-400",
  aurora: "from-emerald-300 to-fuchsia-400",
};

function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

function useIsFullscreen(): boolean {
  return useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement != null,
    () => false,
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void document.documentElement.requestFullscreen().catch(() => {});
}

interface Props {
  options: ExploreOptions;
  onOptionsChange: (patch: Partial<ExploreOptions>) => void;
  showReadings: boolean;
  onShowReadingsChange: (show: boolean) => void;
}

export function ExploreControls({ options, onOptionsChange, showReadings, onShowReadingsChange }: Props) {
  const fullscreen = useIsFullscreen();

  return (
    <section
      aria-label="Visual controls"
      className="flex w-80 max-w-full flex-col gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-950/55 p-5 backdrop-blur-md"
    >
      <fieldset className="flex items-center justify-between gap-4">
        <legend className="sr-only">Palette</legend>
        <span aria-hidden="true" className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400">
          Palette
        </span>
        <div className="flex gap-2">
          {(Object.keys(PALETTES) as PaletteId[]).map((id) => (
            <label key={id} title={PALETTES[id].label} className="cursor-pointer">
              <input
                type="radio"
                name="explore-palette"
                value={id}
                checked={options.palette === id}
                onChange={() => onOptionsChange({ palette: id })}
                className="peer sr-only"
              />
              <span className="sr-only">{PALETTES[id].label}</span>
              <span
                aria-hidden="true"
                className={`block size-6 rounded-full bg-linear-to-br ${SWATCH[id]} opacity-60 ring-offset-2 ring-offset-zinc-950 transition peer-checked:opacity-100 peer-checked:ring-2 peer-checked:ring-zinc-200 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-200 hover:opacity-90`}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center justify-between gap-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400">Density</span>
        <input
          type="range"
          min={0.4}
          max={1.6}
          step={0.1}
          value={options.density}
          onChange={(e) => onOptionsChange({ density: Number(e.target.value) })}
          className="w-32 accent-teal-200"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={showReadings}
          onClick={() => onShowReadingsChange(!showReadings)}
          className="flex-1 rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60"
        >
          {showReadings ? "Hide readings" : "Show readings"}
        </button>
        <button
          type="button"
          aria-pressed={fullscreen}
          onClick={toggleFullscreen}
          className="flex-1 rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60"
        >
          {fullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Move to stir · Hold to gather · Click to send a ripple
      </p>
    </section>
  );
}
