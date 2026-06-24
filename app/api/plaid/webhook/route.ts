import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { syncByItemId } from "@/lib/plaidSync";

export const runtime = "nodejs";
export const maxDuration = 120;

// Plaid webhook receiver. Transactions updates trigger a sync; item errors flag
// the item for re-auth. We only ever act on item_ids that already exist in our
// store, so unsolicited posts can't create or mutate arbitrary data.
//
// NOTE (production hardening): verify the Plaid-Verification JWT header against
// /webhook_verification_key/get before trusting the body. Fine to skip in Sandbox.
export async function POST(req: Request) {
  let body: { webhook_type?: string; webhook_code?: string; item_id?: string; error?: { error_code?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const { webhook_type, webhook_code, item_id } = body;
  if (!item_id) return NextResponse.json({ ok: true });

  // Ignore webhooks for items we don't know about.
  const ref = adminDb().doc(`plaidItems/${item_id}`);
  if (!(await ref.get()).exists) return NextResponse.json({ ok: true });

  try {
    if (webhook_type === "TRANSACTIONS") {
      // SYNC_UPDATES_AVAILABLE / INITIAL_UPDATE / HISTORICAL_UPDATE / DEFAULT_UPDATE
      await syncByItemId(item_id);
    } else if (webhook_type === "ITEM" && webhook_code === "ERROR") {
      const code = body.error?.error_code;
      if (code === "ITEM_LOGIN_REQUIRED") {
        await ref.set({ status: "login_required", error: code }, { merge: true });
      }
    }
  } catch (err) {
    console.error("Webhook handling failed:", err);
  }
  return NextResponse.json({ ok: true });
}
