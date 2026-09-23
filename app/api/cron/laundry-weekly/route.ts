import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { addDays } from "@/lib/dates";
import { EVENTS_COLLECTION } from "@/lib/laundryServer";
import {
  buildLoads,
  clock,
  duration,
  etParts,
  slotLabel,
  weeklyStats,
  windowLabel,
  DAY_NAMES,
  type LaundryWeek,
  type RawLaundryEvent,
} from "@/lib/laundryStats";
import { buildEmailHtml } from "./email";

export const runtime = "nodejs";
export const maxDuration = 60;

// Sunday 9 AM Eastern "Laundry Report" to Chase + Sarah, built from the Shelly
// plug event log. Two UTC schedules in vercel.json cover EDT and EST; the hour
// gate below drops whichever one isn't 9 AM. `?to=` sends a test right away.

const SITE_URL = "https://www.3720centerstreet.com";
const DEFAULT_TO = "chasetbeach@gmail.com,sarahpbeach@gmail.com";

/** Sender on the domain already verified for the advisor email (resend.dev can't reach Sarah). */
function fromAddress(): string {
  if (process.env.LAUNDRY_FROM) return process.env.LAUNDRY_FROM;
  const advisor = process.env.ADVISOR_FROM ?? "";
  const addr = advisor.match(/<([^>]+)>/)?.[1] ?? advisor;
  const domain = addr.split("@")[1]?.trim();
  if (domain && domain !== "resend.dev") return `3720 Laundry <laundry@${domain}>`;
  return process.env.RESEND_FROM || "3720 Laundry <onboarding@resend.dev>";
}

function fallbackIntro(w: LaundryWeek): string {
  if (w.totalLoads === 0) return "A quiet week in the basement: not a single load. The machines are well rested and ready for you.";
  return `${w.totalLoads} load${w.totalLoads === 1 ? "" : "s"} this week and ${w.machineHours.toFixed(1)} hours of machines humming. Here's how the laundry room did.`;
}

async function writeIntro(w: LaundryWeek): Promise<string> {
  const facts = {
    washerLoads: w.washer.loads,
    washerAvg: w.washer.avgMs !== null ? duration(w.washer.avgMs) : null,
    dryerLoads: w.dryer.loads,
    dryerAvg: w.dryer.avgMs !== null ? duration(w.dryer.avgMs) : null,
    machineHours: Number(w.machineHours.toFixed(1)),
    busiestSlot: w.busiest ? slotLabel(w.busiest.dow, w.busiest.block) : null,
    quietestWindows: w.quietest.map(windowLabel),
    avgWetClothesWait: w.handoff.avgWaitMs !== null ? duration(w.handoff.avgWaitMs) : null,
    longestWetClothesWait: w.handoff.longest ? duration(w.handoff.longest.waitMs) : null,
    washerLoadsThatSkippedTheDryer: w.handoff.airDry,
    earliestStart: w.records.earlyBird
      ? `${DAY_NAMES[etParts(w.records.earlyBird.start).dow]} ${clock(w.records.earlyBird.start)}`
      : null,
    latestFinish: w.records.nightOwl ? `${DAY_NAMES[etParts(w.records.nightOwl.end).dow]} ${clock(w.records.nightOwl.end)}` : null,
    laundryFreeDays: w.laundryFreeDays,
    priorWeeklyAvgLoads:
      w.washer.priorAvg !== null && w.dryer.priorAvg !== null ? Number((w.washer.priorAvg + w.dryer.priorAvg).toFixed(1)) : null,
  };
  const prompt = [
    "You write the opening of 'The Laundry Report', a playful Sunday-morning email to Chase and Sarah about the shared washer and dryer in their building's basement at 3720 Center St.",
    "Write 2 to 3 short sentences: warm, witty, a little punny, grounded in ONE or TWO real numbers below. Never invent numbers or events. Loads may include neighbors, so don't claim who did them.",
    "Plain text only. No em dashes, no markdown, no greeting line, no sign-off.",
    "",
    JSON.stringify(facts, null, 2),
  ].join("\n");
  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = textOf(msg).trim().replace(/\s*—\s*/g, ", ");
    return text || fallbackIntro(w);
  } catch (err) {
    console.error("[laundry-weekly] intro failed, using fallback:", err);
    return fallbackIntro(w);
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const toOverride = new URL(req.url).searchParams.get("to");
  const now = etParts(Date.now());
  if (!toOverride && now.hour !== 9) {
    return NextResponse.json({ ok: true, skipped: true, easternHour: now.hour });
  }

  const db = adminDb();
  const since = Date.parse(addDays(now.date, -36) + "T00:00:00Z");
  const [snap, firstSnap] = await Promise.all([
    db.collection(EVENTS_COLLECTION).where("at", ">=", since).orderBy("at").get(),
    db.collection(EVENTS_COLLECTION).orderBy("at").limit(1).get(),
  ]);
  const events = snap.docs.map((d) => d.data() as RawLaundryEvent);
  const firstEventAt = firstSnap.empty ? null : (firstSnap.docs[0].data().at as number);

  const week = weeklyStats(buildLoads(events), now.date, firstEventAt);
  const intro = await writeIntro(week);

  const to = (toOverride || process.env.LAUNDRY_EMAIL_TO || DEFAULT_TO)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const subject = `The Laundry Report: ${week.totalLoads} load${week.totalLoads === 1 ? "" : "s"}${
    week.busiest ? `, busiest ${slotLabel(week.busiest.dow, week.busiest.block)}` : ""
  }`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  let result;
  try {
    result = await resend.emails.send({
      from: fromAddress(),
      to,
      subject,
      html: buildEmailHtml({ week, intro, siteUrl: SITE_URL }),
    });
  } catch (err) {
    console.error("[laundry-weekly] Resend send threw:", err);
    return NextResponse.json({ error: "Email send failed" }, { status: 500 });
  }
  if (result.error) {
    console.error("[laundry-weekly] Resend rejected send:", result.error);
    return NextResponse.json({ error: result.error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sentTo: to, subject, from: week.from, to_: week.to, id: result.data?.id });
}
