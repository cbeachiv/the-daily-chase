// Fall 2026 cut: 12 weeks, 175 → 163 lb, getting stronger on a machine-based
// A/B/C program. Pure data + helpers; the /cut page and Today card read from here.
// To run another cut, change the constants below.

import { addDays, startOfWeek, todayStr } from "@/lib/dates";
import type { FoodEntry, StepLog, WaistLog, WeightLog } from "@/lib/types";
import { weekAvgSteps } from "@/lib/steps";
import type { LoggedSessionDoc } from "@/lib/lifts";
import type { CardioLog } from "@/lib/cardio";

export const CUT = {
  start: "2026-09-28", // Monday of week 1
  weeks: 12,
  startWeight: 175,
  goalWeight: 163,
  kcal: 1950,
  proteinG: 170,
  maintenanceKcal: 2400,
  maintenanceWeeks: [9], // Thanksgiving week (Nov 23)
  lighterWeeks: [5, 9], // first week of blocks 2 and 3: same weights, 2 sets instead of 3
  pullBackAbove: 166, // after the cut: weekly average above this → back to 2,100
};

export const CUT_END = addDays(CUT.start, CUT.weeks * 7 - 1); // Sun Dec 20

/** Monday of plan week `n` (1-based). */
export function weekStart(n: number): string {
  return addDays(CUT.start, (n - 1) * 7);
}

/** Plan week (1-based) a date falls in; 0 before the cut, > weeks after it. */
export function weekIndex(date: string = todayStr()): number {
  const ms = new Date(startOfWeek(date) + "T00:00:00").getTime() - new Date(CUT.start + "T00:00:00").getTime();
  const n = Math.round(ms / (7 * 86400000)) + 1;
  return n < 1 ? 0 : n;
}

/** Glide-path target for plan week `n`'s weekly average: a straight line start → goal. */
export function targetWeightFor(n: number): number {
  const clamped = Math.min(Math.max(n, 1), CUT.weeks);
  const perWeek = (CUT.startWeight - CUT.goalWeight) / (CUT.weeks - 1);
  return Math.round((CUT.startWeight - perWeek * (clamped - 1)) * 10) / 10;
}

/** Target for any date, interpolated through the week (used by the chart's dashed line). */
export function targetWeightOn(date: string): number | null {
  if (date < CUT.start || date > CUT_END) return null;
  const days = (new Date(date + "T00:00:00").getTime() - new Date(CUT.start + "T00:00:00").getTime()) / 86400000;
  const perDay = (CUT.startWeight - CUT.goalWeight) / ((CUT.weeks - 1) * 7);
  return Math.round((CUT.startWeight - perDay * Math.max(0, days - 3)) * 10) / 10;
}

export function isMaintenanceWeek(n: number): boolean {
  return CUT.maintenanceWeeks.includes(n);
}

export function isLighterWeek(n: number): boolean {
  return CUT.lighterWeeks.includes(n);
}

export function kcalTarget(n: number): number {
  return isMaintenanceWeek(n) ? CUT.maintenanceKcal : CUT.kcal;
}

// --- lifting blocks ----------------------------------------------------------

export interface Block {
  n: 1 | 2 | 3;
  weeks: string; // "1-4"
  title: string;
  notes: string[];
}

export const BLOCKS: Block[] = [
  {
    n: 1,
    weeks: "1-4",
    title: "Build the base",
    notes: [
      "Run the A/B/C lists as written.",
      "Stop each set with 1 to 2 reps left in the tank.",
      "When every set hits the top of the range, go up one pin or plate next time.",
    ],
  },
  {
    n: 2,
    weeks: "5-8",
    title: "New machines, same movements",
    notes: [
      "Week 5 is lighter: same weights, 2 sets instead of 3.",
      "Swap these in with Edit on the Workouts tab:",
      "Leg Press → Leg Press (Single Leg)",
      "Chest Press (Machine) → Plate Loaded Chest press",
      "Seated Row (Cable) → Seated Row (Machine)",
      "Hack Squat → Pendulum Squat",
      "Lat Pulldown (Cable) → Lat Pulldown (Neutral Grip)",
      "Belt Squat → Smith Machine Squat",
    ],
  },
  {
    n: 3,
    weeks: "9-12",
    title: "Heavier, then test",
    notes: [
      "Week 9 is lighter (and Thanksgiving is at maintenance calories).",
      "First two lifts of each day: 4 × 5-8. Drop the last accessory.",
      "Week 12: work up to a hard top set on each main lift and compare with week 1.",
    ],
  },
];

export function blockFor(n: number): Block {
  if (n <= 4) return BLOCKS[0];
  if (n <= 8) return BLOCKS[1];
  return BLOCKS[2];
}

// --- weekly schedule ---------------------------------------------------------

export interface PlanDay {
  label: string; // "Mon"
  kind: "lift" | "cardio" | "optional" | "rest";
  workoutKey?: string; // "a" | "b" | "c"
  title: string;
  detail: string;
}

