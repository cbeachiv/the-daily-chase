// Step-count goal math, shared by the Health card, the Today tile, the weekly
// email, and the /api/steps ingestion route. Pure TS: no firebase, no "use client".

import type { StepLog } from "@/lib/types";
import { addDays, daysInMonth } from "@/lib/dates";

export const STEP_LOGS = "stepLogs";
export const STEP_GOALS = "stepGoals";
export const DEFAULT_STEP_TARGET = 12000;
// Validation ceiling for a single day; anything above this is a bad payload.
export const MAX_STEPS_PER_DAY = 150000;

export const stepLogId = (date: string) => `s_${date}`;

// 8432 -> "8.4k", 950 -> "950". Same shape as the calendar's calorie labels.
export function fmtSteps(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

export interface StepPace {
  month: string; // YYYY-MM
  dailyTarget: number;
  daysInMonth: number;
  monthTarget: number; // dailyTarget * daysInMonth
  total: number; // steps logged so far this month
  dayOfMonth: number; // 1-based; 0 for a future month, daysInMonth for a past one
  remainingDays: number; // includes today, whose count is still accumulating
  neededPerDay: number; // average needed over remainingDays to hit monthTarget
  onPace: boolean; // neededPerDay <= dailyTarget
  done: boolean; // total >= monthTarget
  pct: number; // 0..100 of monthTarget
  deltaVsPlan: number; // total minus dailyTarget * (dayOfMonth - 1); + = ahead
  todaySteps: number;
  avg7: number | null; // mean over the last 7 dates that have a log
}

// Today counts as a remaining day because its number is still growing, so the
// pace is slightly conservative in the morning (the motivating direction) and
// flips to "on pace" the moment a big walk lands.
export function monthPace(
  logs: StepLog[],
  today: string,
  dailyTarget: number,
  month: string = today.slice(0, 7),
): StepPace {
  const D = daysInMonth(month);
  const todayMonth = today.slice(0, 7);
  const dayOfMonth = month < todayMonth ? D : month > todayMonth ? 0 : Number(today.slice(8));
  const remainingDays = month < todayMonth ? 0 : month > todayMonth ? D : D - dayOfMonth + 1;

  const monthTarget = dailyTarget * D;
  let total = 0;
  for (const l of logs) if (l.date.startsWith(month + "-")) total += l.steps;

  const done = total >= monthTarget;
  const neededPerDay =
    done || remainingDays === 0 ? 0 : Math.ceil((monthTarget - total) / remainingDays);
  const onPace = neededPerDay <= dailyTarget;
  const pct = monthTarget > 0 ? Math.min(100, (total / monthTarget) * 100) : 0;
  const deltaVsPlan = total - dailyTarget * Math.max(0, dayOfMonth - 1);

  const todaySteps = logs.find((l) => l.date === today)?.steps ?? 0;
  const cutoff = addDays(today, -6);
  const recent = logs.filter((l) => l.date >= cutoff && l.date <= today);
  const avg7 = recent.length
    ? Math.round(recent.reduce((s, l) => s + l.steps, 0) / recent.length)
    : null;

  return {
    month,
    dailyTarget,
    daysInMonth: D,
    monthTarget,
    total,
    dayOfMonth,
    remainingDays,
    neededPerDay,
    onPace,
    done,
    pct,
    deltaVsPlan,
    todaySteps,
    avg7,
  };
}

// One-line status for the card, tile, and email.
export function paceLabel(p: StepPace): string {
  if (p.done) return "Goal hit";
  if (p.onPace) return `On pace, ${fmtSteps(p.neededPerDay)}/day keeps it`;
  return `Behind, need ${fmtSteps(p.neededPerDay)}/day`;
}
