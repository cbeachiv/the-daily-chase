import { NextResponse } from "next/server";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { verifyUser } from "@/lib/verifyUser";
import type { MoodLog } from "@/lib/types";

export const runtime = "nodejs";

interface Body {
  logs?: MoodLog[]; // recent mood logs the client already has loaded
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

  const logs = (body.logs ?? []).filter((l) => l && typeof l.mood === "number");
  if (logs.length < 3) {
    return NextResponse.json(
      { error: "Not enough data yet — log a few more times first." },
      { status: 400 }
    );
  }

  // Compact each log to just the signal Claude needs, to keep the prompt lean.
  const compact = logs
    .slice()
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
    .map((l) => ({
      at: l.loggedAt,
      mood: l.mood,
      energy: l.energy,
      coffees: l.caffeineCups,
      drinks: l.alcoholDrinks,
      exercised: l.exercised,
      bedtime: l.bedtime,
      wakeTime: l.wakeTime,
      note: l.aiAnswer || l.notes || undefined,
    }));

  const prompt = [
    `You are analyzing Chase's mood/energy logs to find what drives how he feels.`,
    `Each entry has a timestamp, mood (1–10), energy (1–10), and context: coffees, alcoholic drinks, whether he exercised, bedtime/wake time (sleep), and an optional note.`,
    `Logs (JSON):\n${JSON.stringify(compact)}`,
    `Identify when his mood and energy peak and dip, and any correlations with sleep, caffeine, alcohol, exercise, and time of day. Be concrete and reference the data; don't invent patterns that aren't there.`,
    `Respond with ONLY valid JSON of the form {"summary": string, "patterns": string[]} — "summary" is one short paragraph (2–3 sentences), "patterns" is 2–4 short bullet strings. No markdown, no prose outside the JSON.`,
  ].join("\n\n");

  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = textOf(msg).trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
      summary?: unknown;
      patterns?: unknown;
    };
    const summary = typeof parsed.summary === "string" ? parsed.summary : "";
    const patterns = Array.isArray(parsed.patterns)
      ? parsed.patterns.filter((p): p is string => typeof p === "string").slice(0, 4)
      : [];
    return NextResponse.json({ summary, patterns });
  } catch (err) {
    console.error("AI mood-insights failed:", err);
    return NextResponse.json({ error: "Could not generate insights" }, { status: 500 });
  }
}
