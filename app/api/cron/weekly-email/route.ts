import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { addDays, prettyDateLong, startOfMonth, startOfWeek, todayStr } from "@/lib/dates";
import { mergeSessions, type LoggedSessionDoc } from "@/lib/lifts";
import { cardioDistanceMi, fmtClock, CARDIO_KIND_LABEL, type CardioLog } from "@/lib/cardio";
import type { FoodEntry, Goal, MoodLog, Task, WeightLog } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

async function colData<T>(uid: string, name: string): Promise<T[]> {
  const snap = await adminDb().collection(`users/${uid}/${name}`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export async function GET(req: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Allow manual runs
  // with the same secret.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional ?to= override for test sends (still gated by CRON_SECRET above).
  const toOverride = new URL(req.url).searchParams.get("to");

  // Single-user app: take the first (only) Firebase Auth user.
  const list = await adminAuth().listUsers(1);
  const user = list.users[0];
  if (!user) return NextResponse.json({ error: "No user" }, { status: 404 });
  const uid = user.uid;

  const today = todayStr();
  const weekAgo = addDays(today, -7);

  const [tasks, liftLogged, cardioLogs, weights, foods, goals, moods] = await Promise.all([
    colData<Task>(uid, "tasks"),
    colData<LoggedSessionDoc>(uid, "liftSessions"),
    colData<CardioLog>(uid, "cardio"),
    colData<WeightLog>(uid, "weightLogs"),
    colData<FoodEntry>(uid, "foodEntries"),
    colData<Goal>(uid, "goals"),
    colData<MoodLog>(uid, "moodLogs"),
  ]);

  const completedTasks = tasks.filter((t) => t.completedAt && t.completedAt.slice(0, 10) >= weekAgo);
  const openTasks = tasks.filter((t) => !t.completedAt && t.dueDate <= today);

  // Lifts (logged in-app, merged with imported history so PRs are accurate).
  const weekLifts = mergeSessions(liftLogged).filter((s) => s.date >= weekAgo);
  const liftVolume = weekLifts.reduce((s, x) => s + x.volume, 0);
  const liftPRs = weekLifts.reduce((s, x) => s + x.prCount, 0);

  // Cardio (runs + other activities).
  const weekCardio = cardioLogs
    .filter((c) => c.date >= weekAgo)
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  const cardioMin = Math.round(weekCardio.reduce((s, c) => s + (c.durationMin || 0), 0));
  const cardioMiles = weekCardio.reduce((s, c) => s + (cardioDistanceMi(c) || 0), 0);
  const weekWeights = weights.filter((w) => w.date >= weekAgo).sort((a, b) => a.date.localeCompare(b.date));
  const weightDelta =
    weekWeights.length >= 2
      ? weekWeights[weekWeights.length - 1].weightLbs - weekWeights[0].weightLbs
      : null;
  const calDays = new Map<string, number>();
  foods.filter((f) => f.date >= weekAgo).forEach((f) => calDays.set(f.date, (calDays.get(f.date) ?? 0) + f.calories));
  const avgCalories =
    calDays.size > 0 ? Math.round([...calDays.values()].reduce((s, x) => s + x, 0) / calDays.size) : null;

  const weekGoals = goals.filter((g) => g.period === "week" && g.periodStart === startOfWeek(today));
  const monthGoals = goals.filter((g) => g.period === "month" && g.periodStart === startOfMonth(today));

  const weekMoods = moods.filter((m) => m.date >= weekAgo);
  const mean = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
  const avgMood = mean(weekMoods.map((m) => m.mood));
  const avgEnergy = mean(weekMoods.map((m) => m.energy));
  // A few representative notes/answers so the recap can speak to the "why".
  const moodNotes = weekMoods
    .map((m) => m.aiAnswer || m.notes)
    .filter((s): s is string => !!s && s.trim().length > 0)
    .slice(0, 6);

  const facts = {
    tasksCompleted: completedTasks.map((t) => t.title),
    tasksStillOpen: openTasks.map((t) => t.title),
    lifts: weekLifts.length,
    liftVolume: liftVolume ? `${liftVolume.toLocaleString()} lb` : "no data",
    liftPRs,
    liftWorkouts: weekLifts.map((s) => s.name),
    cardioSessions: weekCardio.length,
    cardioMinutes: cardioMin,
    cardioMiles: cardioMiles > 0 ? `${cardioMiles.toFixed(1)} mi` : "no data",
    cardioDetail: weekCardio.map((c) =>
      c.kind === "other"
        ? `${c.activity || "Activity"} — ${fmtClock(c.durationMin)}`
        : `${CARDIO_KIND_LABEL[c.kind]} — ${fmtClock(c.durationMin)}`,
    ),
    weightChange: weightDelta !== null ? `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} lb` : "no data",
    avgCalories: avgCalories ?? "no data",
    weeklyGoals: weekGoals.map((g) => `${g.done ? "[done]" : "[open]"} ${g.title}`),
    monthlyGoals: monthGoals.map((g) => `${g.done ? "[done]" : "[open]"} ${g.title}`),
    moodLogged: weekMoods.length,
    avgMood: avgMood !== null ? `${avgMood}/10` : "no data",
    avgEnergy: avgEnergy !== null ? `${avgEnergy}/10` : "no data",
    moodNotes,
  };

  const prompt = [
    "Write a warm, encouraging weekly recap email for Chase based on the data below.",
    "Tone: like a sharp, supportive friend — specific, honest, not corporate. 150–220 words.",
    "Open with a one-line highlight. Celebrate real wins, gently flag what slipped, and end with 1–2 concrete nudges for next week.",
    "If mood/energy data is present, comment on how he felt this week and note any pattern in the mood notes (what seemed to drive good or low days).",
    "Comment on his training: lifting (sessions, total volume, any PRs) and cardio (sessions, minutes, miles, activities) when present.",
    "Do not invent data. If a section says 'no data', skip it gracefully.",
    "Return plain text only (no markdown headers).",
    "",
    `DATA (week ending ${prettyDateLong(today)}):`,
    JSON.stringify(facts, null, 2),
  ].join("\n");

  let body: string;
  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    body = textOf(msg).trim();
  } catch (err) {
    console.error("Recap generation failed:", err);
    body = "Your weekly recap couldn't be generated this week, but your data is safe in the dashboard.";
  }

  const recipient = toOverride || process.env.RECAP_EMAIL || "chasetbeach@gmail.com";
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.6">
    <h2 style="font-weight:800">The Daily Chase — Weekly Recap</h2>
    <p style="color:#64748b;font-size:14px;margin-top:-8px">Week ending ${prettyDateLong(today)}</p>
    ${body
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `<p>${l}</p>`)
      .join("")}
    <hr style="border:none;border-top:1px solid #f0e6db;margin:24px 0"/>
    <table style="font-size:13px;color:#64748b">
      <tr><td>✅ Tasks done</td><td style="padding-left:16px">${facts.tasksCompleted.length}</td></tr>
      <tr><td>🏋️ Lifts</td><td style="padding-left:16px">${facts.lifts}${facts.lifts ? ` · ${facts.liftVolume}${facts.liftPRs ? ` · ${facts.liftPRs} PRs` : ""}` : ""}</td></tr>
      <tr><td>🏃 Cardio</td><td style="padding-left:16px">${facts.cardioSessions}${facts.cardioSessions ? ` · ${facts.cardioMinutes} min${facts.cardioMiles !== "no data" ? ` · ${facts.cardioMiles}` : ""}` : ""}</td></tr>
      <tr><td>⚖️ Weight change</td><td style="padding-left:16px">${facts.weightChange}</td></tr>
      <tr><td>🍽️ Avg calories/day</td><td style="padding-left:16px">${facts.avgCalories}</td></tr>
      <tr><td>🙂 Avg mood</td><td style="padding-left:16px">${facts.avgMood}</td></tr>
      <tr><td>⚡ Avg energy</td><td style="padding-left:16px">${facts.avgEnergy}</td></tr>
    </table>
  </div>`;

  let result;
  try {
    result = await resend.emails.send({
      from: process.env.RESEND_FROM || "The Daily Chase <onboarding@resend.dev>",
      to: recipient,
      subject: `Your week in review — ${prettyDateLong(today)}`,
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
