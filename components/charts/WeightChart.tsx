"use client";

import "@/components/charts/registry";
import { Line } from "react-chartjs-2";
import type { WeightLog } from "@/lib/types";
import { prettyDate } from "@/lib/dates";

export default function WeightChart({
  logs,
  aspect = 2,
  target,
}: {
  logs: WeightLog[];
  aspect?: number; // higher = shorter chart (compact mode)
  // Optional dashed glide-path line (e.g. the 5K block's weight target), one
  // point per date. Dates not in `logs` are added to the x-axis so the line can
  // run ahead of the actual data.
  target?: { date: string; lbs: number }[];
}) {
  // Caller filters to the selected range; render the whole window.
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const compact = aspect > 2.5;

  if (sorted.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Log your weight on a couple of days to see the trend.
      </p>
    );
  }

  const targetByDate = new Map((target ?? []).map((t) => [t.date, t.lbs]));
  const dates = target
    ? [...new Set([...sorted.map((l) => l.date), ...targetByDate.keys()])].sort()
    : sorted.map((l) => l.date);
  const weightByDate = new Map(sorted.map((l) => [l.date, l.weightLbs]));

  return (
    <Line
      data={{
        labels: dates.map((d) => prettyDate(d)),
        datasets: [
          {
            label: "Weight (lb)",
            data: dates.map((d) => weightByDate.get(d) ?? null),
            borderColor: "#6366f1",
            backgroundColor: "rgba(99,102,241,0.12)",
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 4,
            spanGaps: true,
          },
          ...(target
            ? [
                {
                  label: "Target (lb)",
                  data: dates.map((d) => targetByDate.get(d) ?? null),
                  borderColor: "#14b8a6",
                  borderDash: [5, 4],
                  borderWidth: 1.5,
                  fill: false,
                  tension: 0,
                  pointRadius: 0,
                  pointHoverRadius: 3,
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
        plugins: { legend: { display: false } },
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
