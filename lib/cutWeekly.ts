// Numbers for the Monday "Cut Weekly" email: last Mon-Sun against the fall cut
// targets, whether the glide path is on track, lift progress, and a few
// extra data points. Pure TS over plain arrays so the cron route and a local
// preview script share it. Reuses weeklyRows so the email always agrees with
// the /cut page.

import { addDays, sleepHours } from "@/lib/dates";
import { mergeSessions, bestOf, type LoggedSessionDoc, type LiftSession } from "@/lib/lifts";
import type { CardioLog } from "@/lib/cardio";
import type { FoodEntry, MoodLog, StepLog, WaistLog, WeightLog } from "@/lib/types";
import type { TemplateExercise } from "@/lib/workoutTemplates";
import {
  CUT,
  CUT_END,
  DAILY_STEPS,
  blockFor,
  isLighterWeek,
  isMaintenanceWeek,
  kcalTarget,
  targetWeightFor,
  targetWeightOn,
  topOfRange,
  weekStart,
  weeklyRows,
  type WeekRow,
} from "@/lib/cutPlan";

export interface CutWeeklyInput {
  weights: WeightLog[];
  foods: FoodEntry[];
  lifts: LoggedSessionDoc[];
  cardio: CardioLog[];
  waists: WaistLog[];
  steps: StepLog[];
  moods: MoodLog[];
  templates: Record<string, TemplateExercise[]>; // workout key -> exercises (for "go up" calls)
}

export type Status = "ahead" | "on-track" | "behind" | "unknown";

export interface LiftLine {
  name: string;
  workout: string; // "Workout A"
  best: string; // "270 × 10"
  prev: string | null; // last time before this week
  change: "up" | "same" | "down" | "new";
  pr: boolean;
  goUp: boolean; // every set hit the top of the range: add weight next time
}

export interface DayLine {
  date: string;
  label: string; // "Mon"
  weight: number | null;
  kcal: number | null;
  protein: number | null;
  steps: number | null;
  lifted: string | null; // "Workout A"
  cardio: boolean;
}

