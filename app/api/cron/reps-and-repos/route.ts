import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { addDays, prettyDateLong, startOfWeek, todayStr } from "@/lib/dates";
import { mergeSessions, exerciseProgress, type LoggedSessionDoc } from "@/lib/lifts";
import { cardioDistanceMi, cardioPaceMin, fmtClock, fmtPace, CARDIO_KIND_LABEL, type CardioLog } from "@/lib/cardio";
import { additionsInRange, colorFor, displayName, listRepos } from "@/lib/github";
import type { CodeActivity } from "@/lib/types";
import { buildEmailHtml, type RenrData } from "./email";

export const runtime = "nodejs";
export const maxDuration = 60;

const MON_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortLabel = (date: string) => {
  const [, m, d] = date.split("-").map(Number);
  return `${MON_ABBR[m - 1]} ${d}`;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

async function colData<T>(uid: string, name: string): Promise<T[]> {
  const snap = await adminDb().collection(`users/${uid}/${name}`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/** Current week's Sunday-UTC start — used only for the codeActivity fallback. */
function currentWeekStartUTC(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

type RepoRow = { name: string; lines: number; color: string };

/** Exact Monday–Sunday repo additions, live from GitHub. Falls back to the
 *  latest synced (Sunday-bucketed) codeActivity week if the token/API is unavailable. */
async function repoRowsForWeek(weekStart: string, weekEnd: string, codeActivity: CodeActivity[]): Promise<RepoRow[]> {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    try {
      const repos = await listRepos(token);
      const sinceISO = `${weekStart}T00:00:00Z`;
      const untilISO = `${addDays(weekEnd, 1)}T00:00:00Z`; // exclusive (next Monday 00:00 UTC)
      const rows = await pool(repos, 5, async (r) => {
        const [owner, name] = r.full_name.split("/");
        const lines = await additionsInRange(owner, name, sinceISO, untilISO, token);
        return { name: displayName(name), lines, color: colorFor(name) };
      });
      return rows.filter((r) => r.lines > 0).sort((a, b) => b.lines - a.lines);
    } catch (err) {
      console.error("Live repo additions failed, falling back to codeActivity:", err);
    }
  }
  // Fallback: latest completed Sunday bucket from the last sync.
  const thisWeekStart = currentWeekStartUTC();
  const weeks = [...new Set(codeActivity.map((c) => c.weekStart))].sort();
  const completed = weeks.filter((w) => w < thisWeekStart);
  const bucket = completed.length ? completed[completed.length - 1] : thisWeekStart;
  const map = new Map<string, { lines: number; color: string }>();
  for (const c of codeActivity.filter((c) => c.weekStart === bucket)) {
    const cur = map.get(c.repoName) ?? { lines: 0, color: c.color };
    cur.lines += c.lines;
    map.set(c.repoName, cur);
  }
  return [...map.entries()].map(([name, v]) => ({ name, lines: v.lines, color: v.color })).sort((a, b) => b.lines - a.lines);
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

  // Monday–Sunday week containing today (cron fires Sunday evening → the current week).
  const today = todayStr();
  const weekStart = startOfWeek(today); // Monday
  const weekEnd = addDays(weekStart, 6); // Sunday
  const inWeek = (d: string) => d >= weekStart && d <= weekEnd;

  const [liftLogged, cardioLogs, codeActivity] = await Promise.all([
    colData<LoggedSessionDoc>(uid, "liftSessions"),
    colData<CardioLog>(uid, "cardio"),
    colData<CodeActivity>(uid, "codeActivity"),
  ]);

  // --- LIFTS: progressive overload, not volume -----------------------------
  const allSessions = mergeSessions(liftLogged); // newest-first, PRs computed across the timeline
  const weekLifts = allSessions.filter((s) => inWeek(s.date));
  const priorSessions = allSessions.filter((s) => s.date < weekStart);
  const liftVolume = weekLifts.reduce((s, x) => s + x.volume, 0);
  const liftPRs = weekLifts.reduce((s, x) => s + x.prCount, 0);

  // Best e1RM per exercise this week, and the best e1RM before this week.
  type Best = { e1rm: number; weight: number; reps: number; bodyweight: boolean };
  const thisBest = new Map<string, Best>();
  for (const s of weekLifts)
    for (const ex of s.exercises) {
      const cur = thisBest.get(ex.name);
      if (!cur || ex.best.e1rm > cur.e1rm)
        thisBest.set(ex.name, { e1rm: ex.best.e1rm, weight: ex.best.weight, reps: ex.best.reps, bodyweight: ex.isBodyweight });
    }
  // Week-over-week: compare to the MOST RECENT prior session of each lift, not the
  // all-time best (priorSessions is newest-first, so the first hit is the latest).
  const lastPrior = new Map<string, number>();
  for (const s of priorSessions)
    for (const ex of s.exercises) {
      if (!lastPrior.has(ex.name)) lastPrior.set(ex.name, ex.best.e1rm);
    }

  let improved = 0;
  const progress = [...thisBest.entries()]
    .map(([name, b]) => {
      const prior = lastPrior.get(name);
      const delta = prior !== undefined ? round1(b.e1rm - prior) : null;
      if (delta !== null && delta > 0) improved++;
      const set = b.bodyweight || b.weight === 0 ? `${b.reps} reps` : `${b.weight} lb × ${b.reps}`;
      return { name, set, e1rm: Math.round(b.e1rm), delta };
    })
    // Lead with the biggest week-over-week gains (new lifts count as progress); heaviest breaks ties.
    .sort((a, b) => (b.delta ?? 0.1) - (a.delta ?? 0.1) || b.e1rm - a.e1rm)
    .slice(0, 6);
  const tracked = thisBest.size;

  // Headline lift for the e1RM trend chart: the heaviest lift this week with ≥2 historical points.
  const byE1rm = [...thisBest.entries()].sort((a, b) => b[1].e1rm - a[1].e1rm);
  let trend: RenrData["lifts"]["trend"] = null;
  for (const [name] of byE1rm) {
    const pts = exerciseProgress(allSessions, name).slice(-10);
    if (pts.length >= 2) {
      trend = { label: name, points: pts.map((p) => ({ label: shortLabel(p.date), e1rm: Math.round(p.e1rm) })) };
      break;
    }
  }

  // --- CARDIO --------------------------------------------------------------
  const weekCardio = cardioLogs.filter((c) => inWeek(c.date)).sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  const cardioMin = Math.round(weekCardio.reduce((s, c) => s + (c.durationMin || 0), 0));
  const cardioMiles = weekCardio.reduce((s, c) => s + (cardioDistanceMi(c) || 0), 0);
  const runs = weekCardio.filter((c) => c.kind === "outdoor" || c.kind === "treadmill");
  const paceVals = runs.map(cardioPaceMin).filter((p): p is number => p != null && p > 0);
  const avgPace = paceVals.length ? fmtPace(paceVals.reduce((a, b) => a + b, 0) / paceVals.length) : null;
  const cardioRows = weekCardio.map((c) => ({
    label: c.kind === "other" ? c.activity || "Activity" : CARDIO_KIND_LABEL[c.kind],
    miles: cardioDistanceMi(c),
    min: c.durationMin || 0,
    clock: fmtClock(c.durationMin),
  }));

  // --- REPOS (exact Monday–Sunday, live from GitHub) -----------------------
  const repoRows = await repoRowsForWeek(weekStart, weekEnd, codeActivity);
  const totalLines = repoRows.reduce((s, r) => s + r.lines, 0);

  // --- FACTS for Tim (real numbers only) -----------------------------------
  const weekEnding = prettyDateLong(weekEnd);
  const facts = {
    weekWindow: `${prettyDateLong(weekStart)} – ${weekEnding} (Mon–Sun)`,
    lifting: {
      sessions: weekLifts.length,
      goal: "progressive overload — getting stronger week over week, NOT total volume",
      liftsImprovedVsPreviousBest: tracked ? `${improved} of ${tracked}` : "no data",
      newPRs: liftPRs,
      progression:
        progress.length > 0
          ? progress.map(
              (p) => `${p.name}: ${p.set} (e1RM ${p.e1rm})${p.delta === null ? " — first time" : p.delta > 0 ? ` ▲ +${p.delta} e1RM` : p.delta < 0 ? ` ▼ ${p.delta} e1RM` : " — matched"}`,
            )
          : ["no data"],
    },
    cardio: {
      sessions: weekCardio.length,
      runs: runs.length,
      minutes: cardioMin,
      miles: cardioMiles > 0 ? `${cardioMiles.toFixed(1)} mi` : "no data",
      avgPace: avgPace ? `${avgPace} /mi` : "no data",
      activities: cardioRows.map((r) => `${r.label}${r.miles ? ` — ${r.miles.toFixed(1)} mi` : ""} (${r.clock})`),
    },
    repos: {
      count: repoRows.length,
      totalLines,
      perRepo: repoRows.map((r) => `${r.name}: ${r.lines.toLocaleString()} lines`),
    },
  };

  // --- TIM's note ----------------------------------------------------------
  const system = [
    "You are Tim, the attendant at the Marathon gas station in Bowersville, Ohio.",
    "Bowersville is the little midpoint town between Columbus and Cincinnati.",
    "Back in April, two runners — Chase and his buddy Gino — met in Bowersville for a run.",
    "Afterward Chase walked into your Marathon, grabbed a coffee, and you waved him off — said it was on the house.",
    "Now you write Gino a short weekly note about how Chase has been grinding: lifting, running, and coding.",
    "Voice: folksy, warm, a little funny, plain-spoken Ohio gas-station guy. NOT wordy. NO corporate talk.",
    "On lifting, Chase's goal is PROGRESSIVE OVERLOAD — getting a little stronger each week. Praise lifts that BEAT a previous best and any new PRs. Do NOT harp on total pounds moved.",
    "You can mention the station, the coffee, the highway, the weather — keep it light. Write TO Gino ABOUT Chase.",
    "Keep it to 80–130 words, plain text, no markdown headers, no bullet lists (the email already shows the charts).",
  ].join("\n");

  const userPrompt = [
    "Here are Chase's REAL numbers for the week. Do not invent any numbers, lifts, or workouts.",
    "If a section says 'no data' or shows zeros, treat it as a rest week and say so in your own folksy way.",
    "Lead with his strength progress: how many lifts beat a previous best, plus any standout PR. Then a quick word on running and coding.",
    "Close with a line to Gino.",
    "",
    JSON.stringify(facts, null, 2),
  ].join("\n");

  let note: string;
  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    note = textOf(msg).trim();
  } catch (err) {
    console.error("Tim note generation failed:", err);
    note =
      "Tim here from the Marathon in Bowersville. Couldn't scribble the whole note this week, but Chase keeps inching the weight up — slow and steady. Coffee's still on the house, Gino.";
  }

  // --- BUILD + SEND --------------------------------------------------------
  const data: RenrData = {
    weekEnding,
    note,
    lifts: { sessions: weekLifts.length, improved, tracked, prs: liftPRs, volume: liftVolume, progress, trend },
    cardio: { sessions: weekCardio.length, runs: runs.length, minutes: cardioMin, miles: cardioMiles, avgPace, rows: cardioRows },
    repos: { count: repoRows.length, totalLines, rows: repoRows },
  };
  const html = buildEmailHtml(data);

  const recipient = toOverride || process.env.RENR_TO || process.env.RECAP_EMAIL || "chasetbeach@gmail.com";
  const cc = (ccOverride || process.env.RENR_CC || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const resend = new Resend(process.env.RESEND_API_KEY);

  let result;
  try {
    result = await resend.emails.send({
      // This email is voiced by "Tim" — use its own sender, independent of the
      // shared RESEND_FROM the other cron emails use.
      from: process.env.RENR_FROM || process.env.RESEND_FROM || "The Daily Chase <onboarding@resend.dev>",
      to: recipient,
      ...(cc.length ? { cc } : {}),
      subject: `Reps & Repositories — week ending ${weekEnding}`,
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