// Index 0 = Monday, matching startOfWeek.
export const SCHEDULE: PlanDay[] = [
  { label: "Mon", kind: "lift", workoutKey: "a", title: "Workout A", detail: "Then 20-30 min incline walk if you have time." },
  { label: "Tue", kind: "cardio", title: "Zone 2 cardio, 30-45 min", detail: "Incline walk (10%, 3 mph), bike, or an easy run. You can talk in full sentences." },
  { label: "Wed", kind: "lift", workoutKey: "b", title: "Workout B", detail: "Then 20-30 min incline walk if you have time." },
  { label: "Thu", kind: "cardio", title: "Zone 2 cardio, 30-45 min", detail: "Pick a different one than Tuesday so it stays fresh." },
  { label: "Fri", kind: "lift", workoutKey: "c", title: "Workout C", detail: "Then 20-30 min incline walk if you have time." },
  { label: "Sat", kind: "optional", title: "Something fun (optional)", detail: "Intervals (6 × 1 min hard / 2 min easy), a hike, or 18 holes walking. Skip if your legs are beat up." },
  { label: "Sun", kind: "rest", title: "Rest + check-in", detail: "Steps only. Log weight and waist, check the weekly numbers." },
];

export function planDayFor(date: string = todayStr()): PlanDay {
  const dow = (new Date(date + "T00:00:00").getDay() + 6) % 7;
  return SCHEDULE[dow];
}

export const DAILY_STEPS = 9000;

// --- weekly check-in ---------------------------------------------------------

export interface WeekRow {
  n: number;
  start: string;
  target: number;
  avgWeight: number | null;
  weighIns: number;
  change: number | null; // vs the previous week's average (negative = lost)
  avgKcal: number | null;
  avgProtein: number | null;
  avgSteps: number | null;
  lifts: number;
  cardio: number;
  waist: number | null;
  flag: "cut" | "add" | null;
  current: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Average of the daily weigh-ins in the 7 days starting `start`. */
export function weekAvgWeight(weights: WeightLog[], start: string): number | null {
  const end = addDays(start, 6);
  const a = avg(weights.filter((w) => w.date >= start && w.date <= end).map((w) => w.weightLbs));
  return a === null ? null : round1(a);
}

/**
 * One row per plan week up to the current one. Adjustment flags follow the
 * plan: ignore weeks 1-2 (water), "cut 150" after two straight weeks losing
 * under 0.5 lb, "add 150" when losing more than 2 lb in a week.
 */
export function weeklyRows(
  weights: WeightLog[],
  foods: FoodEntry[],
  lifts: LoggedSessionDoc[],
  cardio: CardioLog[],
  waists: WaistLog[],
  steps: StepLog[],
  today: string = todayStr(),
): WeekRow[] {
  const current = Math.min(weekIndex(today), CUT.weeks);
  const rows: WeekRow[] = [];
  let prevAvg = weekAvgWeight(weights, addDays(CUT.start, -7)) ?? CUT.startWeight;

  for (let n = 1; n <= current; n++) {
    const start = weekStart(n);
    const end = addDays(start, 6);
    const inWeek = <T extends { date: string }>(xs: T[]) => xs.filter((x) => x.date >= start && x.date <= end);

    const weekWeights = inWeek(weights);
    const avgWeight = weekAvgWeight(weights, start);

    // Calories/protein average over days that have any food logged.
    const byDay = new Map<string, { kcal: number; protein: number; hasProtein: boolean }>();
    for (const f of inWeek(foods)) {
      const d = byDay.get(f.date) ?? { kcal: 0, protein: 0, hasProtein: false };
      d.kcal += f.calories || 0;
      if (typeof f.proteinG === "number") {
        d.protein += f.proteinG;
        d.hasProtein = true;
      }
      byDay.set(f.date, d);
    }
    const days = [...byDay.values()];
    const avgKcal = avg(days.filter((d) => d.kcal > 0).map((d) => d.kcal));
    const avgProtein = avg(days.filter((d) => d.hasProtein).map((d) => d.protein));

    const weekWaists = inWeek(waists).sort((a, b) => b.date.localeCompare(a.date));
    const change = avgWeight === null ? null : round1(avgWeight - prevAvg);

    rows.push({
      n,
      start,
      target: targetWeightFor(n),
      avgWeight,
      weighIns: weekWeights.length,
      change,
      avgKcal: avgKcal === null ? null : Math.round(avgKcal),
      avgProtein: avgProtein === null ? null : Math.round(avgProtein),
      avgSteps: weekAvgSteps(steps, start),
      lifts: new Set(inWeek(lifts).map((l) => l.date)).size,
      cardio: new Set(inWeek(cardio).map((c) => c.date)).size,
      waist: weekWaists[0]?.waistIn ?? null,
      flag: null,
      current: n === current && today <= end,
    });
    if (avgWeight !== null) prevAvg = avgWeight;
  }

  // Flags only on finished weeks (a half week's average is noise).
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.current || r.change === null || r.n < 3 || isMaintenanceWeek(r.n)) continue;
    const loss = -r.change;
    const prevLoss = rows[i - 1]?.change === null ? null : -(rows[i - 1].change as number);
    if (loss > 2) r.flag = "add";
    else if (r.n >= 4 && loss < 0.5 && prevLoss !== null && prevLoss < 0.5) r.flag = "cut";
  }
  return rows;
}

/** Top of a rep range: "6-10" → 10, "12-15" → 15, "10" → 10. */
export function topOfRange(targetReps: string): number | null {
  const nums = targetReps.match(/\d+/g);
  if (!nums) return null;
  return Math.max(...nums.map(Number));
}
