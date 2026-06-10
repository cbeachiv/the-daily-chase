"use client";

import "@/components/charts/registry";
import { Bar } from "react-chartjs-2";
import type { FoodEntry } from "@/lib/types";
import { addDays, prettyDate, todayStr } from "@/lib/dates";

export default function CaloriesChart({ entries }: { entries: FoodEntry[] }) {
  // Last 14 days of calorie totals.
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) days.push(addDays(todayStr(), -i));
  const totals = days.map((d) =>
    entries.filter((e) => e.date === d).reduce((s, e) => s + e.calories, 0)
  );

  if (totals.every((t) => t === 0)) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Log calories to see your daily totals here.
      </p>
    );
  }

  return (
    <Bar
      data={{
        labels: days.map((d) => prettyDate(d).replace(/^\w+, /, "")),
        datasets: [
          {
            label: "Calories",
            data: totals,
            backgroundColor: "#ff6b6b",
            borderRadius: 3,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 7, color: "#64748b" } },
          y: {
            grid: { color: "#f0e6db" },
            ticks: { color: "#64748b" },
            border: { display: false },
            beginAtZero: true,
          },
        },
      }}
    />
  );
}
