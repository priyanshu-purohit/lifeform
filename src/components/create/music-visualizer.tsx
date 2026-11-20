"use client";

import { useEffect, useRef } from "react";

const BARS = 56;
/** The range of pitch drawn, from the lowest bass notes to the top of the hi-hats. */
const LOW_HZ = 40;
const HIGH_HZ = 10_000;

/**
 * The sound that is playing, drawn as a mirrored spectrum. It reads the audio signal
 * directly in an animation frame loop, so playing music never re-renders React.
 */
export function MusicVisualizer({
  getAnalyser,
  active,
}: {
  getAnalyser: () => AnalyserNode | null;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    let frame = 0;
    let data: Uint8Array<ArrayBuffer> | null = null;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);

      const analyser = active ? getAnalyser() : null;
      if (analyser) {
        if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
      }

      // Bars are spaced by pitch (each step is the same musical interval), because that is
      // how notes are spread. Evenly spaced frequencies would crowd the music into the left.
      const binHz = analyser ? analyser.context.sampleRate / analyser.fftSize : 1;
      const binAt = (i: number) => (LOW_HZ * (HIGH_HZ / LOW_HZ) ** (i / BARS)) / binHz;

      const slot = width / BARS;
      const barWidth = Math.max(1, slot * 0.5);
      const mid = height / 2;
      for (let i = 0; i < BARS; i++) {
        let bin = 0;
        if (data && analyser) {
          const from = Math.floor(binAt(i));
          const to = Math.min(data.length - 1, Math.max(from, Math.ceil(binAt(i + 1)) - 1));
          for (let b = from; b <= to; b++) bin = Math.max(bin, data[b] / 255);
        }
        const half = Math.max(1, bin * mid * 0.92);
        g.fillStyle = `rgba(153, 246, 228, ${0.18 + bin * 0.75})`;
        g.beginPath();
        g.roundRect(i * slot + (slot - barWidth) / 2, mid - half, barWidth, half * 2, barWidth / 2);
        g.fill();
      }
      if (active) frame = requestAnimationFrame(draw);
    };

    draw();
    // While idle nothing animates, so redraw once if the layout changes.
    const observer = new ResizeObserver(() => {
      if (!active) draw();
    });
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active, getAnalyser]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={active ? "The music that is playing, shown as moving bars" : "No music is playing"}
      className="h-32 w-full"
    />
  );
}
