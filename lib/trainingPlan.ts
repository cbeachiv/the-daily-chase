// Thanksgiving Day 5K training block — the program as data, following the
// workoutTemplates.ts pattern. Edit the weeks here to change the plan; per-day
// completion lives in Firestore (users/{uid}/trainingSessions, see lib/types.ts)
// and is also inferred from cardio logs on the same date.
//
// Built 2026-09-08 from the full Strava history (408 runs since 2017). Lifetime
// 5K best is 21:27, a split inside the Carlsbad Half Marathon (Jan 15 2023).

import { addDays, startOfWeek } from "@/lib/dates";

export const RACE = {
  name: "Thanksgiving Day Race — TDR 5K",
  city: "Cincinnati",
  date: "2026-11-26",
  startTime: "9:00 AM",
  distanceMi: 3.107,
  // Goal times in seconds.
  goals: { a: 21 * 60, b: 22 * 60, c: 23 * 60 },
} as const;

// Strava "Best Efforts" (profile page), pulled 2026-09-08.
export const PR = {
  fiveK: 21 * 60 + 27,
  fiveKSource: "miles 4–6 of the Carlsbad Half, Jan 15 2023",
  tenK: 43 * 60 + 26,
  half: 93 * 60 + 26,
  mile: 6 * 60 + 4,
  twoMile: 13 * 60 + 40,
  bestStandalone: "3.23 mi @ 6:55/mi, Aug 4 2021",
  bestRace5K: "Leucadia Turkey Trot 2023, 7:38/mi",
} as const;

export const PLAN_START = "2026-09-07"; // Monday of week 1

// Nutrition targets (calorie target + protein floor, per the plan).
export const NUTRITION = {
  kcalLiftDay: 2100,
  kcalRunDay: 2350,
  kcalRaceWeek: 2600,
  proteinG: 165, // 1 g per lb of goal weight
  startLbs: 175,
  goalLbs: 163,
  stretchLbs: 160,
} as const;

export interface PaceBand {
  zone: string;
  pace: string; // min/mi range as text
  mph: string; // treadmill equivalent
  note?: string;
}

export const PACE_BANDS: PaceBand[] = [
  { zone: "Easy / long", pace: "9:15–10:00", mph: "6.0–6.5", note: "Conversational. Most of your miles." },
  { zone: "Steady", pace: "8:30–8:45", mph: "6.9–7.1" },
  { zone: "Tempo / threshold", pace: "7:40–7:50 → 7:25–7:35", mph: "7.7–8.1", note: "Comfortably hard; tightens after the week 6 time trial." },
  { zone: "5K goal pace", pace: "6:45–6:55", mph: "8.7–8.9" },
  { zone: "VO2 reps (400/800/1000)", pace: "6:30–6:50", mph: "8.8–9.2", note: "Jog the recovery, don't stand." },
  { zone: "Strides", pace: "20 s fast, relaxed", mph: "9.5+", note: "Full recovery between." },
];

export type SessionType =
  | "test"
  | "intervals"
  | "tempo"
  | "easy"
  | "long"
  | "hills"
  | "timetrial"
  | "race"
  | "rest";

export const SESSION_LABEL: Record<SessionType, string> = {
  test: "Test",
  intervals: "Intervals",
  tempo: "Tempo",
  easy: "Easy",
  long: "Long run",
  hills: "Hills",
  timetrial: "Time trial",
  race: "Race",
  rest: "Rest",
};

export type RunDay = "Tue" | "Wed" | "Thu" | "Sat";

/** Last calendar day of a plan week (race week ends on race day). */
export function weekEnd(week: PlanWeek): string {
  const sunday = addDays(week.start, 6);
  return sunday > RACE.date ? RACE.date : sunday;
}

export interface PlanSession {
  day: RunDay;
  type: SessionType;
  title: string;
  detail: string;
  targetMi?: number;
  targetPace?: string;
}

export interface PlanWeek {
  n: number;
  start: string; // Monday, YYYY-MM-DD
  phase: string;
  note?: string;
  sessions: PlanSession[];
  miles: number; // rough weekly total
  weightTarget: number; // 7-day average target by end of week, lb
}

const WU = "1 mi easy warm-up, 0.5–1 mi cool-down.";

