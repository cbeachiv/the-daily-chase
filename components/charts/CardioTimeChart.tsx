"use client";

import "@/components/charts/registry";
import { Bar } from "react-chartjs-2";

/** minutes (float) → "Xh Ym", "Xh", or "Ym". */
function fmtDuration(min: number): string {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Bar colors, cycled across activities (matches the app palette).
const COLORS = ["#f87171", "#14b8a6", "#f59e0b", "#6366f1", "#a78bfa", "#22c55e", "#ec4899"];

export default function CardioTimeChart({
  data,
}: {
  data: { label: string; minutes: number }[];
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No cardio in this window.</p>;
  }

  const labels = data.map((d) => d.label);
  const values = data.map((d) => Math.round(d.minutes));
  const colors = data.map((_, i) => COLORS[i % COLORS.length]);

  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label: "minutes",
            data: values,
            backgroundColor: colors,
            borderRadius: 6,
            barThickness: "flex",
            maxBarThickness: 36,
          },
        ],
      }}
      options={{
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: data.length <= 3 ? 2.6 : 1.8,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a1a1a",
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (c) => ` ${fmtDuration(data[c.dataIndex].minutes)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: "#f0e6db" },
            border: { display: false },
            ticks: {
              color: "#64748b",
              callback: (v) => fmtDuration(Number(v)),
            },
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: "#64748b" },
          },
        },
      }}
    />
  );
}
