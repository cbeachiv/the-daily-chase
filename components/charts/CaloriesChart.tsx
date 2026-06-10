"use client";

import "@/components/charts/registry";
import { Bar } from "react-chartjs-2";
import type { FoodEntry } from "@/lib/types";
import { prettyDate, startOfWeek } from "@/lib/dates";

function shortLabel(dateStr: string): string {
  return prettyDate(dateStr).replace(/^\w+,\s*/, ""); // "Jun 8"
}

export default function CaloriesChart({
  entries,
  startDate,
  granularity,
}: {
  entries: FoodEntry[];
  startDate: string | null; // YYYY-MM-DD, or null for all-time
  granularity: "day" | "week";
}) {
  const inRange = entries.filter((e) => !startDate || e.date >= startDate);

  // Group either by day (daily total) or by week (average daily calories).
  const bucketTotals = new Map<string, number>();
  const bucketDays = new Map<string, Set<string>>();
  for (const e of inRange) {
    const key = granularity === "week" ? startOfWeek(e.date) : e.date;
    bucketTotals.set(key, (bucketTotals.get(key) ?? 0) + e.calories);
    if (granularity === "week") {
      const set = bucketDays.get(key) ?? new Set<string>();
      set.add(e.date);
      bucketDays.set(key, set);
    }
  }

  const keys = [...bucketTotals.keys()].sort();
  const values = keys.map((k) =>
    granularity === "week"
      ? Math.round(bucketTotals.get(k)! / (bucketDays.get(k)?.size || 1))
      : bucketTotals.get(k)!
  );

  if (keys.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No calorie data in this range.
      </p>
    );
  }

  return (
    <>
      <Bar
        data={{
          labels: keys.map(shortLabel),
          datasets: [
            {
              label: granularity === "week" ? "Avg cal/day" : "Calories",
              data: values,
              backgroundColor: "#ff6b6b",
              borderRadius: 3,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => items[0]?.label ?? "",
                label: (c) =>
                  granularity === "week"
                    ? ` ${Number(c.raw).toLocaleString()} avg cal/day`
                    : ` ${Number(c.raw).toLocaleString()} cal`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 8, color: "#64748b" } },
            y: {
              grid: { color: "#f0e6db" },
              ticks: { color: "#64748b" },
              border: { display: false },
              beginAtZero: true,
            },
          },
        }}
      />
      {granularity === "week" && (
        <p className="mt-2 text-center text-xs text-muted">Weekly average daily calories</p>
      )}
    </>
  );
}
