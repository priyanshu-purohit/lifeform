"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import { measurementStore, type MetricId } from "@/features/measurements";
import { samplesToPoints, type ChartPoint } from "@/features/understand/chart-data";
import { METRIC_META, formatValue } from "@/features/understand/metric-meta";

// Only the pieces we use, so the bundle stays small.
Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip);

/** Live charts redraw at most this often, outside React's render cycle. */
const LIVE_REDRAW_MS = 1_000;

function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function config(metric: MetricId, points: { current: ChartPoint[] }): ChartConfiguration<"line"> {
  const meta = METRIC_META[metric];
  const faint = `${meta.color}55`;
  // A segment is solid only when both ends are SDK-stable readings.
  const settled = (i0: number, i1: number) => points.current[i0]?.valid && points.current[i1]?.valid;
  return {
    type: "line",
    data: {
      datasets: [
        {
          data: points.current as { x: number; y: number | null }[],
          parsing: false,
          borderColor: meta.color,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHitRadius: 8,
          tension: 0.3,
          spanGaps: false,
          segment: {
            borderColor: (ctx) => (settled(ctx.p0DataIndex, ctx.p1DataIndex) ? meta.color : faint),
            borderDash: (ctx) => (settled(ctx.p0DataIndex, ctx.p1DataIndex) ? undefined : [4, 4]),
          },
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      scales: {
        x: {
          type: "linear",
          min: 0,
          grid: { color: "#27272a" },
          border: { color: "#3f3f46" },
          ticks: { color: "#71717a", maxTicksLimit: 6, callback: (v) => clockLabel(Number(v)) },
        },
        y: {
          type: "linear",
          grace: "10%",
          grid: { color: "#27272a" },
          border: { color: "#3f3f46" },
          ticks: { color: "#71717a", maxTicksLimit: 5 },
        },
      },
      plugins: {
        tooltip: {
          displayColors: false,
          backgroundColor: "#09090b",
          borderColor: "#3f3f46",
          borderWidth: 1,
          callbacks: {
            title: (items) => `${clockLabel(items[0]?.parsed.x ?? 0)} into the session`,
            label: (item) => {
              const p = points.current[item.dataIndex];
              if (p?.y == null) return "";
              return `${formatValue(metric, p.y)} ${meta.unit}${p.valid ? "" : " · settling"}`;
            },
          },
        },
      },
    },
  };
}

function useLineChart(metric: MetricId) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<"line"> | null>(null);
  const pointsRef = useRef<ChartPoint[]>([]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, config(metric, pointsRef));
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [metric]);

  const draw = (points: ChartPoint[]) => {
    pointsRef.current = points;
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.datasets[0].data = points as { x: number; y: number | null }[];
    chart.update("none");
  };

  return { canvasRef, draw };
}

function Frame({ metric, canvasRef }: { metric: MetricId; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const meta = METRIC_META[metric];
  return (
    <div className="relative h-40 w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${meta.label} over time, in ${meta.unit}. Dashed parts are readings the SDK had not settled yet.`}
      />
    </div>
  );
}

/** Chart for a stored session (data does not change while shown). */
export function StaticMetricChart({ metric, points }: { metric: MetricId; points: ChartPoint[] }) {
  const { canvasRef, draw } = useLineChart(metric);
  useEffect(() => draw(points));
  return <Frame metric={metric} canvasRef={canvasRef} />;
}

/** Chart for the running session. Reads the store itself once a second, not on every sample. */
export function LiveMetricChart({ metric }: { metric: MetricId }) {
  const { canvasRef, draw } = useLineChart(metric);
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });

  useEffect(() => {
    const redraw = () => {
      const { session, metrics } = measurementStore.getSnapshot();
      if (!session) return;
      drawRef.current(
        samplesToPoints(metrics[metric].history, session.startedAt, METRIC_META[metric].maxGapMs),
      );
    };
    redraw();
    const timer = setInterval(redraw, LIVE_REDRAW_MS);
    return () => clearInterval(timer);
  }, [metric]);

  return <Frame metric={metric} canvasRef={canvasRef} />;
}
