import { NextResponse } from "next/server";
import { syncAllItems } from "@/lib/plaidSync";

export const runtime = "nodejs";
export const maxDuration = 300;

// Daily backstop in case a webhook is missed — re-syncs every connected item.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncAllItems();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Plaid cron sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 502 });
  }
}
