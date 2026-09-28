"use client";

import Link from "next/link";
import { useCollection } from "@/lib/data";
import type { FoodEntry, StepLog, WeightLog } from "@/lib/types";
import { STEP_LOGS } from "@/lib/steps";
import StepsForm from "@/components/StepsForm";
import type { LoggedSessionDoc } from "@/lib/lifts";
import { todayStr } from "@/lib/dates";
import {
  CUT,
  DAILY_STEPS,
  isLighterWeek,
  kcalTarget,
  planDayFor,
  targetWeightFor,
  weekAvgWeight,
  weekIndex,
  weekStart,
} from "@/lib/cutPlan";

// Today's slice of the fall cut: what to do, calories/protein so far, and the
// week's average against the glide path. Hidden outside the 12 weeks.
export default function CutCard() {
  const today = todayStr();
  const { data: weights } = useCollection<WeightLog>("weightLogs");
  const { data: foods } = useCollection<FoodEntry>("foodEntries");
  const { data: lifts } = useCollection<LoggedSessionDoc>("liftSessions");
  const { data: stepLogs, uid } = useCollection<StepLog>(STEP_LOGS);

  const week = weekIndex(today);
  if (week < 1 || week > CUT.weeks) return null;

  const day = planDayFor(today);
  const lifted = lifts.some((l) => l.date === today);
  const todayFoods = foods.filter((f) => f.date === today);
  const kcal = todayFoods.reduce((s, f) => s + (f.calories || 0), 0);
  const protein = todayFoods.reduce((s, f) => s + (f.proteinG ?? 0), 0);
  const steps = stepLogs.find((s) => s.date === today)?.steps ?? 0;
  const avg = weekAvgWeight(weights, weekStart(week));
  const target = targetWeightFor(week);
  const kcalGoal = kcalTarget(week);

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title">
          Cut · week {week} of {CUT.weeks}
        </h2>
        <Link href="/cut" className="text-xs font-semibold text-indigo">
          Plan →
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {day.title}
            {day.kind === "lift" && isLighterWeek(week) && (
              <span className="ml-1.5 text-xs font-normal text-muted">(lighter: 2 sets)</span>
            )}
          </p>
          <p className="text-xs text-muted">{day.detail}</p>
        </div>
        {day.workoutKey &&
          (lifted ? (
            <span className="shrink-0 text-xs font-semibold text-teal">Done ✓</span>
          ) : (
            <Link href={`/lifts/new/${day.workoutKey}`} className="btn-primary shrink-0 px-3 py-1.5 text-xs">
              Start
            </Link>
          ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-2 gap-y-4 text-center sm:grid-cols-4">
        <Meter label="Calories" value={kcal} goal={kcalGoal} unit="" overIsBad />
        <Meter label="Protein" value={protein} goal={CUT.proteinG} unit=" g" />
        <Meter label="Steps" value={steps} goal={DAILY_STEPS} unit="" />
        <div>
          <p className={`text-lg font-extrabold ${avg === null ? "text-muted" : avg <= target ? "text-teal" : "text-coral"}`}>
            {avg === null ? "—" : avg.toFixed(1)}
          </p>
          <p className="text-[11px] text-muted">week avg · target {target.toFixed(1)}</p>
        </div>
      </div>

      <div className="mt-4">
        <StepsForm uid={uid} stepLogs={stepLogs} />
      </div>
    </section>
  );
}

function Meter({
  label,
  value,
  goal,
  unit,
  overIsBad = false,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  overIsBad?: boolean;
}) {
  const pct = Math.min(100, (value / goal) * 100);
  const over = value > goal;
  const color = overIsBad && over ? "bg-coral" : !overIsBad && value >= goal ? "bg-teal" : "bg-indigo";
  return (
    <div>
      <p className="text-lg font-extrabold text-ink">
        {value.toLocaleString()}
        <span className="text-xs font-medium text-muted">
          /{goal.toLocaleString()}
          {unit}
        </span>
      </p>
      <div className="mx-auto mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted">{label}</p>
    </div>
  );
}
