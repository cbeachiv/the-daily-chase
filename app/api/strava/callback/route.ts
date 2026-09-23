import { NextResponse } from "next/server";
import { completeStravaAuth, syncStrava } from "@/lib/stravaSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Strava redirects here after the user approves access.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const scope = url.searchParams.get("scope") ?? "";
  const back = (status: string) => NextResponse.redirect(new URL(`/today?strava=${status}`, url.origin));

  if (!code || !state || !scope.includes("activity:read")) return back("denied");
  try {
    const uid = await completeStravaAuth(code, state);
    await syncStrava(uid);
    return back("connected");
  } catch (err) {
    console.error("Strava callback failed:", err);
    return back("error");
  }
}