export interface CutWeek {
  n: number; // plan week being recapped (1-12)
  start: string;
  end: string;
  row: WeekRow;
  prevRow: WeekRow | null;
  days: DayLine[];
  // targets
  kcalGoal: number;
  // scorecard
  caloriesDaysLogged: number;
  caloriesDaysOnTarget: number;
  proteinDaysHit: number;
  stepsDaysHit: number;
  stepsDaysLogged: number;
  liftsDone: number;
  cardioDone: number;
  // goal tracking
  status: Status;
  // What the week is graded on: the weekly average with 3+ weigh-ins,
  // otherwise the Sunday (or latest) weigh-in against that day's target.
  basis: "average" | "day" | null;
  basisWeight: number | null;
  basisTarget: number | null;
  basisLabel: string; // "weekly avg" | "Sun weigh-in"
  sundayWeight: number | null;
  vsTarget: number | null; // basis weight minus its glide-path target (negative = ahead)
  lostSoFar: number | null; // start weight minus the basis weight
  toGo: number | null;
  ratePerWeek: number | null; // average lb lost per week since the start
  projectedEnd: number | null; // at the current rate, weekly avg in week 12
  neededPerWeek: number | null; // to hit the goal from here
  weeksLeft: number;
  // lifts
  liftLines: LiftLine[];
  totalVolume: number;
  prevVolume: number | null;
  liftMinutes: number;
  // extras
  bestStepDay: DayLine | null;
  weekdayKcal: number | null;
  weekendKcal: number | null;
  lowWeight: DayLine | null;
  highWeight: DayLine | null;
  drinks: number | null; // total drinks Mon-Sun from mood logs (null if none logged)
  drinkDays: number;
  avgSleep: number | null;
  avgMood: number | null;
  // next week
  next: { n: number; block: string; lighter: boolean; maintenance: boolean; kcal: number; target: number } | null;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// With fewer weigh-ins than this the weekly average is noisy, so the week is
// graded on the Sunday (or latest) weigh-in instead. Fewer logged days than
// MIN_LOGGED_DAYS and calories/protein/steps show as ungraded.
export const MIN_WEIGH_INS = 3;
export const MIN_LOGGED_DAYS = 4;
const round1 = (x: number) => Math.round(x * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const setLabel = (w: number, r: number) => (w > 0 ? `${w} × ${r}` : `${r} reps`);
const score = (w: number, r: number) => (w > 0 ? w * (1 + r / 30) : r);

/** Recap plan week `n` (the Mon-Sun that just ended). */
export function buildCutWeek(input: CutWeeklyInput, n: number): CutWeek {
  const start = weekStart(n);
  const end = addDays(start, 6);
  const dayAfter = addDays(end, 1);
  const rows = weeklyRows(input.weights, input.foods, input.lifts, input.cardio, input.waists, input.steps, dayAfter);
  const row = rows[n - 1];
  const prevRow = n > 1 ? rows[n - 2] : null;
  const kcalGoal = kcalTarget(n);

  // --- per-day lines ---------------------------------------------------------
  const days: DayLine[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const foods = input.foods.filter((f) => f.date === date);
    const kcal = foods.reduce((s, f) => s + (f.calories || 0), 0);
    const hasProtein = foods.some((f) => typeof f.proteinG === "number");
    const lift = input.lifts.find((l) => l.date === date);
    days.push({
      date,
      label: DOW[new Date(date + "T00:00:00").getDay()],
      weight: input.weights.find((w) => w.date === date)?.weightLbs ?? null,
      kcal: kcal > 0 ? kcal : null,
      protein: hasProtein ? foods.reduce((s, f) => s + (f.proteinG ?? 0), 0) : null,
      steps: input.steps.find((s) => s.date === date)?.steps ?? null,
      lifted: lift ? lift.name : null,
      cardio: input.cardio.some((c) => c.date === date),
    });
  }

  const logged = days.filter((d) => d.kcal !== null);
  const stepDays = days.filter((d) => d.steps !== null);

  // --- goal tracking ----------------------------------------------------------
  const weighedDays = days.filter((d) => d.weight !== null);
  const latest = weighedDays[weighedDays.length - 1] ?? null; // Sunday when logged
  const sundayWeight = days[6].weight;
  let basis: CutWeek["basis"] = null;
  let avg: number | null = null; // the basis weight
  let basisTarget: number | null = null;
  let basisLabel = "weekly avg";
  if ((row?.weighIns ?? 0) >= MIN_WEIGH_INS && row?.avgWeight != null) {
    basis = "average";
    avg = row.avgWeight;
    basisTarget = targetWeightFor(n);
  } else if (latest) {
    basis = "day";
    avg = latest.weight;
    basisTarget = targetWeightOn(latest.date) ?? targetWeightFor(n);
    const fullDay: Record<string, string> = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };
    basisLabel = `${fullDay[latest.label]} weigh-in`;
  }
  const vsTarget = avg === null || basisTarget === null ? null : round1(avg - basisTarget);
  const status: Status = vsTarget === null ? "unknown" : vsTarget <= -0.5 ? "ahead" : vsTarget <= 0.5 ? "on-track" : "behind";
  const lostSoFar = avg === null ? null : round1(CUT.startWeight - avg);
  const ratePerWeek = lostSoFar === null ? null : round1(lostSoFar / n);
  const weeksLeft = CUT.weeks - n;
  // Weeks 1-2 are mostly water, so don't project a finish from them.
  const projectedEnd = avg === null || ratePerWeek === null || n < 3 ? null : round1(avg - ratePerWeek * weeksLeft);
  const toGo = avg === null ? null : round1(Math.max(0, avg - CUT.goalWeight));
  const neededPerWeek = toGo === null || weeksLeft <= 0 ? null : round1(toGo / weeksLeft);

  // --- lifts ------------------------------------------------------------------
  const sessions = mergeSessions(input.lifts); // newest first, includes Strong history
  const weekSessions = sessions.filter((s) => s.date >= start && s.date <= end).reverse();
  const before = sessions.filter((s) => s.date < start);
  const allTimeBest = new Map<string, number>();
  for (const s of before) for (const ex of s.exercises) {
    const sc = score(ex.best.weight, ex.best.reps);
    if (sc > (allTimeBest.get(ex.name) ?? -1)) allTimeBest.set(ex.name, sc);
  }
  const targetFor = (name: string): string | null => {
    for (const list of Object.values(input.templates)) {
      const t = list.find((e) => e.name === name);
      if (t) return t.targetReps;
    }
    return null;
  };
  const liftLines: LiftLine[] = [];
  for (const s of weekSessions) {
    for (const ex of s.exercises) {
      const prevEx = firstWith(before, ex.name);
      const sc = score(ex.best.weight, ex.best.reps);
      const prevSc = prevEx ? score(prevEx.best.weight, prevEx.best.reps) : null;
      const top = topOfRange(targetFor(ex.name) ?? "");
      const sets = ex.sets ?? [];
      liftLines.push({
        name: ex.name,
        workout: s.name,
        best: setLabel(ex.best.weight, ex.best.reps),
        prev: prevEx ? setLabel(prevEx.best.weight, prevEx.best.reps) : null,
        change: prevSc === null ? "new" : sc > prevSc + 0.5 ? "up" : sc < prevSc - 0.5 ? "down" : "same",
        pr: allTimeBest.has(ex.name) && sc > (allTimeBest.get(ex.name) ?? Infinity) + 1e-6,
        goUp: !ex.isBodyweight && top !== null && sets.length > 0 && sets.every((x) => x.reps >= top),
      });
      if (sc > (allTimeBest.get(ex.name) ?? -1)) allTimeBest.set(ex.name, sc);
    }
  }
  const totalVolume = weekSessions.reduce((s, x) => s + x.volume, 0);
  const prevStart = addDays(start, -7);
  const prevSessions = sessions.filter((s) => s.date >= prevStart && s.date < start);
  const prevVolume = prevSessions.length ? prevSessions.reduce((s, x) => s + x.volume, 0) : null;
  const liftMinutes = weekSessions.reduce((s, x) => s + (x.durationMin || 0), 0);

  // --- extras -----------------------------------------------------------------
  const bestStepDay = stepDays.reduce<DayLine | null>((b, d) => (!b || (d.steps ?? 0) > (b.steps ?? 0) ? d : b), null);
  const isWeekend = (d: DayLine) => d.label === "Sat" || d.label === "Sun";
  const weekdayKcal = mean(logged.filter((d) => !isWeekend(d)).map((d) => d.kcal!));
  const weekendKcal = mean(logged.filter(isWeekend).map((d) => d.kcal!));
  const weighed = days.filter((d) => d.weight !== null);
  const lowWeight = weighed.reduce<DayLine | null>((b, d) => (!b || d.weight! < b.weight! ? d : b), null);
  const highWeight = weighed.reduce<DayLine | null>((b, d) => (!b || d.weight! > b.weight! ? d : b), null);

  // Mood logs: "Drinks Yesterday" on a log dated D counts for D-1; sleep on a
  // log dated D is the night before D. Use each day's latest log.
  const latestByDate = new Map<string, MoodLog>();
  for (const m of input.moods) {
    const cur = latestByDate.get(m.date);
    if (!cur || m.loggedAt > cur.loggedAt) latestByDate.set(m.date, m);
  }
  let drinks: number | null = null;
  let drinkDays = 0;
  const sleeps: number[] = [];
  const moods: number[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const nextLog = latestByDate.get(addDays(date, 1));
    if (nextLog && typeof nextLog.alcoholDrinks === "number") {
      drinks = (drinks ?? 0) + nextLog.alcoholDrinks;
      if (nextLog.alcoholDrinks > 0) drinkDays++;
    }
    const log = latestByDate.get(date);
    if (log?.bedtime && log.wakeTime) {
      const h = sleepHours(log.bedtime, log.wakeTime);
      if (h !== null) sleeps.push(h);
    }
    if (log && typeof log.mood === "number") moods.push(log.mood);
  }

  const nn = n + 1;
  const next =
    nn <= CUT.weeks
      ? {
          n: nn,
          block: `Block ${blockFor(nn).n}: ${blockFor(nn).title}`,
          lighter: isLighterWeek(nn),
          maintenance: isMaintenanceWeek(nn),
          kcal: kcalTarget(nn),
          target: targetWeightFor(nn),
        }
      : null;

  return {
    n,
    start,
    end,
    row,
    prevRow,
    days,
    kcalGoal,
    caloriesDaysLogged: logged.length,
    caloriesDaysOnTarget: logged.filter((d) => d.kcal! <= kcalGoal + 50).length,
    proteinDaysHit: days.filter((d) => d.protein !== null && d.protein >= CUT.proteinG).length,
    stepsDaysHit: stepDays.filter((d) => d.steps! >= DAILY_STEPS).length,
    stepsDaysLogged: stepDays.length,
    liftsDone: row?.lifts ?? 0,
    cardioDone: row?.cardio ?? 0,
    status,
    basis,
    basisWeight: avg,
    basisTarget,
    basisLabel,
    sundayWeight,
    vsTarget,
    lostSoFar,
    toGo,
    ratePerWeek,
    projectedEnd,
    neededPerWeek,
    weeksLeft,
    liftLines,
    totalVolume,
    prevVolume,
    liftMinutes,
    bestStepDay,
    weekdayKcal: weekdayKcal === null ? null : Math.round(weekdayKcal),
    weekendKcal: weekendKcal === null ? null : Math.round(weekendKcal),
    lowWeight,
    highWeight,
    drinks,
    drinkDays,
    avgSleep: sleeps.length ? round1(mean(sleeps)!) : null,
    avgMood: moods.length ? round1(mean(moods)!) : null,
    next,
  };
}

function firstWith(sessionsDesc: LiftSession[], name: string) {
  for (const s of sessionsDesc) {
    const ex = s.exercises.find((e) => e.name === name);
    if (ex) return ex.sets?.length ? { ...ex, best: bestOf(ex.sets) } : ex;
  }
  return null;
}

/** The plan week to recap on a given Monday (the week that just ended), or null outside the cut. */
export function recapWeekFor(today: string): number | null {
  const lastSunday = addDays(today, -((new Date(today + "T00:00:00").getDay() + 7) % 7 || 7));
  if (lastSunday < addDays(CUT.start, 6) || lastSunday > CUT_END) return null;
  const n = Math.round((new Date(lastSunday + "T00:00:00").getTime() - new Date(CUT.start + "T00:00:00").getTime()) / (7 * 86400000)) + 1;
  return n >= 1 && n <= CUT.weeks ? n : null;
}
