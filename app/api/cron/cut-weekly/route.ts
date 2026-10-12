import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { easternToday } from "@/lib/dates";
import { CUT, DAILY_STEPS } from "@/lib/cutPlan";
import { buildCutWeek, recapWeekFor, type CutWeek } from "@/lib/cutWeekly";
import { TEMPLATES, type TemplateExercise } from "@/lib/workoutTemplates";
import type { LoggedSessionDoc } from "@/lib/lifts";
import type { CardioLog } from "@/lib/cardio";
import type { FoodEntry, MoodLog, StepLog, WaistLog, WeightLog } from "@/lib/types";
import { buildEmailHtml } from "./email";

export const runtime = "nodejs";
export const maxDuration = 60;

// Monday 7 AM Eastern "Cut Weekly" recap of the Mon-Sun that just ended, during
// the fall cut. Two UTC schedules in vercel.json cover EDT and EST; the hour
// gate drops whichever one isn't 7 AM. `?to=` sends a test right away and
// `?week=N` recaps a specific plan week. `?preview=1` returns the HTML
// without sending (still behind CRON_SECRET).

const APP_BASE_URL = process.env.APP_BASE_URL || "https://thedailychase.com";

async function colData<T>(uid: string, name: string): Promise<T[]> {
  const snap = await adminDb().collection(`users/${uid}/${name}`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

function easternHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(now)) % 24;
}

function fallbackIntro(w: CutWeek): string {
  const avg = w.row.avgWeight;
  if (w.status === "unknown")
    return `Week ${w.n} is in the books, but with only ${w.row.weighIns} weigh-in${w.row.weighIns === 1 ? "" : "s"} the scale trend is a guess. This week's focus: step on the scale every morning. Here's the rest.`;
  if (avg === null) return `Week ${w.n} is in the books. No weigh-ins logged, so the scale trend is a mystery this time. Here's the rest.`;
  const verdict = w.status === "ahead" ? "ahead of the glide path" : w.status === "on-track" ? "right on the glide path" : "a bit behind the glide path";
  return `Week ${w.n} done: your weekly average was ${avg.toFixed(1)} lb, ${verdict}. Here's how the numbers stacked up.`;
}