export const PLAN: PlanWeek[] = [
  {
    n: 1,
    start: "2026-09-07",
    phase: "Kickoff",
    note: "Ansley member-guest Wed–Sat. Anything is a win this week.",
    miles: 10,
    weightTarget: 175,
    sessions: [
      { day: "Tue", type: "test", title: "Treadmill test", detail: "3.94 mi in 29:58 (7:36/mi). Baseline set.", targetMi: 4, targetPace: "7:36" },
      { day: "Thu", type: "easy", title: "30 min easy + 4 strides", detail: "At Ansley. Conversational pace, then 4 × 20 s strides on flat ground.", targetMi: 3, targetPace: "9:15–10:00" },
      { day: "Sat", type: "easy", title: "35–40 min easy", detail: "Or Sunday if golf runs long. Easy means easy.", targetMi: 4, targetPace: "9:15–10:00" },
    ],
  },
  {
    n: 2,
    start: "2026-09-14",
    phase: "Base",
    miles: 12,
    weightTarget: 174,
    sessions: [
      { day: "Tue", type: "intervals", title: "6 × 400 m @ 1:42", detail: `Treadmill 8.8 mph or track. 400 m jog between. ${WU}`, targetMi: 4, targetPace: "6:50" },
      { day: "Thu", type: "easy", title: "3 mi easy + 6 strides", detail: "Strides after the run: 20 s fast and relaxed, walk back.", targetMi: 3, targetPace: "9:15–10:00" },
      { day: "Sat", type: "long", title: "5 mi easy", detail: "Miami Bluff / Dogwood Park loop. Keep it conversational the whole way.", targetMi: 5, targetPace: "9:15–10:00" },
    ],
  },
  {
    n: 3,
    start: "2026-09-21",
    phase: "Base",
    miles: 14,
    weightTarget: 173,
    sessions: [
      { day: "Tue", type: "intervals", title: "8 × 400 m @ 1:40", detail: `Treadmill 9.0 mph. 400 m jog between. ${WU}`, targetMi: 5, targetPace: "6:40" },
      { day: "Thu", type: "tempo", title: "Tempo 2 × 10 min @ 7:45", detail: `3 min jog between. Comfortably hard, not a race. ${WU}`, targetMi: 5, targetPace: "7:45" },
      { day: "Sat", type: "long", title: "5.5 mi easy", detail: "Same loop plus a little. No watch-staring.", targetMi: 5.5, targetPace: "9:15–10:00" },
    ],
  },
  {
    n: 4,
    start: "2026-09-28",
    phase: "Build",
    miles: 14,
    weightTarget: 172,
    sessions: [
      { day: "Tue", type: "intervals", title: "5 × 800 m @ 3:25", detail: `Treadmill 8.8 mph. 400 m jog between. ${WU}`, targetMi: 5, targetPace: "6:50" },
      { day: "Thu", type: "easy", title: "3 mi easy + 6 strides", detail: "Recovery day with a little turnover at the end.", targetMi: 3, targetPace: "9:15–10:00" },
      { day: "Sat", type: "long", title: "6 mi easy", detail: "Add the Spooky Hollow out-and-back.", targetMi: 6, targetPace: "9:15–10:00" },
    ],
  },
  {
    n: 5,
    start: "2026-10-05",
    phase: "Build",
    miles: 15,
    weightTarget: 170.5,
    sessions: [
      { day: "Tue", type: "hills", title: "8 × 60 s hill, hard", detail: `Pocahontas hill. Drive the knees, jog down for recovery. ${WU}`, targetMi: 4 },
      { day: "Thu", type: "tempo", title: "Tempo 20 min continuous @ 7:40", detail: `One steady block, no breaks. ${WU}`, targetMi: 5, targetPace: "7:40" },
      { day: "Sat", type: "long", title: "6.5 mi easy, last mile 8:00", detail: "Easy until the final mile, then pick it up to steady.", targetMi: 6.5, targetPace: "9:15–10:00" },
    ],
  },
  {
    n: 6,
    start: "2026-10-12",
    phase: "Build + test",
    note: "Time trial Saturday. Reset the pace bands off the result.",
    miles: 13,
    weightTarget: 169.5,
    sessions: [
      { day: "Tue", type: "intervals", title: "6 × 800 m @ 3:20", detail: `Treadmill 9.0 mph. 400 m jog between. ${WU}`, targetMi: 5, targetPace: "6:40" },
      { day: "Thu", type: "easy", title: "3 mi easy", detail: "Nothing fast. Legs fresh for Saturday.", targetMi: 3, targetPace: "9:15–10:00" },
      { day: "Sat", type: "timetrial", title: "5K time trial — target sub 22:30", detail: `Mariemont loop or treadmill. Even splits, then empty the tank in the last half mile. ${WU}`, targetMi: 5, targetPace: "7:14" },
    ],
  },
  {
    n: 7,
    start: "2026-10-19",
    phase: "Sharpen",
    miles: 17,
    weightTarget: 168.5,
    sessions: [
      { day: "Tue", type: "intervals", title: "3 × 1 mi @ 6:50–6:55", detail: `Goal pace. 3 min jog between. ${WU}`, targetMi: 5, targetPace: "6:50–6:55" },
      { day: "Thu", type: "tempo", title: "Tempo 2 × 12 min @ 7:30", detail: `3 min jog between. ${WU}`, targetMi: 5, targetPace: "7:30" },
      { day: "Sat", type: "long", title: "7 mi easy", detail: "Peak long run of the block. Fuel it and enjoy it.", targetMi: 7, targetPace: "9:15–10:00" },
    ],
  },
  {
    n: 8,
    start: "2026-10-26",
    phase: "Sharpen",
    miles: 15,
    weightTarget: 167,
    sessions: [
      { day: "Tue", type: "intervals", title: "10 × 400 m @ 1:37", detail: `Treadmill 9.2 mph. 200 m jog between — short rest, keep it honest. ${WU}`, targetMi: 5, targetPace: "6:30" },
      { day: "Thu", type: "easy", title: "4 mi easy + 6 strides", detail: "Recovery plus turnover.", targetMi: 4, targetPace: "9:15–10:00" },
      { day: "Sat", type: "long", title: "6 mi, middle 2 @ tempo", detail: "2 easy, 2 at 7:30, 2 easy.", targetMi: 6, targetPace: "7:30 for the middle" },
    ],
  },
  {
    n: 9,
    start: "2026-11-02",
    phase: "Sharpen",
    miles: 17,
    weightTarget: 166,
    sessions: [
      { day: "Tue", type: "intervals", title: "4 × 1000 m @ 4:15", detail: `6:50 pace. 400 m jog between. ${WU}`, targetMi: 5, targetPace: "6:50" },
      { day: "Thu", type: "tempo", title: "Tempo 25 min @ 7:25", detail: `Longest tempo of the block. ${WU}`, targetMi: 5, targetPace: "7:25" },
      { day: "Sat", type: "long", title: "7 mi easy", detail: "Last big one.", targetMi: 7, targetPace: "9:15–10:00" },
    ],
  },
  {
    n: 10,
    start: "2026-11-09",
    phase: "Peak",
    note: "Lifts: lower-body sets down to 2, nothing to failure, no heavy legs Friday.",
    miles: 15,
    weightTarget: 165,
    sessions: [
      { day: "Tue", type: "intervals", title: "2 × (1600 @ 6:50 + 800 @ 6:35)", detail: `3 min jog after each rep. ${WU}`, targetMi: 5, targetPace: "6:50 / 6:35" },
      { day: "Thu", type: "easy", title: "4 mi easy", detail: "Fresh for Saturday.", targetMi: 4, targetPace: "9:15–10:00" },
      { day: "Sat", type: "timetrial", title: "Tune-up 5K, all out — target ~21:30", detail: `Race rehearsal: same breakfast, same warm-up, same shoes. ${WU}`, targetMi: 5, targetPace: "6:55" },
    ],
  },
  {
    n: 11,
    start: "2026-11-16",
    phase: "Taper",
    note: "Volume drops, intensity stays. Lifts light.",
    miles: 11,
    weightTarget: 164,
    sessions: [
      { day: "Tue", type: "intervals", title: "6 × 400 m @ 1:37, fresh", detail: `Full recovery between. Should feel snappy. ${WU}`, targetMi: 4, targetPace: "6:30" },
      { day: "Thu", type: "easy", title: "3 mi easy + 4 strides", detail: "", targetMi: 3, targetPace: "9:15–10:00" },
      { day: "Sat", type: "easy", title: "4 mi easy, last mile @ goal pace", detail: "One mile at 6:50 to remind the legs.", targetMi: 4, targetPace: "6:50 last mile" },
    ],
  },
  {
    n: 12,
    start: "2026-11-23",
    phase: "Race week",
    note: "Eat at maintenance. Mon light upper only, Wed off.",
    miles: 6,
    weightTarget: 163,
    sessions: [
      { day: "Tue", type: "easy", title: "2 mi easy + 4 × 200 m @ goal pace", detail: "Short and sharp.", targetMi: 2.5, targetPace: "6:50 for the 200s" },
      { day: "Wed", type: "rest", title: "Rest or 20 min walk", detail: "Lay out the kit. Bib, shoes, breakfast.", targetMi: 0 },
      { day: "Thu", type: "race", title: "RACE — 9:00 AM", detail: "Mile 1 at 6:50 (controlled, ignore the crowd). Mile 2 at 6:45. Mile 3 everything. Kick the last 0.1. Light breakfast 2.5 h before, caffeine 60 min before.", targetMi: 3.1, targetPace: "6:45" },
    ],
  },
];

