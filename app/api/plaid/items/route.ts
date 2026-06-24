import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyUser } from "@/lib/verifyUser";
import { plaidClient } from "@/lib/plaid";
import type { PlaidItemView } from "@/lib/types";

export const runtime = "nodejs";

// GET — sanitized list of the user's connected items (never returns accessToken).
export async function GET(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminDb().collection("plaidItems").where("uid", "==", uid).get();
  const items: PlaidItemView[] = snap.docs.map((d) => {
    const v = d.data();
    return {
      itemId: d.id,
      institutionName: v.institutionName ?? "Bank",
      accounts: v.accounts ?? [],
      status: v.status ?? "active",
      lastSyncedAt: v.lastSyncedAt ?? undefined,
      error: v.error ?? undefined,
    };
  });
  return NextResponse.json({ items });
}

// DELETE ?itemId=... — unlink an item at Plaid and remove the stored token.
// Existing transactions are left in place (historical record).
export async function DELETE(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const itemId = new URL(req.url).searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

  const ref = adminDb().doc(`plaidItems/${itemId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.uid !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await plaidClient().itemRemove({ access_token: snap.data()!.accessToken });
  } catch (err) {
    console.error("itemRemove failed (deleting record anyway):", err);
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}
