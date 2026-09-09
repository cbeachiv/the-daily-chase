"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/data";
import type { WeightLog, FoodEntry } from "@/lib/types";
import { addDays, prettyDate, shortDate, todayStr } from "@/lib/dates";
import { cardioDistanceMi, cardioPaceMin, fmtPace, type CardioLog } from "@/lib/cardio";
import {
  RACE,
  PR,
  PLAN,
  PLAN_START,
  PACE_BANDS,
  NUTRITION,
  SESSION_LABEL,
  type PlanWeek,
  type PlanSession,
  type SessionType,
  sessionDate,
  liftFor,
  weekFor,
  daysToRace,
  weightTargetFor,
  calorieTargetFor,
  fmtSec,
  paceFor5K,
} from "@/lib/trainingPlan";
import { useTrainingStatus, type SessionStatus } from "@/lib/useTrainingStatus";
import WeightChart from "@/components/charts/WeightChart";
import Chevron from "@/components/Chevron";

const TYPE_COLOR: Record<SessionType, string> = {
  test: "bg-sky/15 text-sky",
  intervals: "bg-coral/15 text-coral",
  hills: "bg-coral/15 text-coral",
  tempo: "bg-indigo/15 text-indigo",
  easy: "bg-teal/15 text-teal",
  long: "bg-teal/15 text-teal",
  timetrial: "bg-amber/15 text-amber",
  race: "bg-amber/15 text-amber",
  rest: "bg-bg text-muted",
};

export default function RacePage() {
  const today = todayStr();
  const days = daysToRace(today);
  const currentWeek = weekFor(today);
  const { status, toggle, uid } = useTrainingStatus();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Thanksgiving Day 5K</h1>
        <p className="text-sm text-muted">
          {prettyDate(RACE.date)} · {RACE.startTime} · {RACE.city}
        </p>
      </header>

      <Countdown days={days} />

      <ThisWeek week={currentWeek} today={today} status={status} toggle={toggle} canToggle={!!uid} />

      <FullPlan today={today} currentWeek={currentWeek} status={status} />

      <PaceBands />

      <BodyComp today={today} />

      <History />
    </div>
  );
}

/* ---------- countdown + goals ---------- */

