import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/verifyUser";
import { stravaAuthorizeUrl } from "@/lib/stravaSync";

export const runtime = "nodejs";

// Returns the Strava authorize URL; the client then navigates there.
export async function POST(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = await stravaAuthorizeUrl(uid, new URL(req.url).origin);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Strava connect failed:", err);
    return NextResponse.json({ error: "Strava is not configured" }, { status: 500 });
  }
}
