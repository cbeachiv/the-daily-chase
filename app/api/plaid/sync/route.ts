import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/verifyUser";
import { syncAllForUid } from "@/lib/plaidSync";

export const runtime = "nodejs";
export const maxDuration = 120;

// Manual "Sync now" — pulls latest transactions for all of the user's items.
export async function POST(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await syncAllForUid(uid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Plaid manual sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 502 });
  }
}
