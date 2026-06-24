import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { adminDb } from "@/lib/firebase/admin";
import { verifyUser } from "@/lib/verifyUser";
import { plaidClient } from "@/lib/plaid";

export const runtime = "nodejs";

const APP_BASE_URL = process.env.APP_BASE_URL || "https://thedailychase.com";

// Creates a Link token. With no body → a normal "connect a new bank" token.
// With { itemId } → an update-mode token to re-authenticate an existing item.
export async function POST(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let itemId: string | undefined;
  try {
    itemId = (await req.json())?.itemId;
  } catch {
    /* no body — new connection */
  }

  try {
    const client = plaidClient();
    // OAuth banks (Chase, Capital One) require a registered redirect URI in
    // Production. Set PLAID_REDIRECT_URI to the page that hosts Plaid Link
    // (e.g. https://thedailychase.com/finance) and register it in the dashboard.
    const redirectUri = process.env.PLAID_REDIRECT_URI;
    const base = {
      user: { client_user_id: uid },
      client_name: "The Daily Chase",
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: `${APP_BASE_URL}/api/plaid/webhook`,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    };

    // Update mode: re-auth an existing item (no products allowed alongside access_token).
    if (itemId) {
      const snap = await adminDb().doc(`plaidItems/${itemId}`).get();
      if (!snap.exists || snap.data()?.uid !== uid) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      const resp = await client.linkTokenCreate({ ...base, access_token: snap.data()!.accessToken });
      return NextResponse.json({ link_token: resp.data.link_token });
    }

    const resp = await client.linkTokenCreate({ ...base, products: [Products.Transactions] });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (err) {
    console.error("link-token failed:", err);
    return NextResponse.json({ error: "Could not create link token" }, { status: 502 });
  }
}
