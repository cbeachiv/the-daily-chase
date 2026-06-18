"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCollection, setItem } from "@/lib/data";
import { auth } from "@/lib/firebase/client";
import type { DailyReview } from "@/lib/types";
import { prettyDateLong, todayStr } from "@/lib/dates";

export default function ReviewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <ReviewForm />
    </Suspense>
  );
}

function ReviewForm() {
  const params = useSearchParams();
  const date = params.get("date") || todayStr();

  const { data: reviews, uid } = useCollection<DailyReview>("dailyReviews");
  const review = useMemo(() => reviews.find((r) => r.id === date), [reviews, date]);

  // Form state — seeded from the existing doc once it loads.
  const [productive, setProductive] = useState<boolean | null>(null);
  const [score, setScore] = useState<number | undefined>(undefined);
  const [whatMadeIt, setWhatMadeIt] = useState("");
  const [learned, setLearned] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [seeded, setSeeded] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Seed the form from the loaded doc exactly once (don't clobber edits in progress).
  useEffect(() => {
    if (seeded || !review) return;
    setProductive(review.productive ?? null);
    setScore(review.productivityScore);
    setWhatMadeIt(review.whatMadeIt ?? "");
    setLearned(review.learned ?? "");
    setAiAnswer(review.aiAnswer ?? "");
    setSeeded(true);
  }, [review, seeded]);

  const aiQuestion = review?.aiQuestion ?? "";
  const completed = review?.completedTaskTitles ?? [];
  const alreadyDone = review?.status === "done";

  async function save() {
    if (!uid) return;
    setSaving(true);
    setError("");
    try {
      const fields: Record<string, unknown> = {
        date,
        productive,
        productivityScore: score ?? null,
        whatMadeIt: whatMadeIt.trim(),
        learned: learned.trim(),
        aiQuestion,
        aiAnswer: aiAnswer.trim(),
        status: "done",
        loggedAt: new Date().toISOString(),
      };
      // If the cron never created the doc (e.g. reflecting before 4:30pm), stamp createdAt.
      if (!review) fields.createdAt = new Date().toISOString();
      await setItem(uid, "dailyReviews", date, fields);
      setSaved(true);

      // Fire-and-forget: refine the evolving "About Chase" profile from all reflections.
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

  const isToday = date === todayStr();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Daily Review</h1>
        <p className="text-sm text-muted">
          {isToday ? "Today · " : ""}
          {prettyDateLong(date)}
        </p>
      </header>

      {/* Day summary for context */}
      <section className="card p-4 sm:p-5">
        <h2 className="section-title mb-3">Today at a glance</h2>
        {completed.length > 0 ? (
          <ul className="space-y-1.5">
            {completed.map((t, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="text-teal">✓</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No to-dos marked done for this day.</p>
        )}
        {review && (
          <div className="mt-3 flex gap-4 border-t border-line pt-3 text-xs text-muted">
            <span>
              Week goals:{" "}
              <span className="font-semibold text-ink">
                {review.weekGoalsDone}/{review.weekGoalsTotal}
              </span>
            </span>
            <span>
              Month goals:{" "}
              <span className="font-semibold text-ink">
                {review.monthGoalsDone}/{review.monthGoalsTotal}
              </span>
            </span>
          </div>
        )}
      </section>

      {/* Reflection form */}
      <section className="card space-y-5 p-4 sm:p-5">
        <h2 className="section-title">Reflect</h2>

        {/* Q1 — productive? */}
        <div>
          <label className="mb-2 block text-sm font-semibold">Was today productive?</label>
          <div className="flex gap-2">
            {[
              { label: "Yes", val: true },
              { label: "No", val: false },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setProductive(o.val)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  productive === o.val
                    ? o.val
                      ? "bg-teal text-white"
                      : "bg-coral text-white"
                    : "border border-line text-muted hover:text-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {/* optional 1–5 score */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted">Rate it (optional):</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScore(score === n ? undefined : n)}
                className={`h-8 w-8 rounded-full text-xs font-semibold transition ${
                  score === n ? "bg-indigo text-white" : "border border-line text-muted hover:text-ink"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Q2 — what made it */}
        <div>
          <label className="mb-2 block text-sm font-semibold">
            What made it productive (or not)?
          </label>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="What helped, what got in the way…"
            value={whatMadeIt}
            onChange={(e) => setWhatMadeIt(e.target.value)}
          />
        </div>

        {/* Q3 — learned */}
        <div>
          <label className="mb-2 block text-sm font-semibold">What did you learn today?</label>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="A lesson, an insight, something about yourself…"
            value={learned}
            onChange={(e) => setLearned(e.target.value)}
          />
        </div>

        {/* AI follow-up */}
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
