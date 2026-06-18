import { NextResponse } from "next/server";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { verifyUser } from "@/lib/verifyUser";
import { adminDb } from "@/lib/firebase/admin";
import type { AboutProfile, DailyReview } from "@/lib/types";

export const runtime = "nodejs";

// How many recent reflections to feed the model when refining the profile.
const RECENT_LIMIT = 14;

export async function POST(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Read everything server-side from the user's own data — don't trust the client.
  const [profileSnap, reviewsSnap] = await Promise.all([
    adminDb().doc(`users/${uid}/aboutProfile/latest`).get(),
    adminDb().collection(`users/${uid}/dailyReviews`).get(),
  ]);

  const prior = profileSnap.exists ? (profileSnap.data() as AboutProfile) : null;

  const reviews = reviewsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as DailyReview)
    .filter((r) => r.status === "done")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_LIMIT);

  if (reviews.length === 0) {
    return NextResponse.json({ error: "No completed reflections yet." }, { status: 400 });
  }

  // Compact each reflection to just the signal the model needs.
  const compact = reviews
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: r.date,
      productive: r.productive,
      score: r.productivityScore,
      whatMadeIt: r.whatMadeIt || undefined,
      learned: r.learned || undefined,
      q: r.aiQuestion || undefined,
      a: r.aiAnswer || undefined,
      tasksDone: r.completedTaskTitles?.length ?? 0,
    }));

  const prompt = [
    "You maintain an evolving profile of Chase that helps an AID coach understand how he works — what makes him productive, what drains him, his motivators, blockers, and recurring lessons.",
    prior
      ? `Here is the CURRENT profile. Refine and extend it — keep what still holds true, update what's changed, fold in new evidence. Don't discard hard-won detail or overwrite it wholesale:\n${JSON.stringify(
          { summary: prior.summary, traits: prior.traits },
          null,
          2,
        )}`
      : "There is no profile yet — build the first one from the reflections below.",
    `Here are Chase's recent daily reflections (oldest first). Each has the date, whether he found the day productive, an optional 1–5 score, what made it productive or not, what he learned, and a tailored question (q) with his answer (a):\n${JSON.stringify(
      compact,
    )}`,
    "Look for patterns across days: conditions that correlate with productive vs unproductive days, what energizes vs drains him, how he talks about his work, and recurring lessons. Be concrete and grounded in what he actually wrote; do not invent traits that aren't supported.",
    'Respond with ONLY valid JSON of the form {"summary": string, "traits": string[]} — "summary" is a short evolving narrative (3–5 sentences) of who Chase is and how he works best; "traits" is 3–7 concise observation bullets. No markdown, no prose outside the JSON.',
  ].join("\n\n");

  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = textOf(msg).trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
      summary?: unknown;
      traits?: unknown;
    };
    const summary = typeof parsed.summary === "string" ? parsed.summary : prior?.summary ?? "";
    const traits = Array.isArray(parsed.traits)
      ? parsed.traits.filter((t): t is string => typeof t === "string").slice(0, 7)
      : prior?.traits ?? [];

    await adminDb()
      .doc(`users/${uid}/aboutProfile/latest`)
      .set(
        {
          summary,
          traits,
          updatedAt: new Date().toISOString(),
          reviewsSeen: reviews.length,
        },
        { merge: true },
      );

    return NextResponse.json({ summary, traits });
  } catch (err) {
    console.error("AI update-profile failed:", err);
    return NextResponse.json({ error: "Could not update profile" }, { status: 500 });
  }
}
