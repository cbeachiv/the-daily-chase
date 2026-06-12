"use client";

import "@/components/charts/registry";
import { Line } from "react-chartjs-2";
import type { MoodLog } from "@/lib/types";
import { prettyDate, prettyTime } from "@/lib/dates";

export default function MoodChart({
  logs,
  compact = false,
}: {
  logs: MoodLog[];
  compact?: boolean;
}) {
  const sorted = [...logs].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

  if (sorted.length < 2) {
    return (
      <p className={`text-center text-sm text-muted ${compact ? "py-4" : "py-8"}`}>
        Log a couple of times to see your mood and energy trend.
      </p>
    );
  }

  const shortLabel = (dateStr: string) => prettyDate(dateStr).replace(/^\w+,\s*/, ""); // "Jun 8"

  return (
    <Line
      data={{
        labels: sorted.map((l) => shortLabel(l.date)),
        datasets: [
          {
            label: "Mood",
            data: sorted.map((l) => l.mood),
            borderColor: "#6366f1",
            backgroundColor: "rgba(99,102,241,0.12)",
            fill: false,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 4,
          },
          {
            label: "Energy",
            data: sorted.map((l) => l.energy),
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245,158,11,0.12)",
            fill: false,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 4,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: compact ? 2.4 : 2,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: compact
            ? { display: false }
            : { display: true, labels: { color: "#64748b", boxWidth: 12 } },
          tooltip: {
            callbacks: {
              title: (items) => {
                const i = items[0]?.dataIndex ?? 0;
                const l = sorted[i];
                return l ? `${shortLabel(l.date)}, ${prettyTime(l.loggedAt)}` : "";
              },
              label: (c) => ` ${c.dataset.label}: ${c.raw}/10`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 6, color: "#64748b", display: !compact },
          },
          y: {
            grid: { color: "#f0e6db" },
            ticks: { color: "#64748b", stepSize: compact ? 5 : 2 },
            border: { display: false },
            min: 0,
            max: 10,
          },
        },
      }}
    />
  );
}
