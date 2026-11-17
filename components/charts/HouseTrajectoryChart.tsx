"use client";

import "@/components/charts/registry";
import { Line } from "react-chartjs-2";
import { fmtUSD, monthShort } from "@/lib/finance";
import type { TrajectoryPoint } from "@/lib/house";

// Liquid savings: actual history (solid teal), straight-line projection (dashed
// indigo, connected at the boundary), and the cash-needed target as a flat coral
// line (a constant dataset — avoids the annotation-plugin dependency).
export default function HouseTrajectoryChart({
  points,
  targetCash,
}: {
  points: TrajectoryPoint[];
  targetCash: number;
}) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No savings history yet.</p>;
  }

  const labels = points.map((p) => `${monthShort(p.month)} ${p.month.slice(2, 4)}`);
  const lastActualIdx = points.reduce((idx, p, i) => (p.projected ? idx : i), 0);
  const moneyTick = (v: number | string) => (Number(v) >= 1000 ? "$" + Number(v) / 1000 + "k" : "$" + v);

  return (
    <Line
      data={{
        labels,
        datasets: [
          {
            label: "Savings (actual)",
            data: points.map((p, i) => (i <= lastActualIdx ? p.balance : null)),
            borderColor: "#14b8a6",
            backgroundColor: "transparent",
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0,
          },
          {
            label: "Projected",
            data: points.map((p, i) => (i >= lastActualIdx ? p.balance : null)),
            borderColor: "#6366f1",
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [6, 4],
            tension: 0.3,
            pointRadius: 0,
          },
          {
            label: "Cash needed",
            data: points.map(() => targetCash),
            borderColor: "#ff6b6b",
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [2, 3],
            pointRadius: 0,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.2,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, pointStyle: "circle", padding: 16, color: "#64748b" },
          },
          tooltip: {
            backgroundColor: "#1a1a1a",
            padding: 12,
            cornerRadius: 8,
            callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtUSD(Number(c.raw))}` },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: "#64748b", maxTicksLimit: 14 } },
          y: { grid: { color: "#f0e6db" }, border: { display: false }, ticks: { color: "#64748b", callback: moneyTick } },
        },
      }}
    />
  );
}
