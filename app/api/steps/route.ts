import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { addDays, easternToday } from "@/lib/dates";
import { MAX_STEPS_PER_DAY, STEP_LOGS, stepLogId } from "@/lib/steps";
import { DAILY_STEPS } from "@/lib/cutPlan";
import type { StepLog } from "@/lib/types";

export const runtime = "nodejs";

// Step-count ingestion for the iOS "Log Steps" Shortcut. The Shortcut reads
// today's Apple Health step total and POSTs { steps, date } here a few times a
// day; each post overwrites users/{uid}/stepLogs/s_{date}. Auth is a shared
// bearer token (STEPS_SECRET) because the phone has no Firebase session.
//
// Body: { steps: number | "8,432", date?: "YYYY-MM-DD", force?: boolean }
// Response: { ok, date, steps, target, toGo }  (toGo feeds the Shortcut's notification)

function authorized(req: Request): boolean | null {
  const secret = process.env.STEPS_SECRET;
  if (!secret) return null; // not configured: fail closed with a clear error
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer (.+)$/);
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function parseSteps(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.replace(/[,\s]/g, "")) // Shortcuts can hand over "8,432"
        : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > MAX_STEPS_PER_DAY) return null;
  return rounded;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export async function POST(req: Request) {
  const auth = authorized(req);
  if (auth === null) {
    return NextResponse.json({ error: "STEPS_SECRET not configured" }, { status: 500 });
  }
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { steps?: unknown; date?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const steps = parseSteps(body.steps);
  if (steps === null) {
    return NextResponse.json(
      { error: `steps must be a whole number between 0 and ${MAX_STEPS_PER_DAY}` },
      { status: 400 },
    );
  }

  // The phone sends its own local date; default to the Eastern calendar date
  // (Vercel runs in UTC). Allow one day ahead for clock skew, nothing further.
  const today = easternToday();
  const date = typeof body.date === "string" && body.date ? body.date : today;
  if (!validDate(date) || date > addDays(today, 1)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD and not in the future" }, { status: 400 });
  }
  const force = body.force === true;

  const list = await adminAuth().listUsers(1);
  const user = list.users[0];
  if (!user) return NextResponse.json({ error: "No account" }, { status: 404 });
  const uid = user.uid;

  const ref = adminDb().doc(`users/${uid}/${STEP_LOGS}/${stepLogId(date)}`);
  const existing = await ref.get();
  const prev = existing.exists ? (existing.data() as Omit<StepLog, "id">) : null;

  // Within a day the Health total only grows, so a later-but-smaller Shortcut
  // post is a sync glitch (Watch not synced, Health access denied returning 0).
  // Keep the higher number unless the caller explicitly forces a correction.
  const now = new Date().toISOString();
  const ignored = !force && prev?.source === "shortcut" && steps < prev.steps;
  if (!ignored) {
    await ref.set(
      {
        date,
        steps,
        source: "shortcut",
        updatedAt: now,
        ...(prev ? {} : { createdAt: now }),
      },
      { merge: true },
    );
  }

  const saved = ignored ? prev!.steps : steps;
  return NextResponse.json({
    ok: true,
    date,
    steps: saved,
    ...(ignored ? { ignored: true, kept: prev!.steps } : {}),
    target: DAILY_STEPS,
    toGo: Math.max(0, DAILY_STEPS - saved),
  });
}
