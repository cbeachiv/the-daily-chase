"use client";

import "@/components/charts/registry";
import { Line } from "react-chartjs-2";
import {
  cmToIn,
  kgToLb,
  ordinal,
  percentileFor,
  refCurves,
  type GrowthKind,
} from "@/lib/growth";

// One measured point: metric value (kg or cm) at a fractional age in months.
export type GrowthPoint = { ageMonths: number; valueMetric: number; dateLabel: string };

// How each metric reads on the y-axis (WHO math stays metric; we present familiar units).
const DISPLAY: Record<
  GrowthKind,
  { unit: string; toDisplay: (metric: number) => number }
> = {
  weight: { unit: "lb", toDisplay: kgToLb },
  length: { unit: "in", toDisplay: cmToIn },
  head: { unit: "cm", toDisplay: (v) => v },
};

export default function AnnieGrowthChart({
  kind,
  points,
  aspect = 1.5,
}: {
  kind: GrowthKind;
  points: GrowthPoint[];
  aspect?: number;
}) {
  const cfg = DISPLAY[kind];
  const sorted = [...points].sort((a, b) => a.ageMonths - b.ageMonths);
  const maxAge = sorted.length ? sorted[sorted.length - 1].ageMonths : 0;
  const maxMonths = Math.max(Math.ceil(maxAge + 0.5), 12);

  // WHO reference bands (3rd–97th), converted to display units.
  const bands = refCurves(kind, maxMonths).map((band) => ({
    p: band.p,
    data: band.points.map((pt) => ({ x: pt.x, y: cfg.toDisplay(pt.y) })),
  }));

  const annie = sorted.map((pt) => ({
    x: Number(pt.ageMonths.toFixed(2)),
    y: cfg.toDisplay(pt.valueMetric),
    pct: percentileFor(kind, pt.ageMonths, pt.valueMetric),
    dateLabel: pt.dateLabel,
  }));

  return (
    <Line
      data={{
        datasets: [
          ...bands.map((band) => ({
            label: `${ordinal(band.p)}`,
            data: band.data,
            borderColor: band.p === 50 ? "#b89a72" : "#d9cbb9",
            borderWidth: band.p === 50 ? 1.5 : 1,
            borderDash: band.p === 50 ? undefined : [4, 4],
            pointRadius: 0,
            pointHitRadius: 0,
            fill: false,
            tension: 0.4,
            order: 2,
          })),
          {
            label: "Annie",
            data: annie,
            borderColor: "#6366f1",
            backgroundColor: "#6366f1",
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.3,
            order: 1,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: aspect,
        parsing: false,
        interaction: { mode: "nearest", intersect: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            // Only Annie's points carry a tooltip; the bands are reference-only.
            filter: (item) => item.dataset.label === "Annie",
            callbacks: {
              title: (items) =>
                (items[0]?.raw as { dateLabel?: string })?.dateLabel ?? "",
              label: (item) => {
                const raw = item.raw as { y: number; pct: number | null };
                const val = `${raw.y.toFixed(1)} ${cfg.unit}`;
                return raw.pct != null ? `${val} · ${ordinal(raw.pct)} pct` : val;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: maxMonths,
            title: { display: true, text: "Age (months)", color: "#64748b" },
            grid: { display: false },
            ticks: { stepSize: maxMonths > 18 ? 3 : 2, color: "#64748b" },
          },
          y: {
            title: { display: true, text: cfg.unit, color: "#64748b" },
            grid: { color: "#f0e6db" },
            ticks: { color: "#64748b" },
            border: { display: false },
          },
        },
      }}
    />
  );
}
