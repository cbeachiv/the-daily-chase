import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/verifyUser";
import { refreshAndSyncForUid } from "@/lib/plaidSync";

export const runtime = "nodejs";
export const maxDuration = 120;

// Manual "Sync now" — force a fresh pull from each bank, then import the latest
// transactions for all of the user's items.
export async function POST(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await refreshAndSyncForUid(uid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Plaid manual sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 502 });
  }
}
