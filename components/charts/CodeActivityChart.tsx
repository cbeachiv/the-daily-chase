"use client";

import "@/components/charts/registry";
import { useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import type { CodeActivity } from "@/lib/types";

const MONTH_FULL: Record<string, string> = {
  Jan: "January", Feb: "February", Mar: "March", Apr: "April",
  May: "May", Jun: "June", Jul: "July", Aug: "August",
  Sep: "September", Oct: "October", Nov: "November", Dec: "December",
};

export default function CodeActivityChart({ rows }: { rows: CodeActivity[] }) {
  const [period, setPeriod] = useState<"weeks" | "months">("weeks");

  const { weekLabels, monthLabels, weekDatasets, monthDatasets } = useMemo(() => {
    // Ordered, unique weeks by sortable weekStart.
    const weekKeys = Array.from(new Set(rows.map((r) => r.weekStart))).sort();
    const labelFor: Record<string, string> = {};
    rows.forEach((r) => (labelFor[r.weekStart] = r.label));
    const weekLabels = weekKeys.map((k) => labelFor[k]);

    // Months in first-seen order.
    const weekMonth = weekLabels.map((l) => l.split(" ")[0]);
    const monthAbbrs = weekMonth.filter((m, i) => weekMonth.indexOf(m) === i);
    const monthLabels = monthAbbrs.map((m) => MONTH_FULL[m] ?? m);

    // Repos with their color, ordered by total descending.
    const repoMap = new Map<string, { color: string; byWeek: Record<string, number> }>();
    for (const r of rows) {
      if (!repoMap.has(r.repoName)) repoMap.set(r.repoName, { color: r.color, byWeek: {} });
      repoMap.get(r.repoName)!.byWeek[r.weekStart] = (repoMap.get(r.repoName)!.byWeek[r.weekStart] ?? 0) + r.lines;
    }
    const repos = Array.from(repoMap.entries())
      .map(([name, v]) => ({
        name,
        color: v.color,
        weekData: weekKeys.map((k) => v.byWeek[k] ?? 0),
      }))
      .sort((a, b) => b.weekData.reduce((s, x) => s + x, 0) - a.weekData.reduce((s, x) => s + x, 0));

    const ds = (data: number[], r: { name: string; color: string }) => ({
      label: r.name,
      data,
      backgroundColor: r.color,
      borderRadius: 3,
      borderSkipped: false as const,
    });

    const weekDatasets = repos.map((r) => ds(r.weekData, r));
    const monthDatasets = repos.map((r) =>
      ds(
        monthAbbrs.map((m) =>
          r.weekData.reduce((sum, val, i) => (weekMonth[i] === m ? sum + val : sum), 0)
        ),
        r
      )
    );

    return { weekLabels, monthLabels, weekDatasets, monthDatasets };
  }, [rows]);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No code activity data yet.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
          {(["weeks", "months"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium capitalize transition ${
                period === p ? "bg-card text-ink shadow-card" : "text-muted"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <Bar
        data={{
          labels: period === "weeks" ? weekLabels : monthLabels,
          datasets: period === "weeks" ? weekDatasets : monthDatasets,
        }}
        options={{
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2.2,
          interaction: { mode: "index" },
          plugins: {
            legend: {
              position: "bottom",
              labels: { usePointStyle: true, pointStyle: "circle", padding: 16, color: "#64748b", font: { size: 12 } },
            },
            tooltip: {
              backgroundColor: "#1a1a1a",
              padding: 12,
              cornerRadius: 8,
              callbacks: {
                label: (c) =>
                  c.raw === 0 ? "" : ` ${c.dataset.label}: ${Number(c.raw).toLocaleString()} lines`,
                footer: (items) =>
                  "Total: " +
                  items.reduce((s, it) => s + (Number(it.parsed.y) || 0), 0).toLocaleString() +
                  " lines",
              },
            },
          },
          scales: {
            x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: "#64748b" } },
            y: {
              stacked: true,
              grid: { color: "#f0e6db" },
              border: { display: false },
              ticks: {
                color: "#64748b",
                callback: (v) => (Number(v) >= 1000 ? Number(v) / 1000 + "k" : v),
              },
            },
          },
        }}
      />
    </div>
  );
}
