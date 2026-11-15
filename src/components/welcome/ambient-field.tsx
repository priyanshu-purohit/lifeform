"use client";

import { useEffect, useRef } from "react";
import { startAmbientEngine } from "./ambient-engine";

/** Decorative background behind the hero (first screen). The animation runs outside React's render cycle. */
export function AmbientField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Cleanup also runs when Next hides this route with <Activity>, so the loop never
    // keeps running behind another page.
    const engine = startAmbientEngine(canvas);
    return () => engine.stop();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-svh w-full"
    />
  );
}
