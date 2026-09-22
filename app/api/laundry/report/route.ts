import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  applyReport,
  deriveStatus,
  isMachineId,
  machineLabel,
  normalizeDoc,
  type LaundryDoc,
  type PlugReport,
} from "@/lib/laundry";
import { EVENTS_COLLECTION, STATUS_PATH, readConfig } from "@/lib/laundryServer";
import { parseRecipients, sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the Shelly plug scripts (shelly/laundry-report.js) whenever a
// machine starts or stops, ~150 s after a stop, and every 5 min as a heartbeat.

function authorized(req: Request): boolean | "unconfigured" {
  const secret = process.env.LAUNDRY_SECRET;
  if (!secret) return "unconfigured";
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function parseReport(body: unknown): PlugReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!isMachineId(b.machine)) return null;
  if (typeof b.running !== "boolean") return null;
  const watts = typeof b.watts === "number" && Number.isFinite(b.watts) ? b.watts : null;
  if (watts === null) return null;
  const report: PlugReport = { machine: b.machine, running: b.running, watts: Math.round(watts * 10) / 10 };
  if (typeof b.output === "boolean") report.output = b.output;
  if (typeof b.source === "string") report.source = b.source.slice(0, 40);
  if (b.restored === true) report.restored = true;
  return report;
}

export async function POST(req: Request) {
  const auth = authorized(req);
  if (auth === "unconfigured") {
    return NextResponse.json({ error: "LAUNDRY_SECRET not set" }, { status: 500 });
  }
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let report: PlugReport | null = null;
  try {
    report = parseReport(await req.json());
  } catch {
    report = null;
  }
  if (!report) {
    return NextResponse.json(
      { error: "Expected { machine: 'washer'|'dryer', running: boolean, watts: number }" },
      { status: 400 }
    );
  }
  const { machine } = report;

  try {
    const db = adminDb();
    const ref = db.doc(STATUS_PATH);
    const config = await readConfig();
    const now = Date.now();

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const doc = normalizeDoc(snap.data());
      const { next, flipped, finished } = applyReport(doc[machine], report, config, now);
      tx.set(ref, { [machine]: next }, { merge: true });
      if (flipped) {
        tx.create(db.collection(EVENTS_COLLECTION).doc(), {
          machine,
          kind: report.running ? "start" : "stop",
          running: report.running,
          watts: report.watts,
          at: now,
        });
      }
      // Relay went off (or the plug's watchdog just restored it): keep a record
      // of the cause so "the dryer was dead" is diagnosable after the fact.
      if (report.output === false || report.restored) {
        tx.create(db.collection(EVENTS_COLLECTION).doc(), {
          machine,
          kind: report.restored ? "power_restored" : "power_off",
          source: report.source ?? null,
          watts: report.watts,
          at: now,
        });
        console.warn(`[laundry] ${machine} relay ${report.restored ? "restored" : "OFF"} (source=${report.source ?? "?"})`);
      }
      const merged: LaundryDoc = { ...doc, [machine]: next };
      return { doc: merged, finished };
    });

    if (result.finished) {
      const m = result.doc[machine];
      const mins =
        m.runStartedAt !== null && m.lastRunEndedAt !== null
          ? Math.max(1, Math.round((m.lastRunEndedAt - m.runStartedAt) / 60_000))
          : null;
      const text = `🧺 ${machineLabel(machine)} is done${mins ? ` (ran ${mins} min)` : ""}. www.3720centerstreet.com`;
      try {
        const { sent } = await sendSms(parseRecipients(process.env.LAUNDRY_SMS_TO), text);
        console.log(`[laundry] ${machine} done → ${sent} text(s) sent`);
      } catch (err) {
        // Release the claim so the next idle report retries the text.
        console.error("[laundry] SMS failed, will retry on next report:", err);
        await ref.set({ [machine]: { doneNotifiedAt: null } }, { merge: true });
      }
    }

    return NextResponse.json({ ok: true, status: deriveStatus(result.doc, config, now) });
  } catch (err) {
    console.error("[laundry] report failed:", err);
    return NextResponse.json({ error: "Report failed" }, { status: 502 });
  }
}
