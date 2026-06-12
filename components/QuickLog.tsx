"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type { CoffeeLog, FoodEntry, WeightLog, Workout } from "@/lib/types";
import { todayStr } from "@/lib/dates";

export default function QuickLog() {
  const today = todayStr();
  const { data: workouts, uid } = useCollection<Workout>("workouts");
  const { data: weights } = useCollection<WeightLog>("weightLogs");
  const { data: foods } = useCollection<FoodEntry>("foodEntries");
  const { data: coffees } = useCollection<CoffeeLog>("coffeeLogs");

  const [open, setOpen] = useState<"weight" | "calories" | null>(null);
  const [val, setVal] = useState("");

  const todayWorkout = useMemo(() => workouts.find((w) => w.date === today), [workouts, today]);
  const todayWeight = useMemo(() => weights.find((w) => w.date === today), [weights, today]);
  const todayCalories = useMemo(
    () => foods.filter((f) => f.date === today).reduce((s, f) => s + f.calories, 0),
    [foods, today]
  );

  const todayCoffees = useMemo(
    () => coffees.filter((c) => c.date === today).length,
    [coffees, today]
  );

  // One tap per coffee — each becomes a timestamped doc so mood logs and AI
  // insights can correlate timing, not just counts.
  async function logCoffee() {
    if (!uid) return;
    await addItem(uid, "coffeeLogs", { date: today, loggedAt: new Date().toISOString() });
  }

  async function toggleExercise() {
    if (!uid) return;
    if (todayWorkout) await deleteItem(uid, "workouts", todayWorkout.id);
    else await addItem(uid, "workouts", { date: today, type: "Exercise" });
  }

  async function saveValue() {
    if (!uid) return;
    const n = parseFloat(val);
    if (Number.isNaN(n) || n <= 0) {
      setOpen(null);
      setVal("");
      return;
    }
    if (open === "weight") {
      if (todayWeight) await updateItem(uid, "weightLogs", todayWeight.id, { weightLbs: n });
      else await addItem(uid, "weightLogs", { date: today, weightLbs: n });
    } else if (open === "calories") {
      await addItem(uid, "foodEntries", { date: today, calories: Math.round(n), label: "" });
    }
    setOpen(null);
    setVal("");
  }

  const tile = "card flex flex-col items-center justify-center gap-1 px-2 py-4 text-center transition active:scale-[0.98]";

  return (
    <section>
      <h2 className="section-title mb-3">Quick log</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          onClick={logCoffee}
          className={`${tile} ${todayCoffees > 0 ? "border-amber bg-amber/10" : ""}`}
          title="Log a coffee right now"
        >
          <span className="text-2xl">☕</span>
          <span className="text-xs font-semibold">
            {todayCoffees > 0 ? `${todayCoffees} today` : "Coffee"}
          </span>
        </button>

        <button
          onClick={toggleExercise}
          className={`${tile} ${todayWorkout ? "border-teal bg-teal/10" : ""}`}
        >
          <span className="text-2xl">{todayWorkout ? "✅" : "🏋️"}</span>
          <span className="text-xs font-semibold">
            {todayWorkout ? "Exercised" : "Exercise"}
          </span>
        </button>

        <button
          onClick={() => {
            setOpen(open === "weight" ? null : "weight");
            setVal(todayWeight ? String(todayWeight.weightLbs) : "");
          }}
          className={`${tile} ${open === "weight" ? "border-indigo" : ""}`}
        >
          <span className="text-2xl">⚖️</span>
          <span className="text-xs font-semibold">
            {todayWeight ? `${todayWeight.weightLbs} lb` : "Weight"}
          </span>
        </button>

        <button
          onClick={() => {
            setOpen(open === "calories" ? null : "calories");
            setVal("");
          }}
          className={`${tile} ${open === "calories" ? "border-coral" : ""}`}
        >
          <span className="text-2xl">🍽️</span>
          <span className="text-xs font-semibold">
            {todayCalories > 0 ? `${todayCalories.toLocaleString()} cal` : "Calories"}
          </span>
        </button>
      </div>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveValue();
          }}
          className="mt-3 flex gap-2"
        >
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            step="any"
            className="input"
            placeholder={open === "weight" ? "Weight in lbs" : "Add calories"}
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0">
            {open === "weight" ? "Save" : "Add"}
          </button>
        </form>
      )}
    </section>
  );
}
