"use client";

import "@/components/charts/registry";
import { Bar } from "react-chartjs-2";
import { CATEGORY_COLOR, fmtUSD, type MonthAgg } from "@/lib/finance";

// Horizontal bar of a single month's spend by category (uses the registered
// BarElement — no doughnut/ArcElement needed).
export default function FinanceCategoryChart({ byCategory }: { byCategory: MonthAgg["byCategory"] }) {
  if (byCategory.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No spending to break down this month.</p>;
  }
  return (
    <Bar
      data={{
        labels: byCategory.map((c) => c.category),
        datasets: [
          {
            label: "Spend",
            data: byCategory.map((c) => c.amount),
            backgroundColor: byCategory.map((c) => CATEGORY_COLOR[c.category]),
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      }}
      options={{
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.6,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a1a1a",
            padding: 12,
            cornerRadius: 8,
            callbacks: { label: (c) => ` ${fmtUSD(Number(c.raw), true)}` },
          },
        },
        scales: {
          x: {
            grid: { color: "#f0e6db" },
            border: { display: false },
            ticks: { color: "#64748b", callback: (v) => (Number(v) >= 1000 ? Number(v) / 1000 + "k" : v) },
          },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: "#1a1a1a", font: { size: 12 } } },
        },
      }}
    />
  );
}
