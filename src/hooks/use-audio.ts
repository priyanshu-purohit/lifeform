"use client";

import { useEffect, useSyncExternalStore } from "react";
import { measurementStore } from "@/features/measurements";
import { IDLE_STATUS, createMusicEngine, type EngineStatus, type MusicEngine } from "@/features/create/audio-engine";
import { mapToMusic } from "@/features/create/music-mapping";

// One engine for the app. Creating it touches no browser API; an AudioContext only exists
// after play(), which runs from a click. It reads the shared measurement store once per bar.
const engine = createMusicEngine(() => mapToMusic(measurementStore.getSnapshot()));

const getServerStatus = () => IDLE_STATUS;

/** Live Mode music: its status for rendering, and the engine for the controls. */
export function useAudio(): { status: EngineStatus; engine: MusicEngine } {
  const status = useSyncExternalStore(engine.subscribe, engine.getStatus, getServerStatus);

  // Leaving the page stops the sound and frees the audio nodes. This also runs when Next
  // hides the route with <Activity>, so music never plays unseen.
  useEffect(() => () => engine.stop(), []);

  return { status, engine };
}
