"use client";

import "@/components/charts/registry";
import { Line } from "react-chartjs-2";
import type { ProgressPoint } from "@/lib/lifts";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${d}`;
}

export default function LiftProgressChart({
  points,
  bodyweight,
}: {
  points: ProgressPoint[];
  bodyweight: boolean;
}) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No data for this exercise.</p>;
  }

  const labels = points.map((p) => shortDate(p.date));
  const values = points.map((p) => (bodyweight ? p.topReps : p.e1rm));
  const unit = bodyweight ? "reps" : "lb e1RM";

  return (
    <Line
      data={{
        labels,
        datasets: [
          {
            label: unit,
            data: values,
            borderColor: "#6366f1",
            backgroundColor: "rgba(99, 102, 241, 0.12)",
            fill: true,
            tension: 0.3,
            pointRadius: points.length > 40 ? 0 : 3,
            pointHoverRadius: 5,
            pointBackgroundColor: "#6366f1",
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.2,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a1a1a",
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (c) => {
                const p = points[c.dataIndex];
                return bodyweight
                  ? ` ${p.topReps} reps`
                  : ` ${p.weight} lb × ${p.reps}  (≈${Math.round(p.e1rm)} lb 1RM)`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: "#64748b",
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
            },
          },
          y: {
            grid: { color: "#f0e6db" },
            border: { display: false },
            ticks: { color: "#64748b" },
          },
        },
      }}
    />
  );
}
