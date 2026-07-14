"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import { auth } from "@/lib/firebase/client";
import { startOfWeek, startOfMonth, addDays, addMonths, prettyDate, prettyMonth } from "@/lib/dates";
import type { Goal, GoalPeriod } from "@/lib/types";

export default function GoalSection({ period }: { period: GoalPeriod }) {
  const { data: allGoals, uid } = useCollection<Goal>("goals");
  const [offset, setOffset] = useState(0); // 0 = current period, negative = earlier
  const [title, setTitle] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aims, setAims] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");

  const currentStart = period === "week" ? startOfWeek() : startOfMonth();
  const periodStart = useMemo(
    () =>
      period === "week" ? addDays(currentStart, offset * 7) : addMonths(currentStart, offset),
    [period, currentStart, offset]
  );
  const isCurrent = offset === 0;

  // Goals originally set for the viewed period.
  const own = useMemo(
    () => allGoals.filter((g) => g.period === period && g.periodStart === periodStart),
    [allGoals, period, periodStart]
  );
  // Unfinished goals from earlier periods roll forward into the current one until
  // they're checked off. Only the current period pulls these in — browsing history
  // shows each period exactly as it was set.
  const carried = useMemo(
    () =>
      isCurrent
        ? allGoals.filter((g) => g.period === period && g.periodStart < periodStart && !g.done)
        : [],
    [allGoals, period, periodStart, isCurrent]
  );
  const carriedIds = useMemo(() => new Set(carried.map((g) => g.id)), [carried]);

  const goals = useMemo(
    () => [...own, ...carried].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [own, carried]
  );

  const done = goals.filter((g) => g.done).length;
  const dateLabel = period === "week" ? `Week of ${prettyDate(periodStart)}` : prettyMonth(periodStart);

  async function add(t: string, aiGenerated = false) {
    const text = t.trim();
    if (!text || !uid) return;
    await addItem(uid, "goals", {
      period,
      periodStart: currentStart, // always anchored to the live period
      title: text,
      done: false,
      aiGenerated,
    });
  }

  async function suggest() {
    setLoading(true);
    setError("");
    setSuggestions([]);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ period, aims, existing: goals.map((g) => g.title) }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      setError("Couldn't get suggestions. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOffset((o) => o - 1)}
            aria-label={`Previous ${period}`}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink"
          >
            ‹
          </button>
          <h2 className="section-title">{dateLabel}</h2>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={isCurrent}
            aria-label={`Next ${period}`}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ›
          </button>
          {!isCurrent && (
            <button
              onClick={() => setOffset(0)}
              className="ml-1 text-xs font-semibold text-indigo"
            >
              {period === "week" ? "This week" : "This month"}
            </button>
          )}
        </div>
        {goals.length > 0 && (
          <span className="shrink-0 text-xs text-muted">
            {done}/{goals.length} done
          </span>
        )}
      </div>

      <ul className="mb-3 space-y-1.5">
        {goals.map((g) => (
          <li key={g.id} className="group flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-bg">
            <button
              onClick={() => uid && updateItem(uid, "goals", g.id, { done: !g.done })}
              aria-label="Toggle goal"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] ${
                g.done ? "border-teal bg-teal text-white" : "border-line"
              }`}
            >
              {g.done ? "✓" : ""}
            </button>
            <span className={`flex-1 text-sm ${g.done ? "text-muted line-through" : ""}`}>
              {g.title}
            </span>
            {carriedIds.has(g.id) && (
              <span
                className="shrink-0 text-[10px] text-muted"
                title={`Carried over from ${prettyDate(g.periodStart)}`}
              >
                ↩ carried over
              </span>
            )}
            {g.aiGenerated && <span className="shrink-0 text-[10px] text-indigo">✦ AI</span>}
            <button
              onClick={() => uid && deleteItem(uid, "goals", g.id)}
              className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100 hover:text-coral"
              aria-label="Delete goal"
            >
              ✕
            </button>
          </li>
        ))}
        {goals.length === 0 && <li className="px-1 text-sm text-muted">No goals set yet.</li>}
      </ul>

      {isCurrent ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add(title);
              setTitle("");
            }}
            className="flex gap-2"
          >
            <input
              className="input"
              placeholder={`Add a ${period === "week" ? "weekly" : "monthly"} goal…`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit" className="btn-primary shrink-0">
              Add
            </button>
          </form>

          <button
            onClick={() => setAiOpen((o) => !o)}
            className="mt-3 text-xs font-semibold text-indigo"
          >
            ✦ AI suggest
          </button>

          {aiOpen && (
            <div className="mt-2 rounded-lg border border-line bg-bg p-3">
              <textarea
                className="input mb-2 min-h-[60px] resize-y"
                placeholder="Optional: what are you focused on right now? (e.g. ship Guests First v2, get back in shape)"
                value={aims}
                onChange={(e) => setAims(e.target.value)}
              />
              <button onClick={suggest} className="btn-ghost" disabled={loading}>
                {loading ? "Thinking…" : "Generate ideas"}
              </button>
              {error && <p className="mt-2 text-xs text-coral">{error}</p>}
              {suggestions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        add(s, true);
                        setSuggestions((prev) => prev.filter((x) => x !== s));
                      }}
                      className="rounded-full border border-indigo/40 bg-card px-3 py-1 text-xs text-ink hover:bg-indigo hover:text-white"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted">
          Viewing a past {period}. Unfinished goals here roll forward to your current {period}.
        </p>
      )}
    </section>
  );
}
