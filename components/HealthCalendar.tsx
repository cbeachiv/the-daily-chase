"use client";

import { useMemo, useState } from "react";
import type {
  CoffeeLog,
  DinnerPlanLog,
  FoodEntry,
  MoodLog,
  Travel,
  WakeupLog,
  WeightLog,
  Workout,
} from "@/lib/types";
import type { LoggedSessionDoc } from "@/lib/lifts";
import { type CardioLog, CARDIO_KIND_LABEL } from "@/lib/cardio";
import { addDays, prettyClock, todayStr } from "@/lib/dates";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const RACKET_KINDS = new Set<string>(["pickleball", "tennis"]);

// A month-grid overview of the daily health log. Each cell surfaces, when
// present: 5am wakeup, exercise, mood, weight, coffees, dinner plan, wake/bed time, calories.
export default function HealthCalendar({
  weights,
  workouts,
  lifts,
  cardio,
  foods,
  wakeups,
  moods,
  coffees,
  dinnerPlans,
  travel,
}: {
  weights: WeightLog[];
  workouts: Workout[];
  lifts: LoggedSessionDoc[];
  cardio: CardioLog[];
  foods: FoodEntry[];
  wakeups: WakeupLog[];
  moods: MoodLog[];
  coffees: CoffeeLog[];
  dinnerPlans: DinnerPlanLog[];
  travel: Travel[];
}) {
  const today = todayStr();
  const [month, setMonth] = useState(today.slice(0, 7)); // "YYYY-MM"

  // Index everything by date so each cell is a cheap lookup.
  const byDate = useMemo(() => {
    const wakeupSet = new Set(wakeups.map((w) => w.date));

    // What you actually did that day, labeled: lifts by session name, cardio by
    // kind/activity. A generic exercise toggle only shows when there's no
    // specific lift/cardio session to name for that day.
    const exercise: Record<string, { icon: string; label: string }[]> = {};
    const add = (date: string, icon: string, label: string) => {
      (exercise[date] ??= []).push({ icon, label });
    };
    for (const l of lifts) add(l.date, "🏋️", l.name?.trim() || "Workout");
    for (const c of cardio) {
      const label =
        c.kind === "other" ? c.activity?.trim() || "Cardio" : CARDIO_KIND_LABEL[c.kind];
      add(c.date, RACKET_KINDS.has(c.kind) ? "🎾" : "🏃", label);
    }
    for (const w of workouts) {
      if (!exercise[w.date]) add(w.date, "🏃", w.type?.trim() || "Exercise");
    }

    const weight: Record<string, number> = {};
    for (const w of weights) weight[w.date] = w.weightLbs;

    const calories: Record<string, number> = {};
    for (const f of foods) calories[f.date] = (calories[f.date] ?? 0) + f.calories;

    const coffeeCount: Record<string, number> = {};
    for (const c of coffees) coffeeCount[c.date] = (coffeeCount[c.date] ?? 0) + 1;

    const dinnerPlanSet = new Set(dinnerPlans.map((d) => d.date));

    // Latest mood log of each day carries that day's mood + sleep times.
    const mood: Record<string, MoodLog> = {};
    for (const m of moods) {
      const cur = mood[m.date];
      if (!cur || m.loggedAt > cur.loggedAt) mood[m.date] = m;
    }

    // Each trip paints every day in its [startDate, endDate] range.
    const trip: Record<string, string[]> = {};
    for (const t of travel) {
      const end = t.endDate || t.startDate;
      for (let d = t.startDate; d <= end; d = addDays(d, 1)) {
        (trip[d] ??= []).push(t.destination);
      }
    }

    return { wakeupSet, exercise, weight, calories, coffeeCount, dinnerPlanSet, mood, trip };
  }, [weights, workouts, lifts, cardio, foods, wakeups, moods, coffees, dinnerPlans, travel]);

  const { cells, label } = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const firstDow = first.getDay(); // 0 = Sunday
    const daysInMonth = new Date(y, m, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(`${month}-${String(d).padStart(2, "0")}`);
    }
    return {
      cells: out,
      label: first.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  }, [month]);

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const fmtCal = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title">Daily Log</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shiftMonth(-1)}
            className="rounded-md px-2 py-1 text-muted transition hover:bg-bg hover:text-ink"
            title="Previous month"
          >
            ‹
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold">{label}</span>
          <button
            onClick={() => shiftMonth(1)}
            className="rounded-md px-2 py-1 text-muted transition hover:bg-bg hover:text-ink"
            title="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="pb-1 text-center text-[10px] font-semibold text-muted">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const isToday = date === today;
          const isFuture = date > today;
          const mood = byDate.mood[date];
          const weight = byDate.weight[date];
          const calories = byDate.calories[date] ?? 0;
          const coffees = byDate.coffeeCount[date] ?? 0;
          const followedDinnerPlan = byDate.dinnerPlanSet.has(date);
          const woke = byDate.wakeupSet.has(date);
          const exercises = byDate.exercise[date] ?? [];
          const trips = byDate.trip[date] ?? [];
          const drinks = mood?.alcoholDrinks ?? 0;
          // A logged 5am wakeup is an explicit "got up at 5" signal, so it sets
          // the wake time to 5:00 AM; otherwise fall back to the mood log's time.
          const wakeTime = woke ? "05:00" : mood?.wakeTime;
          const day = Number(date.slice(8));
          return (
            <div
              key={i}
              className={`flex min-h-[78px] flex-col rounded-lg border p-1 ${
                isToday ? "border-indigo bg-indigo/5" : "border-line"
              } ${isFuture && trips.length === 0 ? "opacity-40" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-semibold ${isToday ? "text-indigo" : "text-ink"}`}
                >
                  {day}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] leading-none">
                  {woke && <span title="Woke up at 5am">☀️</span>}
                </span>
              </div>
              {(!isFuture || trips.length > 0) && (
                <div className="mt-0.5 flex flex-col gap-px text-[10px] leading-tight text-muted">
                  {trips.map((dest, j) => (
                    <span
                      key={j}
                      className="truncate font-medium text-sky"
                      title={`${dest} (travel)`}
                    >
                      ✈️ {dest}
                    </span>
                  ))}
                  {wakeTime && (
                    <span title="Woke up at">⏰ {prettyClock(wakeTime)}</span>
                  )}
                  {weight !== undefined && (
                    <span className="text-ink" title="Weight (lb)">
                      ⚖️ {weight}
                    </span>
                  )}
                  {exercises.map((e, j) => (
                    <span
                      key={j}
                      className="truncate font-medium text-teal"
                      title={`${e.label} (exercise)`}
                    >
                      {e.icon} {e.label}
                    </span>
                  ))}
                  {mood?.mood != null && (
                    <span className="font-semibold text-indigo" title="Mood (1–10)">
                      🙂 {mood.mood}
                    </span>
                  )}
                  {drinks > 0 && (
                    <span className="text-coral" title="Alcoholic drinks">
                      🍷 {drinks}
                    </span>
                  )}
                  {coffees > 0 && <span title="Coffees">☕ {coffees}</span>}
                  {followedDinnerPlan && (
                    <span className="text-teal" title="Followed dinner plan">
                      🫐🥭 plan
                    </span>
                  )}
                  {calories > 0 && <span title="Calories">🍽️ {fmtCal(calories)}</span>}
                  {mood?.bedtime && (
                    <span title="Went to bed at">🛏️ {prettyClock(mood.bedtime)}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
        <span>☀️ 5am</span>
        <span>🏋️ lift</span>
        <span>🏃 cardio</span>
        <span>🙂 mood</span>
        <span>🍷 drinks</span>
        <span>✈️ travel</span>
        <span>⚖️ weight</span>
        <span>☕ coffee</span>
        <span>🫐🥭 dinner plan</span>
        <span>🍽️ calories</span>
        <span>⏰ woke</span>
        <span>🛏️ bed</span>
      </div>
    </section>
  );
}