const DAY_OFFSET: Record<RunDay, number> = { Tue: 1, Wed: 2, Thu: 3, Sat: 5 };

/** Calendar date (YYYY-MM-DD) of a session. */
export function sessionDate(week: PlanWeek, s: PlanSession): string {
  return addDays(week.start, DAY_OFFSET[s.day]);
}

/** Lift template key for a weekday (Mon/Wed/Fri = A/B/C), null otherwise. */
export function liftFor(date: string): { key: "a" | "b" | "c"; name: string } | null {
  const dow = new Date(date + "T00:00:00").getDay();
  if (dow === 1) return { key: "a", name: "Workout A" };
  if (dow === 3) return { key: "b", name: "Workout B" };
  if (dow === 5) return { key: "c", name: "Workout C" };
  return null;
}

/** The plan week containing `date`, or null outside the block. */
export function weekFor(date: string): PlanWeek | null {
  const monday = startOfWeek(date);
  return PLAN.find((w) => w.start === monday) ?? null;
}

export interface DatedSession {
  week: PlanWeek;
  session: PlanSession;
  date: string;
}

/** Every session with its calendar date, in order. */
export function allSessions(): DatedSession[] {
  const out: DatedSession[] = [];
  for (const week of PLAN) {
    for (const session of week.sessions) out.push({ week, session, date: sessionDate(week, session) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Today's session if there is one, else the next one on the calendar. */
export function nextSession(today: string): DatedSession | null {
  return allSessions().find((s) => s.date >= today) ?? null;
}

/** Whole days until race day (negative after). */
export function daysToRace(today: string): number {
  const a = new Date(today + "T00:00:00").getTime();
  const b = new Date(RACE.date + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Glide-path weight target for a date, interpolated between weekly end-of-week targets. */
export function weightTargetFor(date: string): number {
  const first = PLAN[0];
  const last = PLAN[PLAN.length - 1];
  if (date <= first.start) return NUTRITION.startLbs;
  if (date >= RACE.date) return last.weightTarget;
  // Targets are "by end of week" (Sunday). Interpolate from the previous week's target.
  let prevDate = first.start;
  let prevLbs: number = NUTRITION.startLbs;
  for (const w of PLAN) {
    const end = w.n === last.n ? RACE.date : addDays(w.start, 6);
    if (date <= end) {
      const span = daysBetween(prevDate, end) || 1;
      const t = daysBetween(prevDate, date) / span;
      return Math.round((prevLbs + (w.weightTarget - prevLbs) * t) * 10) / 10;
    }
    prevDate = end;
    prevLbs = w.weightTarget;
  }
  return last.weightTarget;
}

/** Daily calorie target: more on run days, maintenance in race week. */
export function calorieTargetFor(date: string): number {
  const week = weekFor(date);
  if (week && week.n === PLAN.length) return NUTRITION.kcalRaceWeek;
  const dow = new Date(date + "T00:00:00").getDay();
  const runDay = dow === 2 || dow === 4 || dow === 6;
  return runDay ? NUTRITION.kcalRunDay : NUTRITION.kcalLiftDay;
}

/** Whole days from a to b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86_400_000
  );
}

/** Seconds → "21:27" or "1:33:26". */
export function fmtSec(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** Pace (min/mi as text) for a 5K time in seconds. */
export function paceFor5K(sec: number): string {
  return fmtSec(Math.floor(sec / RACE.distanceMi));
}
