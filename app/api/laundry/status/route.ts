import { NextResponse } from "next/server";
import { deriveStatus, emptyDoc, DEFAULT_CONFIG } from "@/lib/laundry";
import { readLaundry } from "@/lib/laundryServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: polled by the laundry page. No auth — it only says whether two
// shared machines are busy.
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const { doc, config } = await readLaundry();
    return NextResponse.json(deriveStatus(doc, config, Date.now()), { headers });
  } catch (err) {
    console.error("[laundry] status read failed:", err);
    return NextResponse.json(deriveStatus(emptyDoc(), DEFAULT_CONFIG, Date.now()), {
      status: 503,
      headers,
    });
  }
}