async function writeIntro(w: CutWeek): Promise<string> {
  const facts = {
    week: w.n,
    weeksTotal: CUT.weeks,
    status: w.status,
    weeklyAvgWeight: w.row.avgWeight,
    weighInsLogged: w.row.weighIns,
    proteinDaysLogged: w.days.filter((d) => d.protein !== null).length,
    calorieDaysLogged: w.caloriesDaysLogged,
    glidePathTarget: w.row.target,
    changeVsLastWeek: w.row.change,
    lostSinceStart: w.lostSoFar,
    projectedDec20: w.projectedEnd,
    goal: CUT.goalWeight,
    avgCalories: w.row.avgKcal,
    calorieGoal: w.kcalGoal,
    avgProtein: w.row.avgProtein,
    proteinGoal: CUT.proteinG,
    avgSteps: w.row.avgSteps,
    stepsGoal: DAILY_STEPS,
    liftsDone: w.liftsDone,
    liftsUpVsLastTime: w.liftLines.filter((l) => l.change === "up").length,
    liftsTotal: w.liftLines.length,
    allTimePRs: w.liftLines.filter((l) => l.pr).map((l) => `${l.name} ${l.best}`),
    readyToAddWeight: w.liftLines.filter((l) => l.goUp).map((l) => l.name),
    planFlag: w.row.flag,
    drinks: w.drinks,
    weekendVsWeekdayCalories: w.weekendKcal !== null && w.weekdayKcal !== null ? w.weekendKcal - w.weekdayKcal : null,
  };
  const prompt = [
    "You write the opening of 'The Cut Weekly', a Monday-morning email to Chase about last week of his 12-week fat-loss cut (goal: lose fat, get stronger, 175 to 163 lb by Dec 20).",
    "Write 2 to 3 short sentences like a good coach: direct, encouraging, honest. Lead with the most important thing (on track or not), name one real win, and give one specific focus for this week.",
    "Use only the numbers below and never invent any. Null means not logged. With fewer than 3 weigh-ins the weekly average is unreliable and status is 'unknown': don't call him ahead or behind, make consistent weigh-ins the focus. Treat averages from fewer than 4 logged days as partial. Weeks 1 and 2 are mostly water weight.",
    "Plain text only. No em dashes, no markdown, no greeting, no sign-off.",
    "",
    JSON.stringify(facts, null, 2),
  ].join("\n");
  try {
    const msg = await anthropic().messages.create({ model: CLAUDE_MODEL, max_tokens: 300, messages: [{ role: "user", content: prompt }] });
    const text = textOf(msg).trim().replace(/\s*—\s*/g, ", ");
    return text || fallbackIntro(w);
  } catch (err) {
    console.error("[cut-weekly] intro failed, using fallback:", err);
    return fallbackIntro(w);
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const toOverride = url.searchParams.get("to");
  const weekParam = Number(url.searchParams.get("week")) || null;
  const preview = url.searchParams.get("preview") === "1";
  if (!toOverride && !preview && easternHour() !== 7) {
    return NextResponse.json({ ok: true, skipped: true, easternHour: easternHour() });
  }

  const n = weekParam ?? recapWeekFor(easternToday());
  if (!n || n < 1 || n > CUT.weeks) return NextResponse.json({ ok: true, skipped: true, reason: "outside the cut" });

  const user = (await adminAuth().listUsers(1)).users[0];
  if (!user) return NextResponse.json({ error: "No user" }, { status: 404 });
  const uid = user.uid;

  const [weights, foods, lifts, cardio, waists, steps, moods, configSnap] = await Promise.all([
    colData<WeightLog>(uid, "weightLogs"),
    colData<FoodEntry>(uid, "foodEntries"),
    colData<LoggedSessionDoc>(uid, "liftSessions"),
    colData<CardioLog>(uid, "cardio"),
    colData<WaistLog>(uid, "waistLogs"),
    colData<StepLog>(uid, "stepLogs"),
    colData<MoodLog>(uid, "moodLogs"),
    adminDb().doc(`users/${uid}/workoutConfig/fall-2026`).get(),
  ]);
  const templates =
    (configSnap.data()?.templates as Record<string, TemplateExercise[]> | undefined) ??
    Object.fromEntries(TEMPLATES.map((t) => [t.key, t.exercises]));

  const week = buildCutWeek({ weights, foods, lifts, cardio, waists, steps, moods, templates }, n);
  const intro = await writeIntro(week);

  const avg = week.row.avgWeight;
  const statusWord = { ahead: "ahead of plan", "on-track": "on track", behind: "behind plan", unknown: "recap" }[week.status];
  const subject =
    week.status === "unknown"
      ? `Cut Week ${n}: recap (weigh in more this week)`
      : `Cut Week ${n}: ${avg !== null ? `${avg.toFixed(1)} lb avg, ` : ""}${statusWord}`;
  const html = buildEmailHtml({ week, intro, appUrl: APP_BASE_URL });
  if (preview) return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "x-subject": subject } });

  const recipient = toOverride || process.env.CUT_EMAIL_TO || process.env.RECAP_EMAIL || "chasetbeach@gmail.com";

  const resend = new Resend(process.env.RESEND_API_KEY);
  let result;
  try {
    result = await resend.emails.send({
      from: process.env.RESEND_FROM || "The Daily Chase <onboarding@resend.dev>",
      to: recipient.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      html,
    });
  } catch (err) {
    console.error("[cut-weekly] Resend send threw:", err);
    return NextResponse.json({ error: "Email send failed" }, { status: 500 });
  }
  if (result.error) {
    console.error("[cut-weekly] Resend rejected send:", result.error);
    return NextResponse.json({ error: result.error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sentTo: recipient, subject, week: n, id: result.data?.id });
}
