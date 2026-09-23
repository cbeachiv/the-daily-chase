"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import { auth } from "@/lib/firebase/client";
import {
  startOfWeek,
  startOfMonth,
  startOfYear,
  addDays,
  addMonths,
  addYears,
  prettyDate,
  prettyMonth,
  shortDate,
  todayStr,
} from "@/lib/dates";
import type { Goal, GoalPeriod, GoalProgress } from "@/lib/types";

const PERIOD_ADJ: Record<GoalPeriod, string> = {
  week: "weekly",
  month: "monthly",
  year: "yearly",
};

export default function GoalSection({ period }: { period: GoalPeriod }) {
  const { data: allGoals, uid } = useCollection<Goal>("goals");
  const [offset, setOffset] = useState(0); // 0 = current period, negative = earlier
  const [title, setTitle] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aims, setAims] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");

  const currentStart =
    period === "week" ? startOfWeek() : period === "month" ? startOfMonth() : startOfYear();
  const periodStart = useMemo(
    () =>
      period === "week"
        ? addDays(currentStart, offset * 7)
        : period === "month"
          ? addMonths(currentStart, offset)
          : addYears(currentStart, offset),
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
  const dateLabel =
    period === "week"
      ? `Week of ${prettyDate(periodStart)}`
      : period === "month"
        ? prettyMonth(periodStart)
        : `By end of ${periodStart.slice(0, 4)}`;

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
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          period,
          aims,
          existing: goals.map((g) => g.title),
        }),
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
            <button onClick={() => setOffset(0)} className="ml-1 text-xs font-semibold text-indigo">
              {period === "week" ? "This week" : period === "month" ? "This month" : "This year"}
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
          <li key={g.id} className="rounded-lg px-1 py-1.5 hover:bg-bg">
            <div className="group flex items-center gap-3">
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
            </div>
            {uid && <ProgressLog uid={uid} goal={g} />}
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
              placeholder={`Add a ${PERIOD_ADJ[period]} goal…`}
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

// Dated progress notes under a goal. Stored as an array on the goal doc since a
// goal only ever collects a few dozen of these.
function ProgressLog({ uid, goal }: { uid: string; goal: Goal }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [text, setText] = useState("");
  const entries = useMemo(
    () => [...(goal.progress ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [goal.progress]
  );

  function save(next: GoalProgress[]) {
    return updateItem(uid, "goals", goal.id, { progress: next });
  }

  async function add() {
    const t = text.trim();
    if (!t || !date) return;
    await save([...(goal.progress ?? []), { id: crypto.randomUUID(), date, text: t }]);
    setText("");
    setDate(todayStr());
  }

  return (
    <div className="ml-8 mt-1">
      {entries.length > 0 && (
        <ul className="space-y-0.5">
          {entries.map((p) => (
            <li key={p.id} className="group/p flex items-baseline gap-2 text-xs">
              <span className="w-14 shrink-0 tabular-nums text-muted">{shortDate(p.date)}</span>
              <span className="flex-1 text-ink">{p.text}</span>
              <button
                onClick={() => save((goal.progress ?? []).filter((x) => x.id !== p.id))}
                className="shrink-0 text-muted opacity-0 transition group-hover/p:opacity-100 hover:text-coral"
                aria-label="Delete progress entry"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mt-1.5 flex flex-wrap gap-2"
        >
          <input
            type="date"
            className="input w-auto py-1 text-xs"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            autoFocus
            className="input min-w-0 flex-1 py-1 text-xs"
            placeholder="What happened?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0 py-1 text-xs">
            Log
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
            Done
          </button>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-0.5 text-[11px] font-semibold text-indigo"
        >
          + Log progress{entries.length > 0 ? ` (${entries.length})` : ""}
        </button>
      )}
    </div>
  );
}
