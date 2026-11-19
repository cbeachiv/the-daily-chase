import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/verifyUser";
import { getReport } from "@/lib/weather/report";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/weather[?refresh=1] → today's personal weather report (cached ~45 min).
export async function GET(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    const report = await getReport(uid, { refresh });
    return NextResponse.json(report);
  } catch (err) {
    console.error("weather report failed", err);
    return NextResponse.json({ error: "Couldn't load the forecast right now." }, { status: 502 });
  }
}
