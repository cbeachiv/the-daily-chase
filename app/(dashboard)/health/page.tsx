"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type {
  CoffeeLog,
  DinnerPlanLog,
  FoodEntry,
  MoodLog,
  WakeupLog,
  WeightLog,
  Workout,
} from "@/lib/types";
import type { LoggedSessionDoc } from "@/lib/lifts";
import type { CardioLog } from "@/lib/cardio";
import { addDays, todayStr } from "@/lib/dates";
import WeightChart from "@/components/charts/WeightChart";
import CaloriesChart from "@/components/charts/CaloriesChart";
import MoodSection from "@/components/MoodSection";
import InjuriesSection from "@/components/InjuriesSection";
import HealthCalendar from "@/components/HealthCalendar";

const RANGES: { label: string; days: number | null }[] = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All", days: null },
];

export default function HealthPage() {
  const today = todayStr();
  const { data: weights, uid } = useCollection<WeightLog>("weightLogs");
  const { data: workouts } = useCollection<Workout>("workouts");
  const { data: lifts } = useCollection<LoggedSessionDoc>("liftSessions");
  const { data: cardio } = useCollection<CardioLog>("cardio");
  const { data: foods } = useCollection<FoodEntry>("foodEntries");
  const { data: wakeups } = useCollection<WakeupLog>("wakeupLogs");
  const { data: moods } = useCollection<MoodLog>("moodLogs");
  const { data: coffees } = useCollection<CoffeeLog>("coffeeLogs");
  const { data: dinnerPlans } = useCollection<DinnerPlanLog>("dinnerPlanLogs");
  const [weightInput, setWeightInput] = useState("");
  const [range, setRange] = useState("3M");
  const [weightOpen, setWeightOpen] = useState(false);
  const [caloriesOpen, setCaloriesOpen] = useState(false);

  const activeDays = RANGES.find((r) => r.label === range)?.days ?? null;
  const startDate = activeDays === null ? null : addDays(today, -activeDays);
  // Daily bars for short windows; weekly averages once it'd get too dense.
  const granularity: "day" | "week" = range === "1M" || range === "3M" ? "day" : "week";
  const weightsInRange = useMemo(
    () => weights.filter((w) => !startDate || w.date >= startDate),
    [weights, startDate]
  );

  const sortedWeights = useMemo(
    () => [...weights].sort((a, b) => a.date.localeCompare(b.date)),
    [weights]
  );
  const latest = sortedWeights[sortedWeights.length - 1];
  const prev = sortedWeights[sortedWeights.length - 2];
  const delta = latest && prev ? latest.weightLbs - prev.weightLbs : null;
  const avg7 = useMemo(() => {
    const cutoff = addDays(today, -6);
    const recent = sortedWeights.filter((w) => w.date >= cutoff);
    if (!recent.length) return null;
    return recent.reduce((sum, w) => sum + w.weightLbs, 0) / recent.length;
  }, [sortedWeights, today]);

  // Last 7 days of exercise; today is tappable and stays in sync with the
  // home-page Quick log tile (same workouts collection).
  const last7 = useMemo(() => {
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));
    return days.map((d) => ({ date: d, did: workouts.some((w) => w.date === d) }));
  }, [workouts, today]);
  const monthCount = useMemo(
    () => workouts.filter((w) => w.date.slice(0, 7) === today.slice(0, 7)).length,
    [workouts, today]
  );

  // 5am wakeups — same boolean-by-presence pattern as exercise.
  const wakeup7 = useMemo(() => {
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));
    return days.map((d) => ({ date: d, did: wakeups.some((w) => w.date === d) }));
  }, [wakeups, today]);
  const wakeupMonthCount = useMemo(
    () => wakeups.filter((w) => w.date.slice(0, 7) === today.slice(0, 7)).length,
    [wakeups, today]
  );
  // Consecutive-day streak. If today isn't logged yet, count from yesterday so
  // the streak holds through the day until you log (or miss) it.
  const wakeupStreak = useMemo(() => {
    let count = 0;
    const start = wakeups.some((w) => w.date === today) ? 0 : 1;
    for (let i = start; i < 366; i++) {
      if (wakeups.some((w) => w.date === addDays(today, -i))) count++;
      else break;
    }
    return count;
  }, [wakeups, today]);

  const todayCalories = useMemo(
    () => foods.filter((f) => f.date === today).reduce((s, f) => s + f.calories, 0),
    [foods, today]
  );

  async function toggleTodayWorkout() {
    if (!uid) return;
    const todayWorkout = workouts.find((w) => w.date === today);
    if (todayWorkout) await deleteItem(uid, "workouts", todayWorkout.id);
    else await addItem(uid, "workouts", { date: today, type: "Exercise" });
  }

  async function toggleTodayWakeup() {
    if (!uid) return;
    const todayWakeup = wakeups.find((w) => w.date === today);
    if (todayWakeup) await deleteItem(uid, "wakeupLogs", todayWakeup.id);
    else await addItem(uid, "wakeupLogs", { date: today, loggedAt: new Date().toISOString() });
  }

  async function saveWeight(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(weightInput);
    if (Number.isNaN(n) || n <= 0 || !uid) return;
    const todayLog = weights.find((w) => w.date === today);
    if (todayLog) await updateItem(uid, "weightLogs", todayLog.id, { weightLbs: n });
    else await addItem(uid, "weightLogs", { date: today, weightLbs: n });
    setWeightInput("");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Health</h1>
          <p className="text-sm text-muted">Wakeups, exercise, mood, weight, calories, and injuries.</p>
        </div>
        <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.label)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                range === r.label ? "bg-card text-ink shadow-card" : "text-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <HealthCalendar
        weights={weights}
        workouts={workouts}
        lifts={lifts}
        cardio={cardio}
        foods={foods}
        wakeups={wakeups}
        moods={moods}
        coffees={coffees}
        dinnerPlans={dinnerPlans}
      />

      {/* 5am wakeup + exercise, side by side */}
      <div className="grid items-start gap-3 sm:grid-cols-2 sm:gap-4">
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="section-title">5am Wakeup</h2>
            <span className="text-xs text-muted">
              {wakeupStreak > 0 && <span className="font-semibold text-amber">🔥 {wakeupStreak} day{wakeupStreak === 1 ? "" : "s"}</span>}
              {wakeupStreak > 0 && " · "}
              {wakeupMonthCount} this month
            </span>
          </div>
          <div className="flex justify-between gap-0.5">
            {wakeup7.map((d, i) => {
              const isToday = i === wakeup7.length - 1;
              const circle = `flex h-7 w-7 items-center justify-center rounded-full text-xs transition ${
                d.did ? "bg-amber text-white" : "bg-bg text-line"
              }`;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  {isToday ? (
                    <button
                      onClick={toggleTodayWakeup}
                      className={`${circle} ring-2 ring-amber/40 ring-offset-1 ring-offset-card active:scale-95 ${
                        d.did ? "" : "hover:bg-amber/15 hover:text-amber"
                      }`}
                      title={d.did ? "Tap to undo today's 5am wakeup" : "Got up at 5am? Tap to log it"}
                    >
                      {d.did ? "✓" : "+"}
                    </button>
                  ) : (
                    <div className={circle}>{d.did ? "✓" : "·"}</div>
                  )}
                  <span
                    className={`text-[10px] ${isToday ? "font-bold text-ink" : "text-muted"}`}
                  >
                    {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "narrow",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="section-title">Exercise</h2>
            <span className="text-xs text-muted">{monthCount} this month</span>
          </div>
          <div className="flex justify-between gap-0.5">
            {last7.map((d, i) => {
              const isToday = i === last7.length - 1;
              const circle = `flex h-7 w-7 items-center justify-center rounded-full text-xs transition ${
                d.did ? "bg-teal text-white" : "bg-bg text-line"
              }`;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  {isToday ? (
                    <button
                      onClick={toggleTodayWorkout}
                      className={`${circle} ring-2 ring-teal/40 ring-offset-1 ring-offset-card active:scale-95 ${
                        d.did ? "" : "hover:bg-teal/15 hover:text-teal"
                      }`}
                      title={d.did ? "Tap to undo today's exercise" : "Tap to log exercise today"}
                    >
                      {d.did ? "✓" : "+"}
                    </button>
                  ) : (
                    <div className={circle}>{d.did ? "✓" : "·"}</div>
                  )}
                  <span
                    className={`text-[10px] ${isToday ? "font-bold text-ink" : "text-muted"}`}
                  >
                    {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "narrow",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <MoodSection startDate={startDate} />

      <InjuriesSection />

      {/* Weight — compact, expandable */}
      <section className="card p-4 sm:p-5">
        <button
          onClick={() => setWeightOpen((o) => !o)}
          className="flex w-full items-center justify-between"
        >
          <h2 className="section-title">Weight</h2>
          <span className="flex items-center gap-2 text-sm text-muted">
            {avg7 !== null && (
              <span className="text-muted/70">7d avg {avg7.toFixed(1)}</span>
            )}
            {latest && (
              <>
                {latest.weightLbs} lb
                {delta !== null && (
                  <span className={delta <= 0 ? "text-teal" : "text-coral"}>
                    {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
                  </span>
                )}
              </>
            )}
            <Chevron open={weightOpen} />
          </span>
        </button>
        <div className="mt-3">
          <WeightChart logs={weightsInRange} aspect={weightOpen ? 2 : 4.5} />
        </div>
        {weightOpen && (
          <form onSubmit={saveWeight} className="mt-3 flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              className="input"
              placeholder="Log today's weight (lb)"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
            />
            <button type="submit" className="btn-primary shrink-0">
              Save
            </button>
          </form>
        )}
      </section>

      {/* Calories — compact, expandable */}
      <section className="card p-4 sm:p-5">
        <button
          onClick={() => setCaloriesOpen((o) => !o)}
          className="flex w-full items-center justify-between"
        >
          <h2 className="section-title">Calories</h2>
          <span className="flex items-center gap-2 text-sm text-muted">
            {todayCalories > 0 && <>{todayCalories.toLocaleString()} today</>}
            <Chevron open={caloriesOpen} />
          </span>
        </button>
        <div className="mt-3">
          <CaloriesChart
            entries={foods}
            startDate={startDate}
            granularity={granularity}
            aspect={caloriesOpen ? 2 : 4.5}
          />
        </div>
      </section>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
