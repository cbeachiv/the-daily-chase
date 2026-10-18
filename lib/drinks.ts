// Alcoholic drinks, one doc per day: users/{uid}/drinkLogs/d_YYYY-MM-DD, keyed
// by the day the drinks were had. Saved on their own, so logging drinks never
// creates a mood check-in. Pure TS: shared by the client and the cron emails.

import type { DrinkLog, MoodLog } from "@/lib/types";
import { addDays } from "@/lib/dates";

export const DRINK_LOGS = "drinkLogs";
export const drinkLogId = (date: string) => `d_${date}`;

/**
 * Drinks per day (YYYY-MM-DD -> count). drinkLogs win; older data lives on mood
 * logs as `alcoholDrinks`, which the form asked as "drinks yesterday", so a
 * log dated D counts for D-1. Drinks-only mood logs (no mood score, from the
 * June backfill) were entered for their own date and stay put.
 */
export function drinksByDate(
  drinkLogs: Pick<DrinkLog, "date" | "drinks">[],
  moods: Pick<MoodLog, "date" | "loggedAt" | "mood" | "alcoholDrinks">[]
): Record<string, number> {
  const legacy: Record<string, { at: string; n: number }> = {};
  for (const m of moods) {
    if (typeof m.alcoholDrinks !== "number") continue;
    const day = m.mood == null ? m.date : addDays(m.date, -1);
    const cur = legacy[day];
    if (!cur || m.loggedAt > cur.at) legacy[day] = { at: m.loggedAt, n: m.alcoholDrinks };
  }
  const out: Record<string, number> = {};
  for (const [day, v] of Object.entries(legacy)) out[day] = v.n;
  for (const d of drinkLogs) out[d.date] = d.drinks;
  return out;
}