function Countdown({ days }: { days: number }) {
  const goals: { label: string; sec: number; why: string }[] = [
    { label: "A", sec: RACE.goals.a, why: "Lifetime PR" },
    { label: "B", sec: RACE.goals.b, why: "Best standalone run ever" },
    { label: "C", sec: RACE.goals.c, why: "Clear of the Sep 8 test" },
  ];
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-4xl font-extrabold tracking-tight text-ink">
            {days > 0 ? days : days === 0 ? "Today" : "Done"}
            {days > 0 && <span className="ml-1 text-base font-semibold text-muted">days</span>}
          </p>
          <p className="text-xs text-muted">
            PR {fmtSec(PR.fiveK)} · {PR.fiveKSource}
          </p>
        </div>
        <div className="flex gap-2">
          {goals.map((g) => (
            <div key={g.label} className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{g.label} goal</p>
              <p className="text-sm font-bold text-ink">sub {fmtSec(g.sec)}</p>
              <p className="text-[10px] text-muted">{paceFor5K(g.sec)}/mi</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- this week ---------- */

function ThisWeek({
  week,
  today,
  status,
  toggle,
  canToggle,
}: {
  week: PlanWeek | null;
  today: string;
  status: (d: string) => SessionStatus;
  toggle: (d: string) => Promise<void>;
  canToggle: boolean;
}) {
  if (!week) {
    return (
      <section className="card p-4 sm:p-5">
        <h2 className="section-title">This week</h2>
        <p className="mt-1 text-sm text-muted">
          {today < PLAN_START ? `The block starts ${prettyDate(PLAN_START)}.` : "The block is over. Go eat."}
        </p>
      </section>
    );
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
  const sessionsByDate = new Map(week.sessions.map((s) => [sessionDate(week, s), s]));

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="section-title">
          Week {week.n} <span className="font-medium text-muted">· {week.phase}</span>
        </h2>
        <span className="text-xs text-muted">~{week.miles} mi</span>
      </div>
      {week.note && <p className="mb-3 text-sm text-muted">{week.note}</p>}

      <ul className="divide-y divide-line">
        {days.map((d) => {
          const s = sessionsByDate.get(d);
          const lift = liftFor(d);
          const st = status(d);
          const isToday = d === today;
          const past = d < today;
          return (
            <li key={d} className={`flex items-start gap-3 py-2.5 ${isToday ? "" : past ? "opacity-70" : ""}`}>
              <div className="w-12 shrink-0 pt-0.5">
                <p className={`text-xs font-semibold ${isToday ? "text-indigo" : "text-muted"}`}>
                  {new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                </p>
                <p className="text-[10px] text-muted">{shortDate(d).replace(/\/\d+$/, "")}</p>
              </div>

              {s ? (
                <SessionRow s={s} st={st} date={d} canToggle={canToggle} toggle={toggle} />
              ) : lift ? (
                <div className="flex flex-1 items-center justify-between gap-2">
                  <p className="text-sm text-ink">
                    Lift · {lift.name}
                    {week.n >= 10 && <span className="text-xs text-muted"> (legs light)</span>}
                  </p>
                  <Link href={`/lifts/new/${lift.key}`} className="text-xs font-semibold text-indigo">
                    Start →
                  </Link>
                </div>
              ) : (
                <p className="flex-1 text-sm text-muted">Off · walk if you like</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SessionRow({
  s,
  st,
  date,
  canToggle,
  toggle,
}: {
  s: PlanSession;
  st: SessionStatus;
  date: string;
  canToggle: boolean;
  toggle: (d: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const run = st.run;
  const runLine = run ? runSummary(run) : null;
  const logKind = s.type === "easy" || s.type === "long" || s.type === "race" ? "outdoor" : "treadmill";

  return (
    <div className="flex-1">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className={st.done ? "text-teal" : "text-line"}>{st.done ? "✓" : "○"}</span>
            <span className="truncate">{s.title}</span>
          </p>
          <p className="ml-5 text-xs text-muted">
            <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_COLOR[s.type]}`}>
              {SESSION_LABEL[s.type]}
            </span>
            {s.targetPace && <>{s.targetPace}/mi</>}
            {s.targetMi ? <> · ~{s.targetMi} mi</> : null}
            {runLine && <span className="text-teal"> · {runLine}</span>}
          </p>
        </button>
        {s.type !== "rest" && (
          <div className="flex shrink-0 items-center gap-2">
            {!st.run && (
              <Link
                href={`/lifts/cardio?kind=${logKind}&date=${date}&back=/race`}
                className="text-xs font-semibold text-indigo"
              >
                Log
              </Link>
            )}
            <button
              disabled={!canToggle}
              onClick={() => toggle(date)}
              className="text-xs font-semibold text-muted hover:text-ink disabled:opacity-40"
              title={st.done ? "Mark not done" : "Mark done"}
            >
              {st.done ? "Undo" : "Done"}
            </button>
          </div>
        )}
      </div>
      {open && s.detail && <p className="ml-5 mt-1 text-sm text-muted">{s.detail}</p>}
    </div>
  );
}

function runSummary(run: CardioLog): string {
  const mi = cardioDistanceMi(run);
  const pace = cardioPaceMin(run);
  const parts: string[] = [];
  if (mi) parts.push(`${mi.toFixed(2)} mi`);
  if (pace) parts.push(`${fmtPace(pace)}/mi`);
  if (!parts.length) parts.push(`${Math.round(run.durationMin)} min`);
  return parts.join(" @ ");
}

/* ---------- full plan ---------- */

function FullPlan({
  today,
  currentWeek,
  status,
}: {
  today: string;
  currentWeek: PlanWeek | null;
  status: (d: string) => SessionStatus;
}) {
  const [openWeek, setOpenWeek] = useState<number | null>(currentWeek?.n ?? 1);
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="section-title mb-1">The block</h2>
      <p className="mb-3 text-sm text-muted">
        Mon lift A · Tue quality · Wed lift B · Thu tempo · Fri lift C · Sat long · Sun off. Warm up a mile, cool down a
        half.
      </p>
      <ul className="divide-y divide-line">
        {PLAN.map((w) => {
          const dates = w.sessions.map((s) => sessionDate(w, s));
          const done = dates.filter((d) => status(d).done).length;
          const runs = w.sessions.filter((s) => s.type !== "rest").length;
          const open = openWeek === w.n;
          const isCurrent = currentWeek?.n === w.n;
          const past = addDays(w.start, 6) < today;
          return (
            <li key={w.n}>
              <button
                onClick={() => setOpenWeek(open ? null : w.n)}
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
              >
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${isCurrent ? "text-indigo" : "text-ink"}`}>
                    Week {w.n} · {w.phase}
                  </p>
                  <p className="text-xs text-muted">
                    {shortDate(w.start)} – {shortDate(addDays(w.start, 6))} · ~{w.miles} mi · target {w.weightTarget} lb
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  {(past || isCurrent) && (
                    <span className={done === runs ? "text-teal" : ""}>
                      {done}/{runs}
                    </span>
                  )}
                  <Chevron open={open} />
                </div>
              </button>
              {open && (
                <div className="space-y-2 pb-3">
                  {w.note && <p className="text-sm text-muted">{w.note}</p>}
                  {w.sessions.map((s, i) => {
                    const d = dates[i];
                    const st = status(d);
                    return (
                      <div key={d} className="rounded-lg bg-bg px-3 py-2">
                        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                          <span className={st.done ? "text-teal" : "text-line"}>{st.done ? "✓" : "○"}</span>
                          <span className="w-8 text-xs text-muted">{s.day}</span>
                          <span>{s.title}</span>
                        </p>
                        <p className="ml-12 text-xs text-muted">
                          <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_COLOR[s.type]}`}>
                            {SESSION_LABEL[s.type]}
                          </span>
                          {s.targetPace && <>{s.targetPace}/mi · </>}
                          {s.detail}
                          {st.run && <span className="text-teal"> · {runSummary(st.run)}</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">
        Lifting: keep A/B/C through week 9. Weeks 10–12 cut lower-body sets to 2, nothing to failure, no heavy legs
        Friday before a Saturday time trial. Race week: light upper Monday, Wednesday off.
      </p>
    </section>
  );
}

/* ---------- pace bands ---------- */

function PaceBands() {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="section-title mb-1">Pace bands</h2>
      <p className="mb-3 text-sm text-muted">Recalibrate after the week 6 time trial. Treadmill mph = 60 ÷ pace.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted">
              <th className="pb-1.5 pr-3">Zone</th>
              <th className="pb-1.5 pr-3">Pace /mi</th>
              <th className="pb-1.5 pr-3">Treadmill</th>
              <th className="hidden pb-1.5 sm:table-cell">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {PACE_BANDS.map((b) => (
              <tr key={b.zone}>
                <td className="py-1.5 pr-3 font-semibold text-ink">{b.zone}</td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-ink">{b.pace}</td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-muted">{b.mph}</td>
                <td className="hidden py-1.5 text-muted sm:table-cell">{b.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- body comp ---------- */

function BodyComp({ today }: { today: string }) {
  const { data: weights } = useCollection<WeightLog>("weightLogs");
  const { data: food } = useCollection<FoodEntry>("foodEntries");
  const [open, setOpen] = useState(false);

  const sorted = useMemo(() => [...weights].sort((a, b) => a.date.localeCompare(b.date)), [weights]);
  const avg7 = useMemo(() => {
    const cutoff = addDays(today, -6);
    const recent = sorted.filter((w) => w.date >= cutoff);
    if (!recent.length) return null;
    return recent.reduce((s, w) => s + w.weightLbs, 0) / recent.length;
  }, [sorted, today]);
  const latest = sorted[sorted.length - 1];

  const target = weightTargetFor(today);
  const delta = avg7 !== null ? avg7 - target : null;
  const kcalToday = food.filter((f) => f.date === today).reduce((s, f) => s + (f.calories || 0), 0);
  const kcalTarget = calorieTargetFor(today);

  // Chart window: from two weeks before the block through race day, with the glide path drawn ahead.
  const chartStart = addDays(PLAN_START, -14);
  const logsInWindow = useMemo(() => sorted.filter((w) => w.date >= chartStart), [sorted, chartStart]);
  const glide = useMemo(() => {
    const pts: { date: string; lbs: number }[] = [];
    for (let d = PLAN_START; d <= RACE.date; d = addDays(d, 7)) pts.push({ date: d, lbs: weightTargetFor(d) });
    pts.push({ date: RACE.date, lbs: NUTRITION.goalLbs });
    return pts;
  }, []);

  return (
    <section className="card p-4 sm:p-5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="section-title">Fast and skinny</h2>
          <p className="text-xs text-muted">
            {NUTRITION.startLbs} → {NUTRITION.goalLbs} lb by race day · ~2 s/mi per pound
          </p>
        </div>
        <Chevron open={open} />
      </button>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="7-day avg"
          value={avg7 !== null ? `${avg7.toFixed(1)} lb` : "—"}
          sub={latest ? `last ${latest.weightLbs} on ${shortDate(latest.date)}` : "log weight on Today"}
        />
        <Stat
          label="Target today"
          value={`${target.toFixed(1)} lb`}
          sub={
            delta === null ? "" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} vs path`
          }
          tone={delta === null ? undefined : delta <= 0.5 ? "good" : "bad"}
        />
        <Stat
          label="Calories today"
          value={`${kcalToday.toLocaleString()}`}
          sub={`of ${kcalTarget.toLocaleString()} target`}
          tone={kcalToday === 0 ? undefined : kcalToday <= kcalTarget ? "good" : "bad"}
        />
        <Stat label="Protein floor" value={`${NUTRITION.proteinG} g`} sub="1 g per lb of goal weight" />
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <WeightChart logs={logsInWindow} target={glide} aspect={2} />
          <ul className="space-y-1 text-sm text-muted">
            <li>
              <b className="text-ink">{NUTRITION.kcalLiftDay.toLocaleString()} kcal</b> on lift-only days,{" "}
              <b className="text-ink">{NUTRITION.kcalRunDay.toLocaleString()}</b> on Tue/Thu/Sat run days. Race week eats
              at maintenance ({NUTRITION.kcalRaceWeek.toLocaleString()}).
            </li>
            <li>Protein first, then whatever fits. Alcohol is the easiest 500 kcal to cut on a training night.</li>
            <li>Judge the week on the 7-day average, not the daily number.</li>
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-lg font-bold ${tone === "good" ? "text-teal" : tone === "bad" ? "text-coral" : "text-ink"}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

/* ---------- history ---------- */

function History() {
  const rows: { label: string; value: string; note: string }[] = [
    { label: "5K", value: fmtSec(PR.fiveK), note: PR.fiveKSource },
    { label: "1 mile", value: fmtSec(PR.mile), note: "fall 2023 interval session" },
    { label: "2 mile", value: fmtSec(PR.twoMile), note: PR.bestStandalone },
    { label: "10K", value: fmtSec(PR.tenK), note: "Carlsbad Half, Jan 2023" },
    { label: "Half", value: fmtSec(PR.half), note: "Carlsbad, 7:08/mi" },
  ];
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="section-title mb-1">Where the goal comes from</h2>
      <p className="mb-3 text-sm text-muted">
        Strava best efforts, 408 runs since 2017. The 21:27 came mid-half-marathon at 7:08 average, so a fresh, lighter
        you at 5K distance has sub 21 in him. Best 5K race so far: {PR.bestRace5K}. Sep 8 2026 treadmill: 3.94 mi at
        7:36/mi.
      </p>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
            <span className="w-14 font-semibold text-ink">{r.label}</span>
            <span className="font-bold text-ink">{r.value}</span>
            <span className="flex-1 text-right text-xs text-muted">{r.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
