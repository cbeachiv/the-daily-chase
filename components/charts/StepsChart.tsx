"use client";

import "@/components/charts/registry";
import { Chart } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import type { StepLog } from "@/lib/types";
import { daysInMonth } from "@/lib/dates";

// Daily step bars for one month with a dashed line at the daily target. Bars at
// or above target are solid teal; short days are faded; future days are empty.
export default function StepsChart({
  logs,
  month,
  dailyTarget,
  today,
  aspect = 2,
}: {
  logs: StepLog[];
  month: string; // YYYY-MM
  dailyTarget: number;
  today: string; // YYYY-MM-DD
  aspect?: number; // higher = shorter chart (compact mode)
}) {
  const compact = aspect > 2.5;
  const D = daysInMonth(month);
  const byDate = new Map(logs.filter((l) => l.date.startsWith(month + "-")).map((l) => [l.date, l.steps]));

  if (byDate.size === 0) {
    return <p className="py-8 text-center text-sm text-muted">No steps logged yet this month.</p>;
  }

  const days = Array.from({ length: D }, (_, i) => i + 1);
  const values = days.map((d) => {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    if (date > today) return null;
    return byDate.get(date) ?? 0;
  });

  const data: ChartData<"bar" | "line", (number | null)[], string> = {
    labels: days.map(String),
    datasets: [
      {
        type: "bar",
        label: "Steps",
        data: values,
        backgroundColor: values.map((v) =>
          v !== null && v >= dailyTarget ? "#14b8a6" : "rgba(20,184,166,0.35)",
        ),
        borderRadius: 3,
        order: 1,
      },
      {
        type: "line",
        label: "Target",
        data: days.map(() => dailyTarget),
        borderColor: "#b89a72",
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        pointHitRadius: 0,
        fill: false,
        order: 2,
      },
    ],
  };

  const options: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: aspect,
    plugins: {
      legend: { display: false },
      tooltip: {
        // The target line is reference-only; only bars carry a tooltip.
        filter: (item) => item.dataset.type !== "line",
        callbacks: {
          title: (items) => (items[0] ? `Day ${items[0].label}` : ""),
          label: (c) => ` ${Number(c.raw).toLocaleString()} steps`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: compact ? 4 : 10, color: "#64748b", display: !compact },
      },
      y: {
        grid: { color: "#f0e6db" },
        ticks: {
          color: "#64748b",
          maxTicksLimit: compact ? 3 : undefined,
          callback: (v) => `${Number(v) / 1000}k`,
        },
        border: { display: false },
        beginAtZero: true,
      },
    },
  };

  return <Chart type="bar" data={data} options={options} />;
}
