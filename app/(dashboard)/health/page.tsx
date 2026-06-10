"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem } from "@/lib/data";
import type { FoodEntry, WeightLog, Workout } from "@/lib/types";
import { addDays, todayStr } from "@/lib/dates";
import WeightChart from "@/components/charts/WeightChart";
import CaloriesChart from "@/components/charts/CaloriesChart";

export default function HealthPage() {
  const today = todayStr();
  const { data: weights, uid } = useCollection<WeightLog>("weightLogs");
  const { data: workouts } = useCollection<Workout>("workouts");
  const { data: foods } = useCollection<FoodEntry>("foodEntries");
  const [weightInput, setWeightInput] = useState("");

  const sortedWeights = useMemo(
    () => [...weights].sort((a, b) => a.date.localeCompare(b.date)),
    [weights]
  );
  const latest = sortedWeights[sortedWeights.length - 1];
  const prev = sortedWeights[sortedWeights.length - 2];
  const delta = latest && prev ? latest.weightLbs - prev.weightLbs : null;

  // Last 7 days of exercise.
  const last7 = useMemo(() => {
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));
    return days.map((d) => ({ date: d, did: workouts.some((w) => w.date === d) }));
  }, [workouts, today]);
  const monthCount = useMemo(
    () => workouts.filter((w) => w.date.slice(0, 7) === today.slice(0, 7)).length,
    [workouts, today]
  );

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
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Health</h1>
        <p className="text-sm text-muted">Weight, exercise, and calories over time.</p>
      </header>

      {/* Weight */}
      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="section-title">Weight</h2>
          {latest && (
            <span className="text-sm text-muted">
              {latest.weightLbs} lb
              {delta !== null && (
                <span className={delta <= 0 ? "text-teal" : "text-coral"}>
                  {" "}
                  {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
                </span>
              )}
            </span>
          )}
        </div>
        <WeightChart logs={weights} />
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
      </section>

      {/* Exercise */}
      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="section-title">Exercise</h2>
          <span className="text-sm text-muted">{monthCount} this month</span>
        </div>
        <div className="flex justify-between gap-1">
          {last7.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${
                  d.did ? "bg-teal text-white" : "bg-bg text-line"
                }`}
              >
                {d.did ? "✓" : "·"}
              </div>
              <span className="text-[10px] text-muted">
                {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "narrow" })}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Calories */}
      <section className="card p-4 sm:p-5">
        <h2 className="section-title mb-3">Calories</h2>
        <CaloriesChart entries={foods} />
      </section>
    </div>
  );
}
