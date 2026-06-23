"use client";

import "@/components/charts/registry";
import { useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import { fmtUSD, monthShort } from "@/lib/finance";

export interface TrendPoint {
  month: string; // YYYY-MM
  income: number;
  spend: number;
  bitcoin: number;
  ira: number;
  savings: number;
}

// Two views over the monthly history: Income vs Spend (grouped bars) and Net
// Worth over time (stacked lines for Bitcoin / IRA / Savings + a total line).
export default function FinanceTrendChart({ points }: { points: TrendPoint[] }) {
  const [mode, setMode] = useState<"flow" | "networth">("flow");

  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No monthly history yet.</p>;
  }

  const labels = points.map((p) => `${monthShort(p.month)} ${p.month.slice(2, 4)}`);
  const moneyTick = (v: number | string) => (Number(v) >= 1000 ? "$" + Number(v) / 1000 + "k" : "$" + v);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
          {(
            [
              ["flow", "Income vs Spend"],
              ["networth", "Net worth"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                mode === m ? "bg-card text-ink shadow-card" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "flow" ? (
        <Bar
          data={{
            labels,
            datasets: [
              { label: "Income", data: points.map((p) => p.income), backgroundColor: "#047857", borderRadius: 3 },
              { label: "Spend", data: points.map((p) => p.spend), backgroundColor: "#ff6b6b", borderRadius: 3 },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.2,
            interaction: { mode: "index" },
            plugins: {
              legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 16, color: "#64748b" } },
              tooltip: {
                backgroundColor: "#1a1a1a",
                padding: 12,
                cornerRadius: 8,
                callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtUSD(Number(c.raw))}` },
              },
            },
            scales: {
              x: { grid: { display: false }, border: { display: false }, ticks: { color: "#64748b" } },
              y: { grid: { color: "#f0e6db" }, border: { display: false }, ticks: { color: "#64748b", callback: moneyTick } },
            },
          }}
        />
      ) : (
        <Line
          data={{
            labels,
            datasets: [
              { label: "Total", data: points.map((p) => p.bitcoin + p.ira + p.savings), borderColor: "#1a1a1a", backgroundColor: "rgba(26,26,26,0.06)", borderWidth: 2, tension: 0.3, pointRadius: 0, fill: true },
              { label: "Savings", data: points.map((p) => p.savings), borderColor: "#14b8a6", backgroundColor: "transparent", borderWidth: 2, tension: 0.3, pointRadius: 0 },
              { label: "IRA", data: points.map((p) => p.ira), borderColor: "#6366f1", backgroundColor: "transparent", borderWidth: 2, tension: 0.3, pointRadius: 0 },
              { label: "Bitcoin", data: points.map((p) => p.bitcoin), borderColor: "#f59e0b", backgroundColor: "transparent", borderWidth: 2, tension: 0.3, pointRadius: 0 },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.2,
            interaction: { mode: "index", intersect: false },
            plugins: {
              legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 16, color: "#64748b" } },
              tooltip: {
                backgroundColor: "#1a1a1a",
                padding: 12,
                cornerRadius: 8,
                callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtUSD(Number(c.raw))}` },
              },
            },
            scales: {
              x: { grid: { display: false }, border: { display: false }, ticks: { color: "#64748b" } },
              y: { grid: { color: "#f0e6db" }, border: { display: false }, ticks: { color: "#64748b", callback: moneyTick } },
            },
          }}
        />
      )}
    </div>
  );
}
