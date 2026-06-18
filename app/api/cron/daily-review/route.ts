import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { startOfMonth, startOfWeek } from "@/lib/dates";
import type { AboutProfile, Goal, Task } from "@/lib/types";
import { buildEmailHtml, type ReviewEmailData } from "./email";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP_BASE_URL = process.env.APP_BASE_URL || "https://thedailychase.com";

async function colData<T>(uid: string, name: string): Promise<T[]> {
  const snap = await adminDb().collection(`users/${uid}/${name}`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

// Current wall-clock in America/New_York, so the email lands at 4:30pm Eastern
// year-round. Vercel crons are UTC-only, so we fire at both 20:30 and 21:30 UTC
// and let exactly one of them pass this guard depending on whether ET is on
// EDT (UTC-4) or EST (UTC-5).
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
    hour: Number(parts.hour) % 24, // "24" at midnight in some runtimes -> 0
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export async function GET(req: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Manual runs use the same secret.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional ?to= override for test sends (still gated by CRON_SECRET above).
  const toOverride = new URL(req.url).searchParams.get("to");

  // DST guard: real cron runs only proceed when it's the 4pm hour in Eastern.
  // Manual test sends (?to=...) bypass it so you can fire it any time.
  const et = easternNow();
  if (!toOverride && et.hour !== 16) {
    return NextResponse.json({ ok: true, skipped: true, easternHour: et.hour });
  }

  const list = await adminAuth().listUsers(1);
  const user = list.users[0];
  if (!user) return NextResponse.json({ error: "No user" }, { status: 404 });
  const uid = user.uid;

  // Use the Eastern calendar date so "today" is correct regardless of the UTC
  // fire time (20:30 on EDT, 21:30 on EST both map to the same ET day).
  const today = et.dateStr;
  const week = startOfWeek(today);
  const month = startOfMonth(today);

  const [tasks, goals] = await Promise.all([
    colData<Task>(uid, "tasks"),
    colData<Goal>(uid, "goals"),
  ]);

  const completedTasks = tasks
    .filter((t) => t.completedAt && t.completedAt.slice(0, 10) === today)
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""))
    .map((t) => t.title);

  const openTasks = tasks
    .filter((t) => !t.completedAt && t.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sortOrder - b.sortOrder)
    .map((t) => t.title);

  const weekGoals = goals.filter((g) => g.period === "week" && g.periodStart === week);
  const monthGoals = goals.filter((g) => g.period === "month" && g.periodStart === month);
  const weekGoalsDone = weekGoals.filter((g) => g.done).length;
  const monthGoalsDone = monthGoals.filter((g) => g.done).length;

  // Existing "About Chase" profile (if any) so the question can build on it.
  const profileSnap = await adminDb().doc(`users/${uid}/aboutProfile/latest`).get();
  const profile = profileSnap.exists ? (profileSnap.data() as AboutProfile) : null;

  // --- Generate ONE tailored reflection follow-up, grounded in today's data ---
  const facts = {
    completedTaskTitles: completedTasks,
    openTaskTitles: openTasks.slice(0, 10),
    weekGoals: { done: weekGoalsDone, total: weekGoals.length, titles: weekGoals.map((g) => g.title) },
    monthGoals: { done: monthGoalsDone, total: monthGoals.length, titles: monthGoals.map((g) => g.title) },
    aboutChase: profile ? { summary: profile.summary, traits: profile.traits } : null,
  };

  const prompt = [
    "Chase is about to reflect on his day. He'll always answer three fixed questions: was today productive, what made it productive or not, and what he learned.",
    "Your job: write ONE additional short, specific follow-up question — beyond those three — that helps him reflect more honestly or that probes something notable about today.",
    "Ground it in his REAL data below. Reference a specific task he finished, one he keeps leaving open, or his goal progress when it makes the question land. Do not invent anything not in the data.",
    profile
      ? "Use the 'aboutChase' profile to make it personal: build on a known pattern, motivator, or blocker of his — don't ask a generic question."
      : "",
    "Avoid duplicating the three fixed questions. Keep it forward-looking or insight-seeking, not a yes/no.",
    "",
    `Chase's REAL data for today (${today}):`,
    JSON.stringify(facts, null, 2),
    "",
    "Respond with ONLY the question text — one sentence, no preamble, no quotes.",
  ]
    .filter(Boolean)
    .join("\n");

  let aiQuestion = "";
  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 120,
      messages: [{ role: "user", content: prompt }],
    });
    aiQuestion = textOf(msg).trim().replace(/^["']|["']$/g, "");
  } catch (err) {
    console.error("Daily-review question generation failed:", err);
    aiQuestion = completedTasks.length
      ? "Which of the things you finished today actually moved you toward what matters most this week?"
      : "What's one small thing you could do tomorrow to make it feel like a win?";
  }

  // --- Pre-create the dailyReviews doc so /review shows the same question -----
  const ref = adminDb().doc(`users/${uid}/dailyReviews/${today}`);
  const existing = await ref.get();
  const meta = {
    date: today,
    aiQuestion,
    completedTaskTitles: completedTasks,
    weekGoalsDone,
    weekGoalsTotal: weekGoals.length,
    monthGoalsDone,
    monthGoalsTotal: monthGoals.length,
  };
  if (existing.exists) {
    // Refresh the snapshot + question but preserve any answers/status already saved.
    await ref.set(meta, { merge: true });
  } else {
    await ref.set({
      ...meta,
      productive: null,
      productivityScore: null,
      whatMadeIt: "",
      learned: "",
      aiAnswer: "",
      status: "pending",
      loggedAt: null,
      createdAt: new Date().toISOString(),
    });
  }

  // --- Build + send the email -------------------------------------------------
  const prettyDate = new Date(today + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const data: ReviewEmailData = {
    prettyDate,
    completedTasks,
    openTasks,
    weekGoalsDone,
    weekGoalsTotal: weekGoals.length,
    monthGoalsDone,
    monthGoalsTotal: monthGoals.length,
    aiQuestion,
    reviewUrl: `${APP_BASE_URL}/review?date=${today}`,
  };
  const html = buildEmailHtml(data);

  const recipient = toOverride || process.env.REVIEW_TO || process.env.RECAP_EMAIL || "chasetbeach@gmail.com";
  const resend = new Resend(process.env.RESEND_API_KEY);

  let result;
  try {
    result = await resend.emails.send({
      from: process.env.RESEND_FROM || "The Daily Chase <onboarding@resend.dev>",
      to: recipient,
      subject: "How did today go? — The Daily Review",
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
