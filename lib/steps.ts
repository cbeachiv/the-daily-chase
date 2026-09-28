// Daily step counts from Apple Health, sent by the iOS "Log Steps" Shortcut to
// POST /api/steps. Pure TS: shared by the route and the Cut tab / Today card.

import type { StepLog } from "@/lib/types";
import { addDays } from "@/lib/dates";

export const STEP_LOGS = "stepLogs";
// Validation ceiling for a single day; anything above this is a bad payload.
export const MAX_STEPS_PER_DAY = 150000;

export const stepLogId = (date: string) => `s_${date}`;

// 8432 -> "8.4k", 950 -> "950".
export function fmtSteps(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

/** Mean steps over logged days in the 7 days starting `start`. */
export function weekAvgSteps(logs: Pick<StepLog, "date" | "steps">[], start: string): number | null {
  const end = addDays(start, 6);
  const days = logs.filter((l) => l.date >= start && l.date <= end);
  return days.length ? Math.round(days.reduce((s, l) => s + l.steps, 0) / days.length) : null;
}
