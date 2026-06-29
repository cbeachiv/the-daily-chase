import { NextResponse } from "next/server";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { verifyUser } from "@/lib/verifyUser";

export const runtime = "nodejs";

interface Body {
  localTime: string; // e.g. "Mon 2:15 PM" — the user's real local time
  mood: number; // 1–10
  energy: number; // 1–10
  context?: string; // compact summary of today's already-logged factors
  history?: unknown[]; // recent past logs so Claude can learn patterns
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

  const hasHistory = Array.isArray(body.history) && body.history.length > 0;

  const prompt = [
    `Chase is logging how he feels right now. It's ${body.localTime}.`,
    `He rates his mood ${body.mood}/10 and energy ${body.energy}/10.`,
    body.context ? `Already noted today: ${body.context}` : "",
    hasHistory
      ? `Here are his recent past logs (newest first) — each with timestamp, mood, energy, coffees, drinks, exercised, dinnerPlan (whether he followed his dinner plan that day), bed/wake times, and any prior question (q) and his answer (a). STUDY these to learn his personal patterns and what tends to drive his mood/energy:\n${JSON.stringify(
          body.history
        )}`
      : "",
    `Ask ONE short, specific follow-up question that could help explain today's mood/energy, taking the time of day into account.`,
    hasHistory
      ? `Make it personalized: build on what you've learned from his history — reference or probe a pattern you notice (e.g. a recurring afternoon dip, a link between a factor and how he feels, or a follow-up to something he mentioned before). Don't just ask a generic question.`
      : "",
    `Do NOT ask about sleep, caffeine/coffee, alcohol, exercise, or whether he followed his dinner plan — those are already captured separately. Instead probe other likely causes or context (stress, workload, what he ate, social, weather, what he's working on, etc.).`,
    `Respond with ONLY the question text — one sentence, no preamble, no quotes.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 120,
      messages: [{ role: "user", content: prompt }],
    });
    const question = textOf(msg).trim().replace(/^["']|["']$/g, "");
    return NextResponse.json({ question });
  } catch (err) {
    console.error("AI mood-question failed:", err);
    return NextResponse.json({ error: "Could not generate question" }, { status: 500 });
  }
}
