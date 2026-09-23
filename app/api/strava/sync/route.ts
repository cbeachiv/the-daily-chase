import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { verifyUser } from "@/lib/verifyUser";
import { syncStrava } from "@/lib/stravaSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Called by the Today page on load (Firebase ID token).
export async function POST(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(uid);
}

// Daily cron backstop (CRON_SECRET), so emails see runs even if the site isn't opened.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = (await adminAuth().listUsers(1)).users[0];
  if (!user) return NextResponse.json({ error: "No user" }, { status: 404 });
  return run(user.uid);
}

async function run(uid: string) {
  try {
    return NextResponse.json(await syncStrava(uid));
  } catch (err) {
    console.error("Strava sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 502 });
  }
}
