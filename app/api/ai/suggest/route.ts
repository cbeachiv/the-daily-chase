import { NextResponse } from "next/server";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { verifyUser } from "@/lib/verifyUser";

export const runtime = "nodejs";

interface Body {
  period: "week" | "month";
  aims?: string; // big-picture context the user types in
  existing?: string[]; // titles of goals already set this period
}

export async function POST(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const period = body.period === "month" ? "month" : "week";
  const horizon = period === "month" ? "this month" : "this week";

  const prompt = [
    `You are a thoughtful personal coach helping Chase plan concrete, achievable goals for ${horizon}.`,
    body.aims ? `His current focus / big-picture aims:\n${body.aims}` : "",
    body.existing?.length
      ? `Goals he has already set for ${horizon} (do not repeat these):\n- ${body.existing.join("\n- ")}`
      : "",
    `Propose 3–5 specific, outcome-oriented goals for ${horizon}. Each should be a single short line (max ~10 words), action-focused, and realistic.`,
    `Respond with ONLY a JSON array of strings, e.g. ["Ship the X feature", "Run 3 times"]. No prose, no markdown.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = textOf(msg).trim();
    const jsonStart = raw.indexOf("[");
    const jsonEnd = raw.lastIndexOf("]");
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as unknown;
    const suggestions = Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string").slice(0, 5)
      : [];
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("AI suggest failed:", err);
    return NextResponse.json({ error: "Could not generate suggestions" }, { status: 500 });
  }
}
