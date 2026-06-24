import { NextResponse } from "next/server";
import { CountryCode } from "plaid";
import { adminDb } from "@/lib/firebase/admin";
import { verifyUser } from "@/lib/verifyUser";
import { plaidClient } from "@/lib/plaid";
import { syncByItemId } from "@/lib/plaidSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Exchange the public_token from Plaid Link for a long-lived access_token, store
// it server-side (top-level, client-denied `plaidItems`), capture account +
// institution metadata, then kick off the first transaction sync.
export async function POST(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let publicToken: string | undefined;
  try {
    publicToken = (await req.json())?.public_token;
  } catch {
    /* fall through */
  }
  if (!publicToken) return NextResponse.json({ error: "Missing public_token" }, { status: 400 });

  try {
    const client = plaidClient();
    const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    // Pull account + institution metadata for the UI.
    const accountsResp = await client.accountsGet({ access_token: accessToken });
    const accounts = accountsResp.data.accounts.map((a) => ({
      accountId: a.account_id,
      name: a.name,
      mask: a.mask ?? undefined,
      subtype: a.subtype ?? undefined,
    }));

    let institutionName = "Bank";
    const instId = accountsResp.data.item.institution_id;
    if (instId) {
      try {
        const inst = await client.institutionsGetById({
          institution_id: instId,
          country_codes: [CountryCode.Us],
        });
        institutionName = inst.data.institution.name;
      } catch {
        /* keep default name */
      }
    }

    await adminDb().doc(`plaidItems/${itemId}`).set({
      uid,
      accessToken,
      institutionId: instId ?? null,
      institutionName,
      accounts,
      cursor: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });

    // First sync (don't fail the request if transactions aren't ready yet).
    try {
      await syncByItemId(itemId);
    } catch (e) {
      console.error("Initial sync after exchange failed (will retry via webhook):", e);
    }

    return NextResponse.json({ ok: true, itemId, institutionName });
  } catch (err) {
    console.error("exchange failed:", err);
    return NextResponse.json({ error: "Could not link account" }, { status: 502 });
  }
}
