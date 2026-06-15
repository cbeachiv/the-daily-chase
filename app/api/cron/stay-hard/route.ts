import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { todayStr } from "@/lib/dates";
import { mergeSessions, type LoggedSessionDoc } from "@/lib/lifts";
import { cardioDistanceMi, fmtClock, CARDIO_KIND_LABEL, type CardioLog } from "@/lib/cardio";
import type { Workout, FoodEntry } from "@/lib/types";
import { buildEmailHtml, type StayHardData } from "./email";

export const runtime = "nodejs";
export const maxDuration = 60;

// --- The non-negotiables (edit freely) -------------------------------------
const GOALS = [
  "Work out EVERY day — no zero days.",
  "Progressive overload — beat last session's lift, even by one rep.",
  "Stick to the nutrition plan — especially dinner.",
];

// This week's locked dinner — update weekly.
const DINNER = "160g frozen mango, 160g frozen blueberry, 260g Fage, 4 graham crackers";

async function colData<T>(uid: string, name: string): Promise<T[]> {
  const snap = await adminDb().collection(`users/${uid}/${name}`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export async function GET(req: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Manual runs use the same secret.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional ?to= / ?cc= overrides for test sends (still gated by CRON_SECRET above).
  const params = new URL(req.url).searchParams;
  const toOverride = params.get("to");
  const ccOverride = params.get("cc");

  const list = await adminAuth().listUsers(1);
  const user = list.users[0];
  if (!user) return NextResponse.json({ error: "No user" }, { status: 404 });
  const uid = user.uid;

  // "Today so far" — the evening hasn't happened yet. At the 20:15 UTC fire time
  // the server date already equals the ET date, so no midnight-boundary issue.
  const today = todayStr();

  const [workouts, cardioLogs, liftLogged, foodEntries] = await Promise.all([
    colData<Workout>(uid, "workouts"),
    colData<CardioLog>(uid, "cardio"),
    colData<LoggedSessionDoc>(uid, "liftSessions"),
    colData<FoodEntry>(uid, "foodEntries"),
  ]);

  const workoutsToday = workouts.filter((w) => w.date === today);
  const cardioToday = cardioLogs.filter((c) => c.date === today);
  const liftsToday = mergeSessions(liftLogged).filter((s) => s.date === today);
  const foodToday = foodEntries.filter((f) => f.date === today);

  const trainedToday = workoutsToday.length + cardioToday.length + liftsToday.length > 0;
  const caloriesSoFar = foodToday.length ? foodToday.reduce((s, f) => s + (f.calories || 0), 0) : null;

  // Real numbers only — Claude is told never to invent any.
  const facts = {
    trainedToday,
    training: {
      lifts: liftsToday.map((s) => `${s.name}${s.prCount ? ` (${s.prCount} PR${s.prCount > 1 ? "s" : ""})` : ""}`),
      workouts: workoutsToday.map((w) => `${w.type}${w.durationMin ? ` ${w.durationMin}min` : ""}`),
      cardio: cardioToday.map((c) => {
        const label = c.kind === "other" ? c.activity || "Activity" : CARDIO_KIND_LABEL[c.kind];
        const mi = cardioDistanceMi(c);
        return `${label}${mi ? ` ${mi.toFixed(1)}mi` : ""} (${fmtClock(c.durationMin)})`;
      }),
    },
    nutrition: {
      caloriesLoggedSoFar: caloriesSoFar ?? "nothing logged yet",
      mealsLogged: foodToday.map((f) => f.label || `${f.calories} cal`),
      lockedDinner: DINNER,
    },
    goals: GOALS,
  };

  const system = [
    "You are David Goggins, writing a short, brutal 4:15pm gut-check email to Chase.",
    "It is 4:15pm. Chase is about to walk in the door HUNGRY — this is the exact moment he breaks and overeats at dinner. Catch him before he does.",
    "Voice: relentless, raw, profane-but-clean (no actual slurs/swears that would trip spam filters), zero comfort, zero excuses. Short, punchy sentences. Talk straight AT him.",
    "If he has trained today, give it ONE hard nod, then refuse to let him coast — finishing strong means not undoing it at the table.",
    "If he has NOT trained today, it is not over. The day is still his to win. Get it done before the night swallows it.",
    "Hammer the dinner: the meal is ALREADY DECIDED. The hunger is the test, not the trigger. Stick to the plan.",
    "Tie back to the three goals: work out every day, progressive overload, stick to nutrition.",
    "Do NOT invent any numbers, lifts, workouts, or meals. Use only what the data shows. If a section is empty, treat it as not-done-yet.",
    "90–140 words. Plain text. No markdown, no headers, no bullet lists. End on a line that lands like a punch.",
  ].join("\n");

  const userPrompt = [
    "Here is Chase's REAL data for today so far. Do not invent anything.",
    "",
    JSON.stringify(facts, null, 2),
  ].join("\n");

  let message: string;
  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    message = textOf(msg).trim();
  } catch (err) {
    console.error("Goggins message generation failed:", err);
    message = trainedToday
      ? "You trained today. Good. That's the floor, not the finish line. Now you walk in that door hungry and the real test starts. The dinner is already decided — you don't get a vote when you're weak. Eat the plan. Stay hard."
      : "It's 4:15. You haven't moved today. So what — the day isn't dead yet, and neither are you. Get the work in. Then walk in that door and eat the plan you already locked. The hunger is the test. Don't fold. Stay hard.";
  }

  const prettyDate = new Date(today + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const data: StayHardData = {
    prettyDate,
    message,
    trainedToday,
    caloriesSoFar,
    liftsLogged: liftsToday.length,
    dinner: DINNER,
    goals: GOALS,
  };
  const html = buildEmailHtml(data);

  const recipient = toOverride || process.env.GOGGINS_TO || process.env.RECAP_EMAIL || "chasetbeach@gmail.com";
  const cc = (ccOverride || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const resend = new Resend(process.env.RESEND_API_KEY);

  let result;
  try {
    result = await resend.emails.send({
      from: process.env.RESEND_FROM || "The Daily Chase <onboarding@resend.dev>",
      to: recipient,
      ...(cc.length ? { cc } : {}),
      subject: "4:15PM GUT CHECK — Stay Hard",
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
