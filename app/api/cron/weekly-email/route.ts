import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { addDays, prettyDateLong, startOfMonth, startOfWeek, weekEndingSaturday } from "@/lib/dates";
import { mergeSessions, type LoggedSessionDoc } from "@/lib/lifts";
import { cardioDistanceMi, type CardioLog } from "@/lib/cardio";
import type { AboutProfile, DailyReview, FoodEntry, Goal, MoodLog, Task, TrackedProject, WakeupLog, WeightLog } from "@/lib/types";
import { buildEmailHtml, type WeeklyEmailData } from "./email";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP_BASE_URL = process.env.APP_BASE_URL || "https://thedailychase.com";

async function colData<T>(uid: string, name: string): Promise<T[]> {
  const snap = await adminDb().collection(`users/${uid}/${name}`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

// Current wall-clock in America/New_York so the email lands at 5am Eastern
// year-round. Vercel crons are UTC-only, so we fire at both 09:00 and 10:00 UTC
// Saturday and let exactly one pass this guard depending on EDT (UTC-4) vs EST
// (UTC-5). Mirrors daily-review/route.ts.
function easternNow(now = new Date()): { hour: number; dateStr: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    hour: Number(parts.hour) % 24,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

type AiResult = {
  intro: string;
  huggaTasks: string[];
  personalTasks: string[];
  reflectionHighlights: string[];
  aiQuestion: string;
};

export async function GET(req: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Manual runs use the same secret.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional ?to= override for test sends (still gated by CRON_SECRET above).
  const toOverride = new URL(req.url).searchParams.get("to");

  // DST guard: real cron runs only proceed when it's the 5am hour in Eastern.
  // Manual test sends (?to=...) bypass it so you can fire it any time.
  const et = easternNow();
  if (!toOverride && et.hour !== 5) {
    return NextResponse.json({ ok: true, skipped: true, easternHour: et.hour });
  }

  const list = await adminAuth().listUsers(1);
  const user = list.users[0];
  if (!user) return NextResponse.json({ error: "No user" }, { status: 404 });
  const uid = user.uid;

  // Anchor everything on the Eastern calendar date and the app's Monday-based week.
  const today = et.dateStr;
  const weekStart = startOfWeek(today); // Monday
  const weekEnding = weekEndingSaturday(today); // Saturday
  const month = startOfMonth(today);

  const [tasks, liftLogged, cardioLogs, weights, foods, goals, moods, dailyReviews, trackedProjects, wakeupLogs] =
    await Promise.all([
      colData<Task>(uid, "tasks"),
      colData<LoggedSessionDoc>(uid, "liftSessions"),
      colData<CardioLog>(uid, "cardio"),
      colData<WeightLog>(uid, "weightLogs"),
      colData<FoodEntry>(uid, "foodEntries"),
      colData<Goal>(uid, "goals"),
      colData<MoodLog>(uid, "moodLogs"),
      colData<DailyReview>(uid, "dailyReviews"),
      colData<TrackedProject>(uid, "trackedProjects"),
      colData<WakeupLog>(uid, "wakeupLogs"),
    ]);

  // --- Tasks ----------------------------------------------------------------
  const completedTaskDocs = tasks
    .filter((t) => t.completedAt && t.completedAt.slice(0, 10) >= weekStart)
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
  const completedTasks = completedTaskDocs.map((t) => t.title);
  // Explicit tags win; only the untagged go to Claude for classification.
  const preHugga = completedTaskDocs.filter((t) => t.category === "hugga").map((t) => t.title);
  const prePersonal = completedTaskDocs.filter((t) => t.category === "personal").map((t) => t.title);
  const toClassify = completedTaskDocs.filter((t) => !t.category).map((t) => t.title);

  // --- Lifts ----------------------------------------------------------------
  const weekLifts = mergeSessions(liftLogged).filter((s) => s.date >= weekStart);
  const liftVolume = weekLifts.reduce((s, x) => s + x.volume, 0);
  const liftPRs = weekLifts.reduce((s, x) => s + x.prCount, 0);

  // --- Cardio ---------------------------------------------------------------
  const weekCardio = cardioLogs.filter((c) => c.date >= weekStart);
  const cardioMin = Math.round(weekCardio.reduce((s, c) => s + (c.durationMin || 0), 0));
  const cardioMiles = weekCardio.reduce((s, c) => s + (cardioDistanceMi(c) || 0), 0);

  // --- 5am wake-ups ---------------------------------------------------------
  // Chase only targets 5am on weekdays, so both the weekly count and the streak
  // ignore Saturday/Sunday entirely (a missing weekend day never breaks a streak).
  const isWeekday = (dateStr: string) => {
    const dow = new Date(dateStr + "T00:00:00").getDay(); // 0=Sun … 6=Sat
    return dow >= 1 && dow <= 5;
  };
  const wakeupDates = new Set(wakeupLogs.map((w) => w.date));
  const weekWakeups = wakeupLogs.filter(
    (w) => w.date >= weekStart && w.date <= weekEnding && isWeekday(w.date),
  );
  const wakeups5am = weekWakeups.length; // out of 5 possible weekdays
  // Current weekday-only streak, walking back from the most recent weekday on or
  // before today and skipping weekends so they neither count nor break the run.
  let wakeupStreak = 0;
  let cursor = today;
  while (!isWeekday(cursor)) cursor = addDays(cursor, -1);
  while (wakeupDates.has(cursor)) {
    wakeupStreak++;
    cursor = addDays(cursor, -1);
    while (!isWeekday(cursor)) cursor = addDays(cursor, -1);
  }

  // --- Weight ---------------------------------------------------------------
  const weekWeights = weights.filter((w) => w.date >= weekStart).sort((a, b) => a.date.localeCompare(b.date));
  const weightDelta =
    weekWeights.length >= 2 ? weekWeights[weekWeights.length - 1].weightLbs - weekWeights[0].weightLbs : null;

  // --- Goals ----------------------------------------------------------------
  const weekGoals = goals.filter((g) => g.period === "week" && g.periodStart === weekStart);
  const monthGoals = goals.filter((g) => g.period === "month" && g.periodStart === month);
  const weekGoalsDone = weekGoals.filter((g) => g.done).length;
  const monthGoalsDone = monthGoals.filter((g) => g.done).length;

  // --- Projects -------------------------------------------------------------
  // Active projects in priority order, with current milestone progress and how
  // many of their tagged to-dos were completed this week (the "movement" signal).
  const projectRows = trackedProjects
    .filter((p) => p.status === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => {
      const ms = p.milestones ?? [];
      return {
        name: p.name,
        category: p.category,
        milestoneDone: ms.filter((m) => m.done).length,
        milestoneTotal: ms.length,
        todosThisWeek: completedTaskDocs.filter((t) => t.projectId === p.id).length,
      };
    });

  // --- Mood -----------------------------------------------------------------
  const weekMoods = moods.filter((m) => m.date >= weekStart);
  const mean = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
  const avgMood = mean(weekMoods.map((m) => m.mood));
  const avgEnergy = mean(weekMoods.map((m) => m.energy));

  // --- Daily reflections digest --------------------------------------------
  const weekDailies = dailyReviews.filter(
    (r) => r.status === "done" && r.date >= weekStart && r.date <= weekEnding,
  );
  const daysReflected = weekDailies.length;
  const productiveDays = weekDailies.filter((r) => r.productive === true).length;
  const scores = weekDailies.map((r) => r.productivityScore).filter((s): s is number => typeof s === "number");
  const avgScore = scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : null;
  // Per-day productivity series (Mon→Sat) for the chart.
  const dayScores: { label: string; score: number | null }[] = [];
  for (let i = 0; i < 6; i++) {
    const dateStr = addDays(weekStart, i);
    const label = new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
    const r = weekDailies.find((x) => x.date === dateStr);
    dayScores.push({ label, score: r?.productivityScore ?? null });
  }

  // Existing "About Chase" profile (if any) so the question + intro can build on it.
  const profileSnap = await adminDb().doc(`users/${uid}/aboutProfile/latest`).get();
  const profile = profileSnap.exists ? (profileSnap.data() as AboutProfile) : null;

  // --- One structured Claude call ------------------------------------------
  const facts = {
    weekEnding: prettyDateLong(weekEnding),
    completedTaskTitles: completedTasks,
    tasksToClassify: toClassify, // only these are untagged and need bucketing
    weekGoals: { done: weekGoalsDone, total: weekGoals.length, titles: weekGoals.map((g) => g.title) },
    monthGoals: { done: monthGoalsDone, total: monthGoals.length, titles: monthGoals.map((g) => g.title) },
    projects: projectRows.map((p) => ({
      name: p.name,
      area: p.category,
      milestones: `${p.milestoneDone}/${p.milestoneTotal}`,
      todosDoneThisWeek: p.todosThisWeek,
    })),
    mornings: {
      wakeups5amWeekday: wakeups5am,
      possibleWeekdays: 5,
      weekdayStreak: wakeupStreak,
      note: "5am goal is weekdays only (Mon–Fri); weekends don't count or break the streak",
    },
    lifts: { sessions: weekLifts.length, volumeLb: liftVolume, prs: liftPRs },
    cardio: { sessions: weekCardio.length, minutes: cardioMin, miles: Math.round(cardioMiles * 10) / 10 },
    weightChangeLb: weightDelta,
    mood: { avg: avgMood, energyAvg: avgEnergy, logged: weekMoods.length },
    dailyReflections: weekDailies
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: r.date,
        productive: r.productive,
        score: r.productivityScore,
        whatMadeIt: r.whatMadeIt || undefined,
        learned: r.learned || undefined,
        q: r.aiQuestion || undefined,
        a: r.aiAnswer || undefined,
      })),
    aboutChase: profile ? { summary: profile.summary, traits: profile.traits } : null,
  };

  const prompt = [
    "You write Chase's Saturday weekly review email and prep his written reflection. Use ONLY the real data below — never invent tasks, numbers, or events.",
    "Classify ONLY the titles in 'tasksToClassify' into 'Hugga' (his business / work / product / company tasks) vs 'Personal' (family, health, errands, trips, personal admin) — the rest are already tagged, so leave them out of huggaTasks/personalTasks. If genuinely ambiguous, prefer Personal. Return the titles verbatim.",
    "Write a SHORT intro (70–110 words): a warm, specific, honest recap in the voice of a sharp friend — open with the week's real highlight, name a concrete win or two, gently flag what slipped. If daily reflections exist, weave in a pattern you notice across them. No corporate tone, no markdown headers.",
    "If 'projects' is non-empty, you may note in the intro how a project moved this week (e.g. milestones progress or to-dos done toward it) — only when there's real movement; never invent it.",
    "From his daily reflections, surface 1–2 short highlight lines (a notable thing he wrote in whatMadeIt/learned/answers) — quote or tightly paraphrase. Empty array if there are none.",
    "Write ONE tailored weekly reflection follow-up question — specific, forward-looking, grounded in his real week or a known pattern from aboutChase. Not a yes/no, not a duplicate of generic prompts.",
    "",
    `DATA (week ending ${facts.weekEnding}):`,
    JSON.stringify(facts, null, 2),
    "",
    'Respond with ONLY valid JSON: {"intro": string, "huggaTasks": string[], "personalTasks": string[], "reflectionHighlights": string[], "aiQuestion": string}. No markdown, no prose outside the JSON.',
  ].join("\n");

  let ai: AiResult;
  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 900,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = textOf(msg).trim();
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Partial<AiResult>;
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    // Merge explicit tags with the model's classification of the untagged ones.
    const aiHugga = strArr(parsed.huggaTasks).filter((t) => toClassify.includes(t));
    const aiPersonal = strArr(parsed.personalTasks).filter((t) => toClassify.includes(t));
    // Safety net: any untagged title the model dropped falls back to Personal.
    const placed = new Set([...aiHugga, ...aiPersonal]);
    const missed = toClassify.filter((t) => !placed.has(t));
    ai = {
      intro: typeof parsed.intro === "string" ? parsed.intro : "",
      huggaTasks: [...preHugga, ...aiHugga],
      personalTasks: [...prePersonal, ...aiPersonal, ...missed],
      reflectionHighlights: strArr(parsed.reflectionHighlights).slice(0, 2),
      aiQuestion: typeof parsed.aiQuestion === "string" ? parsed.aiQuestion : "",
    };
  } catch (err) {
    console.error("Weekly recap generation failed:", err);
    ai = {
      intro:
        "Here's your week at a glance. The recap couldn't be generated this time, but your data is all below — take a few minutes to look it over and reflect.",
      huggaTasks: preHugga,
      personalTasks: [...prePersonal, ...toClassify],
      reflectionHighlights: [],
      aiQuestion: "Looking back, what's the one thing from this week you most want to carry into next week?",
    };
  }

  // --- Pre-create / refresh the weeklyReviews doc (preserve any saved answers) ---
  const ref = adminDb().doc(`users/${uid}/weeklyReviews/${weekEnding}`);
  const existing = await ref.get();
  const snapshot = {
    weekEnding,
    aiQuestion: ai.aiQuestion,
    tasksDoneCount: completedTasks.length,
    weekGoalsDone,
    weekGoalsTotal: weekGoals.length,
    monthGoalsDone,
    monthGoalsTotal: monthGoals.length,
    daysReflected,
    productiveDays,
  };
  if (existing.exists) {
    await ref.set(snapshot, { merge: true });
  } else {
    await ref.set({
      ...snapshot,
      weekHighlights: "",
      goalsReflection: "",
      trainingReflection: "",
      moodReflection: "",
      sarahAnnieAttention: "",
      annieNoticed: "",
      familyFriends: "",
      aiAnswer: "",
      status: "pending",
      loggedAt: null,
      createdAt: new Date().toISOString(),
    });
  }

  // --- Build + send ---------------------------------------------------------
  const data: WeeklyEmailData = {
    weekEnding: prettyDateLong(weekEnding),
    intro: ai.intro,
    huggaTasks: ai.huggaTasks,
    personalTasks: ai.personalTasks,
    weekGoals: weekGoals.map((g) => ({ title: g.title, done: g.done })),
    monthGoals: monthGoals.map((g) => ({ title: g.title, done: g.done })),
    weekGoalsDone,
    weekGoalsTotal: weekGoals.length,
    monthGoalsDone,
    monthGoalsTotal: monthGoals.length,
    projects: projectRows,
    lifts: weekLifts.length,
    liftVolume: liftVolume ? `${liftVolume.toLocaleString()} lb` : "no data",
    liftPRs,
    cardioSessions: weekCardio.length,
    cardioMinutes: cardioMin,
    cardioMiles: cardioMiles > 0 ? `${cardioMiles.toFixed(1)} mi` : "no data",
    wakeups5am,
    wakeupStreak,
    workouts: weekLifts.length + weekCardio.length,
    weightChange: weightDelta !== null ? `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} lb` : "no data",
    avgMood: avgMood !== null ? `${avgMood}` : "no data",
    avgEnergy: avgEnergy !== null ? `${avgEnergy}` : "no data",
    daysReflected,
    productiveDays,
    avgScore,
    dayScores,
    reflectionHighlights: ai.reflectionHighlights,
    aiQuestion: ai.aiQuestion,
    reviewUrl: `${APP_BASE_URL}/weekly-review?week=${weekEnding}`,
  };
  const html = buildEmailHtml(data);

  const recipient = toOverride || process.env.RECAP_EMAIL || "chasetbeach@gmail.com";
  const resend = new Resend(process.env.RESEND_API_KEY);

  let result;
  try {
    result = await resend.emails.send({
      from: process.env.RESEND_FROM || "The Daily Chase <onboarding@resend.dev>",
      to: recipient,
      subject: `Your week in review — ${prettyDateLong(weekEnding)}`,
      html,
    });
  } catch (err) {
    console.error("Resend send threw:", err);
    return NextResponse.json({ error: "Email send failed" }, { status: 500 });
  }

  // Resend's SDK does NOT throw on API errors — it returns { error }. Surface it.
  if (result.error) {
    console.error("Resend rejected send:", result.error);
    return NextResponse.json({ error: result.error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentTo: recipient, id: result.data?.id });
}
