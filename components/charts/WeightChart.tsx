"use client";

import "@/components/charts/registry";
import { Line } from "react-chartjs-2";
import type { WeightLog } from "@/lib/types";
import { prettyDate, startOfWeek } from "@/lib/dates";

export default function WeightChart({
  logs,
  aspect = 2,
  weeklyAvg = false,
  targetFor,
}: {
  logs: WeightLog[];
  aspect?: number; // higher = shorter chart (compact mode)
  weeklyAvg?: boolean; // overlay each point's Monday-week average as a step line
  targetFor?: (date: string) => number | null; // dashed goal line, e.g. a cut's glide path
}) {
  // Caller filters to the selected range; render the whole window.
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const compact = aspect > 2.5;

  const weekAvg = new Map<string, number>();
  if (weeklyAvg) {
    const sums = new Map<string, { sum: number; n: number }>();
    for (const l of sorted) {
      const k = startOfWeek(l.date);
      const cur = sums.get(k) ?? { sum: 0, n: 0 };
      sums.set(k, { sum: cur.sum + l.weightLbs, n: cur.n + 1 });
    }
    for (const [k, v] of sums) weekAvg.set(k, Math.round((v.sum / v.n) * 10) / 10);
  }
  const overlays = weeklyAvg || !!targetFor;

  if (sorted.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Log your weight on a couple of days to see the trend.
      </p>
    );
  }

  return (
    <Line
      data={{
        labels: sorted.map((l) => prettyDate(l.date)),
        datasets: [
          {
            label: "Weight (lb)",
            data: sorted.map((l) => l.weightLbs),
            borderColor: "#6366f1",
            backgroundColor: "rgba(99,102,241,0.12)",
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 4,
          },
          ...(weeklyAvg
            ? [
                {
                  label: "Weekly avg",
                  data: sorted.map((l) => weekAvg.get(startOfWeek(l.date)) ?? null),
                  borderColor: "#14b8a6",
                  backgroundColor: "#14b8a6",
                  borderWidth: 2.5,
                  stepped: true as const,
                  pointRadius: 0,
                  fill: false,
                },
              ]
            : []),
          ...(targetFor
            ? [
                {
                  label: "Target",
                  data: sorted.map((l) => targetFor(l.date)),
                  borderColor: "#ff6b6b",
                  backgroundColor: "#ff6b6b",
                  borderDash: [6, 4],
                  borderWidth: 2,
                  pointRadius: 0,
                  fill: false,
                  spanGaps: true,
                },
              ]
            : []),
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: aspect,
        plugins: {
          legend: {
            display: overlays && !compact,
            position: "bottom",
            labels: { boxWidth: 12, color: "#64748b" },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: compact ? 4 : 6, color: "#64748b", display: !compact },
          },
          y: {
            grid: { color: "#f0e6db" },
            ticks: { color: "#64748b", maxTicksLimit: compact ? 3 : undefined },
            border: { display: false },
          },
        },
      }}
    />
  );
}
