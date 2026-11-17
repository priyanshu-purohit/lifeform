"use client";

import { useEffect, useRef } from "react";
import { measurementStore } from "@/features/measurements";
import {
  startExploreEngine,
  type ExploreEngine,
  type ExploreOptions,
} from "@/features/explore/canvas-engine";
import { mapToVisual } from "@/features/explore/visual-mapping";

/**
 * Full-screen Canvas world. Measurements flow from the shared store straight into the
 * engine (no React re-render per update); React only passes the user's visual options.
 */
export function ExploreWorld({ options }: { options: ExploreOptions }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ExploreEngine | null>(null);
  // The engine starts with whatever options are current at mount; later changes go
  // through setOptions below.
  const initialOptions = useRef(options);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = startExploreEngine(canvas, initialOptions.current);
    engineRef.current = engine;

    const push = () => engine.setTargets(mapToVisual(measurementStore.getSnapshot()).targets);
    push();
    const unsubscribe = measurementStore.subscribe(push);

    // Also runs when Next hides this route with <Activity>, so the loop never runs unseen.
    return () => {
      unsubscribe();
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    initialOptions.current = options;
    engineRef.current?.setOptions(options);
  }, [options]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="A living world of light that moves with your measured pulse and breathing. Move the pointer to stir it, hold to gather particles, click to send a ripple."
      className="fixed inset-0 h-full w-full cursor-crosshair touch-none"
    />
  );
}
