"use client";

import "@/components/charts/registry";
import { Line } from "react-chartjs-2";
import type { WeightLog } from "@/lib/types";
import { prettyDate } from "@/lib/dates";

export default function WeightChart({ logs }: { logs: WeightLog[] }) {
  // Caller filters to the selected range; render the whole window.
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

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
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: "#64748b" } },
          y: {
            grid: { color: "#f0e6db" },
            ticks: { color: "#64748b" },
            border: { display: false },
          },
        },
      }}
    />
  );
}
