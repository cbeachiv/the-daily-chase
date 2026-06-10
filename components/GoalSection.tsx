"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import { auth } from "@/lib/firebase/client";
import type { Goal, GoalPeriod } from "@/lib/types";

export default function GoalSection({
  period,
  periodStart,
  label,
}: {
  period: GoalPeriod;
  periodStart: string;
  label: string;
}) {
  const { data: allGoals, uid } = useCollection<Goal>("goals");
  const [title, setTitle] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aims, setAims] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");

  const goals = useMemo(
    () =>
      allGoals
        .filter((g) => g.period === period && g.periodStart === periodStart)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [allGoals, period, periodStart]
  );

  const done = goals.filter((g) => g.done).length;

  async function add(t: string, aiGenerated = false) {
    const text = t.trim();
    if (!text || !uid) return;
    await addItem(uid, "goals", {
      period,
      periodStart,
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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title">{label}</h2>
        {goals.length > 0 && (
          <span className="text-xs text-muted">
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
    </section>
  );
}
