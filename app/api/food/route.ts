import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { addDays, easternToday } from "@/lib/dates";
import { CUT, kcalTarget, weekIndex } from "@/lib/cutPlan";
import type { FoodEntry } from "@/lib/types";

export const runtime = "nodejs";

// Food logging from outside the app (Claude, a Shortcut, curl). Each POST adds
// one entry to users/{uid}/foodEntries, the same shape QuickLog writes, so it
// shows up on Today, /cut and /health. GET returns a day's entries and totals.
// Auth is a shared bearer token (FOOD_SECRET), like /api/steps.
//
// POST body: { calories: number, proteinG?: number, label?: string, date?: "YYYY-MM-DD" }
// GET query: ?date=YYYY-MM-DD (defaults to today, Eastern)
// Response:  { ok, date, entries, calories, proteinG, kcalTarget, proteinTarget, kcalLeft, proteinLeft }

const MAX_KCAL_PER_ENTRY = 5000;
const MAX_PROTEIN_PER_ENTRY = 400;
const MAX_LABEL = 200;

function authorized(req: Request): boolean | null {
  const secret = process.env.FOOD_SECRET;
  if (!secret) return null; // not configured: fail closed with a clear error
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer (.+)$/);
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function authError(auth: boolean | null) {
  if (auth === null) return NextResponse.json({ error: "FOOD_SECRET not configured" }, { status: 500 });
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

function parseNumber(raw: unknown, max: number): number | null {
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/[,\s]/g, "")) : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > max) return null;
  return rounded;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Default to the Eastern calendar date (Vercel runs in UTC). Allow one day
// ahead for clock skew, nothing further.
function resolveDate(raw: unknown): string | null {
  const today = easternToday();
  const date = typeof raw === "string" && raw ? raw : today;
  return validDate(date) && date <= addDays(today, 1) ? date : null;
}

async function ownerUid(): Promise<string | null> {
  const list = await adminAuth().listUsers(1);
  return list.users[0]?.uid ?? null;
}

async function daySummary(uid: string, date: string) {
  const snap = await adminDb().collection(`users/${uid}/foodEntries`).where("date", "==", date).get();
  const entries = snap.docs
    .map((d) => ({ ...(d.data() as Omit<FoodEntry, "id">), id: d.id }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const calories = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
  const proteinG = entries.reduce((s, e) => s + (e.proteinG ?? 0), 0);
  const kcal = kcalTarget(weekIndex(date));
  return {
    ok: true,
    date,
    entries,
    calories,
    proteinG,
    kcalTarget: kcal,
    proteinTarget: CUT.proteinG,
    kcalLeft: kcal - calories,
    proteinLeft: CUT.proteinG - proteinG,
  };
}

export async function GET(req: Request) {
  const denied = authError(authorized(req));
  if (denied) return denied;

  const date = resolveDate(new URL(req.url).searchParams.get("date"));
  if (!date) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD and not in the future" }, { status: 400 });
  }
  const uid = await ownerUid();
  if (!uid) return NextResponse.json({ error: "No account" }, { status: 404 });

  return NextResponse.json(await daySummary(uid, date));
}

export async function POST(req: Request) {
  const denied = authError(authorized(req));
  if (denied) return denied;

  let body: { calories?: unknown; proteinG?: unknown; label?: unknown; date?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const calories = parseNumber(body.calories, MAX_KCAL_PER_ENTRY);
  if (calories === null) {
    return NextResponse.json(
      { error: `calories must be a number between 0 and ${MAX_KCAL_PER_ENTRY}` },
      { status: 400 },
    );
  }
  let proteinG: number | undefined;
  if (body.proteinG !== undefined && body.proteinG !== null && body.proteinG !== "") {
    const p = parseNumber(body.proteinG, MAX_PROTEIN_PER_ENTRY);
    if (p === null) {
      return NextResponse.json(
        { error: `proteinG must be a number between 0 and ${MAX_PROTEIN_PER_ENTRY}` },
        { status: 400 },
      );
    }
    proteinG = p;
  }
  const label = typeof body.label === "string" ? body.label.trim().slice(0, MAX_LABEL) : "";

  const date = resolveDate(body.date);
  if (!date) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD and not in the future" }, { status: 400 });
  }

  const uid = await ownerUid();
  if (!uid) return NextResponse.json({ error: "No account" }, { status: 404 });

  const ref = adminDb().collection(`users/${uid}/foodEntries`).doc();
  await ref.set({
    date,
    calories,
    ...(proteinG !== undefined ? { proteinG } : {}),
    label,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ...(await daySummary(uid, date)), id: ref.id });
}
