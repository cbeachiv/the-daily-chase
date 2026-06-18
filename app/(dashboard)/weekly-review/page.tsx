"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCollection, setItem } from "@/lib/data";
import { auth } from "@/lib/firebase/client";
import type { DailyReview, WeeklyReview } from "@/lib/types";
import { prettyDate, prettyDateLong, startOfWeek, todayStr, weekEndingSaturday } from "@/lib/dates";

export default function WeeklyReviewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <WeeklyReviewForm />
    </Suspense>
  );
}

// The free-text prompts, in display order. Keyed to WeeklyReview fields.
const PROMPTS: { key: keyof WeeklyReview; label: string; placeholder: string }[] = [
  { key: "weekHighlights", label: "How did this week go?", placeholder: "The shape of the week — highs, lows, what stands out…" },
  { key: "goalsReflection", label: "How are you feeling about your goals — this week and this month?", placeholder: "On track? Drifting? What needs to change…" },
  { key: "trainingReflection", label: "Training — how do you think your lifts & cardio went?", placeholder: "Effort, consistency, how your body felt…" },
  { key: "moodReflection", label: "Mood & energy — how were you actually feeling?", placeholder: "Beyond the numbers — what drove the good and low days…" },
  { key: "sarahAnnieAttention", label: "Are you giving Sarah and Annie your full attention? Where did you fall short?", placeholder: "Be honest with yourself…" },
  { key: "annieNoticed", label: "Anything you noticed with Annie this week?", placeholder: "A new thing, a moment, something to remember…" },
  { key: "familyFriends", label: "Parents & friends — who do you want to reach out to?", placeholder: "Who's been on your mind…" },
];

function WeeklyReviewForm() {
  const params = useSearchParams();
  const weekEnding = params.get("week") || weekEndingSaturday(todayStr());
  const weekStart = startOfWeek(weekEnding);

  const { data: weeklies, uid } = useCollection<WeeklyReview>("weeklyReviews");
  const review = useMemo(() => weeklies.find((r) => r.id === weekEnding), [weeklies, weekEnding]);

  const { data: dailies } = useCollection<DailyReview>("dailyReviews");
  const weekDailies = useMemo(
    () =>
      dailies
        .filter((r) => r.date >= weekStart && r.date <= weekEnding && r.status === "done")
        .sort((a, b) => a.date.localeCompare(b.date)),
    [dailies, weekStart, weekEnding],
  );

  // Form state — one entry per free-text field, seeded once from the doc.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [aiAnswer, setAiAnswer] = useState("");
  const [seeded, setSeeded] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (seeded || !review) return;
    const next: Record<string, string> = {};
    for (const p of PROMPTS) next[p.key] = (review[p.key] as string) ?? "";
    setAnswers(next);
    setAiAnswer(review.aiAnswer ?? "");
    setSeeded(true);
  }, [review, seeded]);

  const aiQuestion = review?.aiQuestion ?? "";
  const alreadyDone = review?.status === "done";

  async function save() {
    if (!uid) return;
    setSaving(true);
    setError("");
    try {
      const fields: Record<string, unknown> = {
        weekEnding,
        aiQuestion,
        aiAnswer: aiAnswer.trim(),
        status: "done",
        loggedAt: new Date().toISOString(),
      };
      for (const p of PROMPTS) fields[p.key] = (answers[p.key] ?? "").trim();
      // If the cron never created the doc (e.g. reflecting early), stamp createdAt.
      if (!review) fields.createdAt = new Date().toISOString();
      await setItem(uid, "weeklyReviews", weekEnding, fields);
      setSaved(true);

      // Fire-and-forget: refine the evolving "About Chase" profile.
      try {
        const token = await auth.currentUser?.getIdToken();
        await fetch("/api/ai/update-profile", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
      } catch {
        // Non-fatal — the reflection is saved regardless.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Weekly Review</h1>
        <p className="text-sm text-muted">Week ending {prettyDateLong(weekEnding)}</p>
      </header>

      {/* Week at a glance */}
      <section className="card p-4 sm:p-5">
        <h2 className="section-title mb-3">This week at a glance</h2>
        {review ? (
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
            <span>
              To-dos done: <span className="font-semibold text-ink">{review.tasksDoneCount}</span>
            </span>
            <span>
              Week goals: <span className="font-semibold text-ink">{review.weekGoalsDone}/{review.weekGoalsTotal}</span>
            </span>
            <span>
              Month goals: <span className="font-semibold text-ink">{review.monthGoalsDone}/{review.monthGoalsTotal}</span>
            </span>
            <span>
              Days reflected: <span className="font-semibold text-ink">{review.daysReflected}/7</span> · {review.productiveDays} productive
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted">No snapshot yet for this week — it’s built when the Saturday email sends.</p>
        )}

        {/* This week's daily reflections, for context */}
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Your daily reflections
          </h3>
          {weekDailies.length > 0 ? (
            <ul className="space-y-2">
              {weekDailies.map((r) => {
                const line = r.whatMadeIt || r.learned || r.aiAnswer || "";
                return (
                  <li key={r.id} className="text-sm">
                    <span className="font-semibold text-ink">{prettyDate(r.date)}</span>
                    <span className={`ml-2 ${r.productive ? "text-teal" : "text-coral"}`}>
                      {r.productive ? "productive" : "off day"}
                    </span>
                    {typeof r.productivityScore === "number" && (
                      <span className="ml-1 text-muted">· {r.productivityScore}/5</span>
                    )}
                    {line && <p className="mt-0.5 line-clamp-2 text-muted">{line}</p>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">No daily reflections logged this week.</p>
          )}
        </div>
      </section>

      {/* Reflection form */}
      <section className="card space-y-5 p-4 sm:p-5">
        <h2 className="section-title">Reflect on your week</h2>

        {PROMPTS.map((p) => (
          <div key={p.key}>
            <label className="mb-2 block text-sm font-semibold">{p.label}</label>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder={p.placeholder}
              value={answers[p.key] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [p.key]: e.target.value }))}
            />
          </div>
        ))}

        {aiQuestion && (
          <div>
            <label className="mb-2 block text-sm font-semibold">
              <span className="mr-1.5 text-indigo">✦</span>
              {aiQuestion}
            </label>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder="Your answer…"
              value={aiAnswer}
              onChange={(e) => setAiAnswer(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-xs text-coral">{error}</p>}

        <div className="flex items-center gap-3">
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : alreadyDone || saved ? "Update reflection" : "Save reflection"}
          </button>
          {saved && (
            <span className="text-xs font-semibold text-teal">
              Saved ✓ — I’ll fold this into what I know about you.
            </span>
          )}
          <Link href="/today" className="ml-auto text-xs font-semibold text-indigo">
            Back to Today →
          </Link>
        </div>
      </section>
    </div>
  );
}
