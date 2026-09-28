"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem } from "@/lib/data";
import type { FoodEntry, WaistLog, WeightLog, Workout } from "@/lib/types";
import type { LoggedSessionDoc } from "@/lib/lifts";
import type { CardioLog } from "@/lib/cardio";
import WeightChart from "@/components/charts/WeightChart";
import { addDays, prettyDate, todayStr } from "@/lib/dates";
import {
  BLOCKS,
  CUT,
  CUT_END,
  SCHEDULE,
  DAILY_STEPS,
  blockFor,
  isLighterWeek,
  isMaintenanceWeek,
  kcalTarget,
  targetWeightFor,
  targetWeightOn,
  weekAvgWeight,
  weekIndex,
  weekStart,
  weeklyRows,
  type WeekRow,
} from "@/lib/cutPlan";

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}`;

export default function CutPage() {
  const today = todayStr();
  const { data: weights, uid } = useCollection<WeightLog>("weightLogs");
  const { data: foods } = useCollection<FoodEntry>("foodEntries");
  const { data: lifts } = useCollection<LoggedSessionDoc>("liftSessions");
  const { data: cardio } = useCollection<CardioLog>("cardio");
  const { data: workouts } = useCollection<Workout>("workouts");
  const { data: waists } = useCollection<WaistLog>("waistLogs");
  const [waistInput, setWaistInput] = useState("");

  const n = weekIndex(today);
  const week = Math.min(Math.max(n, 1), CUT.weeks);
  const block = blockFor(week);
  const started = n >= 1;
  const daysLeft = Math.max(
    0,
    Math.round((new Date(CUT_END + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000),
  );

  const rows = useMemo(
    () => weeklyRows(weights, foods, lifts, cardio, waists, today),
    [weights, foods, lifts, cardio, waists, today],
  );

  const thisWeekAvg = weekAvgWeight(weights, weekStart(week));
  const target = targetWeightFor(week);
  const todayFoods = foods.filter((f) => f.date === today);
  const todayKcal = todayFoods.reduce((s, f) => s + (f.calories || 0), 0);
  const todayProtein = todayFoods.reduce((s, f) => s + (f.proteinG ?? 0), 0);
  const todayWaist = waists.find((w) => w.date === today);
  const lastWaist = [...waists].sort((a, b) => b.date.localeCompare(a.date))[0];

  const chartLogs = useMemo(
    () => weights.filter((w) => w.date >= addDays(CUT.start, -14) && w.date <= CUT_END),
    [weights],
  );

  // This week's schedule with done ticks: lifts from liftSessions, everything
  // else from cardio or the Exercise habit.
  const monday = weekStart(week);
  const days = SCHEDULE.map((d, i) => {
    const date = addDays(monday, i);
    const lifted = lifts.some((l) => l.date === date);
    const moved = cardio.some((c) => c.date === date) || workouts.some((w) => w.date === date);
    const done = d.kind === "lift" ? lifted : d.kind === "rest" ? false : moved || lifted;
    return { ...d, date, done };
  });

  async function saveWaist(e: React.FormEvent) {
    e.preventDefault();
    const v = parseFloat(waistInput);
    if (!uid || Number.isNaN(v) || v <= 0) return;
    if (todayWaist) await updateItem(uid, "waistLogs", todayWaist.id, { waistIn: v });
    else await addItem(uid, "waistLogs", { date: today, waistIn: v });
    setWaistInput("");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Fall Cut</h1>
        <p className="text-sm text-muted">
          {started
            ? `Week ${week} of ${CUT.weeks} · Block ${block.n}: ${block.title} · ${daysLeft} days left`
            : `Starts ${prettyDate(CUT.start)}`}
          {isMaintenanceWeek(week) && " · Maintenance week"}
          {isLighterWeek(week) && " · Lighter lifting week"}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="This week avg"
          value={thisWeekAvg !== null ? `${thisWeekAvg.toFixed(1)}` : "—"}
          sub={`target ${target.toFixed(1)}`}
          tone={thisWeekAvg === null ? undefined : thisWeekAvg <= target ? "good" : "bad"}
        />
        <Stat
          label="From start"
          value={thisWeekAvg !== null ? signed(thisWeekAvg - CUT.startWeight) : "—"}
          sub={`started at ${CUT.startWeight}`}
        />
        <Stat
          label="To go"
          value={thisWeekAvg !== null ? Math.max(0, thisWeekAvg - CUT.goalWeight).toFixed(1) : "—"}
          sub={`goal ${CUT.goalWeight} by ${prettyDate(CUT_END).replace(/^\w+,\s*/, "")}`}
        />
        <Stat
          label="Today"
          value={`${todayKcal.toLocaleString()} cal`}
          sub={`${todayProtein} / ${CUT.proteinG} g protein`}
          tone={todayKcal > kcalTarget(week) ? "bad" : undefined}
        />
      </section>

      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="section-title">Weight</h2>
          <span className="text-xs text-muted">Daily · weekly average · glide path</span>
        </div>
        <WeightChart logs={chartLogs} weeklyAvg targetFor={targetWeightOn} />
      </section>

      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="section-title">This week</h2>
          <span className="text-xs text-muted">
            {DAILY_STEPS.toLocaleString()}+ steps every day · {kcalTarget(week).toLocaleString()} cal ·{" "}
            {CUT.proteinG} g protein
          </span>
        </div>
        <ul className="divide-y divide-line">
          {days.map((d) => {
            const isToday = d.date === today;
            return (
              <li key={d.label} className={`flex items-start gap-3 py-2.5 ${isToday ? "-mx-2 rounded-lg bg-indigo/5 px-2" : ""}`}>
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs ${
                    d.done ? "border-teal bg-teal text-white" : "border-line text-muted"
                  }`}
                >
                  {d.done ? "✓" : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    <span className="mr-1.5 text-muted">{d.label}</span>
                    {d.title}
                    {d.kind === "lift" && isLighterWeek(week) && (
                      <span className="ml-1.5 text-xs font-normal text-muted">(lighter: 2 sets)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">{d.detail}</p>
                </div>
                {d.workoutKey && !d.done && (isToday || d.date < today) && (
                  <Link href={`/lifts/new/${d.workoutKey}`} className="shrink-0 text-xs font-semibold text-indigo">
                    Start →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="section-title">Weekly check-in</h2>
          <span className="text-xs text-muted">Compare weekly averages, not single days</span>
        </div>
        <form onSubmit={saveWaist} className="mb-4 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            className="input"
            placeholder={
              todayWaist
                ? `Waist today: ${todayWaist.waistIn} in`
                : lastWaist
                  ? `Waist at the navel (last ${lastWaist.waistIn} in)`
                  : "Waist at the navel (in)"
            }
            value={waistInput}
            onChange={(e) => setWaistInput(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0">
            Save waist
          </button>
        </form>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Week 1 starts {prettyDate(CUT.start)}.</p>
        ) : (
          <ul className="space-y-2">
            {[...rows].reverse().map((r) => (
              <WeekItem key={r.n} r={r} />
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="section-title mb-3">Lifting blocks</h2>
        <div className="space-y-3">
          {BLOCKS.map((b) => (
            <div
              key={b.n}
              className={`rounded-lg border p-3 ${b.n === block.n && started ? "border-indigo bg-indigo/5" : "border-line"}`}
            >
              <p className="text-sm font-semibold text-ink">
                Block {b.n} · weeks {b.weeks}: {b.title}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {b.notes.map((note) => (
                  <li key={note}>{note.includes("→") ? `• ${note}` : note}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Link href="/lifts" className="mt-3 inline-block text-xs font-semibold text-indigo">
          Workouts tab →
        </Link>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="section-title mb-3">The rules</h2>
        <div className="space-y-3 text-sm">
          <Rule title="Eat">
            {CUT.kcal.toLocaleString()} cal and {CUT.proteinG} g protein every day. Protein first. Log every day, same
            as last fall.
          </Rule>
          <Rule title="Adjust">
            Ignore weeks 1-2 (water). Two weeks in a row losing under 0.5 lb: cut 150 cal or add 2,000 steps. Losing
            over 2 lb in a week: add 150 cal.
          </Rule>
          <Rule title="Bloat">
            Alcohol is the biggest lever: the 3-drink cap holds and drinks count toward the {CUT.kcal.toLocaleString()}.
            Keep fiber (~30 g), salt and water steady. Last food about 3 hours before bed.
          </Rule>
          <Rule title="Thanksgiving">
            Week of {prettyDate(weekStart(CUT.maintenanceWeeks[0])).replace(/^\w+,\s*/, "")}: eat at maintenance
            (~{CUT.maintenanceKcal.toLocaleString()}), keep lifting, then back to the plan.
          </Rule>
          <Rule title="The exit">
            At {CUT.goalWeight} or {prettyDate(CUT_END).replace(/^\w+,\s*/, "")}: book a DEXA and compare with 12/16/25
            (156 lb, 16%). Add ~150 cal a week for 3-4 weeks up to ~2,400. Keep all 3 lift days and daily weigh-ins.
            Weekly average above {CUT.pullBackAbove}: back to 2,100.
          </Rule>
        </div>
      </section>
    </div>
  );
}

function WeekItem({ r }: { r: WeekRow }) {
  const onTrack = r.avgWeight !== null && r.avgWeight <= r.target;
  return (
    <li className={`rounded-lg border p-3 ${r.current ? "border-indigo" : "border-line"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          Week {r.n} <span className="font-normal text-muted">· {prettyDate(r.start).replace(/^\w+,\s*/, "")}</span>
          {r.current && <span className="ml-1.5 text-xs font-normal text-indigo">in progress</span>}
        </p>
        {r.flag && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              r.flag === "cut" ? "bg-coral/15 text-coral" : "bg-amber/15 text-amber"
            }`}
          >
            {r.flag === "cut" ? "Cut 150 cal" : "Add 150 cal"}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm">
        {r.avgWeight !== null ? (
          <>
            <span className={`font-semibold ${onTrack ? "text-teal" : "text-coral"}`}>{r.avgWeight.toFixed(1)}</span>
            <span className="text-muted"> avg vs {r.target.toFixed(1)} target</span>
            {r.change !== null && <span className="text-muted"> · {signed(r.change)} lb</span>}
            <span className="text-muted"> · {r.weighIns} weigh-ins</span>
          </>
        ) : (
          <span className="text-muted">No weigh-ins (target {r.target.toFixed(1)})</span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {[
          r.avgKcal !== null ? `${r.avgKcal.toLocaleString()} cal/day` : "no calories",
          r.avgProtein !== null ? `${r.avgProtein} g protein` : null,
          `${r.lifts} lift${r.lifts === 1 ? "" : "s"}`,
          `${r.cardio} cardio`,
          r.waist !== null ? `waist ${r.waist} in` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </li>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "bad" }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-xl font-extrabold ${tone === "good" ? "text-teal" : tone === "bad" ? "text-coral" : "text-ink"}`}>
        {value}
      </p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-ink">{title}</p>
      <p className="text-muted">{children}</p>
    </div>
  );
}
