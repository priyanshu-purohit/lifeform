"use client";

import { useSyncExternalStore } from "react";
import { measurementStore } from "@/features/measurements";
import { IDLE_STATUS, createMusicEngine, type EngineStatus, type MusicEngine } from "@/features/create/audio-engine";
import { mapToMusic } from "@/features/create/music-mapping";

// One engine for the app. Creating it touches no browser API; an AudioContext only exists
// after play(), which runs from a click. It reads the shared measurement store once per bar.
// Because it lives outside React, music keeps playing while the user moves between Explore,
// Understand and Create; MusicLifecycle stops it on the pages where it must not play.
export const musicEngine = createMusicEngine(() => mapToMusic(measurementStore.getSnapshot()));

const getServerStatus = () => IDLE_STATUS;

/** The music's status for rendering, and the engine for the controls. */
export function useAudio(): { status: EngineStatus; engine: MusicEngine } {
  const status = useSyncExternalStore(musicEngine.subscribe, musicEngine.getStatus, getServerStatus);
  return { status, engine: musicEngine };
}
