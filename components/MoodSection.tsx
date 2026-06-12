"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem, setItem } from "@/lib/data";
import { auth } from "@/lib/firebase/client";
import type { CoffeeLog, MoodLog, Workout } from "@/lib/types";
import { prettyDate, prettyTime, sleepHours, todayStr } from "@/lib/dates";
import MoodChart from "@/components/charts/MoodChart";

const EMPTY_FORM = {
  mood: 5,
  energy: 5,
  caffeineCups: 0, // only edited directly on old logs; new logs snapshot from coffeeLogs
  alcoholDrinks: 0,
  exercised: false,
  bedtime: "",
  wakeTime: "",
  aiAnswer: "",
  notes: "",
};

interface InsightsDoc {
  id: string;
  summary: string;
  patterns: string[];
  generatedAt: string;
}

export default function MoodSection({ startDate }: { startDate: string | null }) {
  const today = todayStr();
  const { data: logs, uid } = useCollection<MoodLog>("moodLogs");
  const { data: insightsDocs } = useCollection<InsightsDoc>("moodInsights");
  const insights = insightsDocs.find((d) => d.id === "latest");
  // Exercise is shared with the main page / Exercise section via the workouts
  // collection, so logging it anywhere keeps everything in sync.
  const { data: workouts } = useCollection<Workout>("workouts");
  const exercisedToday = workouts.some((w) => w.date === today);
  // Every "Log Coffee" tap is its own timestamped doc; the mood form just
  // reads "how many so far today" from here instead of asking.
  const { data: coffees } = useCollection<CoffeeLog>("coffeeLogs");
  const todaysCoffees = useMemo(
    () =>
      coffees
        .filter((c) => c.date === today)
        .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
    [coffees, today]
  );
  const coffeeTimes = todaysCoffees.map((c) => prettyTime(c.loggedAt));

  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const logsInRange = useMemo(
    () => logs.filter((l) => !startDate || l.date >= startDate),
    [logs, startDate]
  );

  // Newest first, for the list.
  const recent = useMemo(
    () => [...logsInRange].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
    [logsInRange]
  );
  const visibleLogs = showAllLogs ? recent : recent.slice(0, 3);

  const latest = recent[0];

  function contextSummary(f: typeof EMPTY_FORM, exercised: boolean, times?: string[]) {
    const parts: string[] = [];
    const cups = times ? times.length : f.caffeineCups;
    if (cups)
      parts.push(
        `${cups} coffee${cups > 1 ? "s" : ""}${times?.length ? ` (at ${times.join(", ")})` : ""}`
      );
    if (f.alcoholDrinks) parts.push(`${f.alcoholDrinks} drink${f.alcoholDrinks > 1 ? "s" : ""}`);
    if (exercised) parts.push("exercised");
    if (f.bedtime && f.wakeTime) {
      const h = sleepHours(f.bedtime, f.wakeTime);
      if (h !== null) parts.push(`slept ${h}h`);
    }
    return parts.join(", ");
  }

  async function fetchQuestion(
    mood: number,
    energy: number,
    f: typeof EMPTY_FORM,
    exercised: boolean,
    times?: string[]
  ) {
    setAiLoading(true);
    setAiQuestion("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const localTime = new Date().toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
      // Send recent history so Claude can learn the user's patterns and ask
      // an informed, personalized question (capped to keep the prompt lean).
      const history = [...logs]
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
        .slice(0, 40)
        .map((l) => ({
          at: l.loggedAt,
          mood: l.mood,
          energy: l.energy,
          coffees: l.caffeineCups,
          drinks: l.alcoholDrinks,
          exercised: l.exercised,
          bedtime: l.bedtime,
          wakeTime: l.wakeTime,
          q: l.aiQuestion || undefined,
          a: l.aiAnswer || undefined,
          note: l.notes || undefined,
        }));
      const res = await fetch("/api/ai/mood-question", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          localTime,
          mood,
          energy,
          context: contextSummary(f, exercised, times),
          history,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAiQuestion(data.question ?? "");
    } catch {
      setAiQuestion(""); // AI question is optional — fail quietly
    } finally {
      setAiLoading(false);
    }
  }

  function openLog() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAiQuestion("");
    setShowForm(true);
    fetchQuestion(EMPTY_FORM.mood, EMPTY_FORM.energy, EMPTY_FORM, exercisedToday, coffeeTimes);
  }

  // One tap = one timestamped coffee. Counts and mood snapshots derive from these.
  async function logCoffee() {
    if (!uid) return;
    await addItem(uid, "coffeeLogs", { date: today, loggedAt: new Date().toISOString() });
  }

  async function undoCoffee() {
    if (!uid) return;
    const last = todaysCoffees[todaysCoffees.length - 1];
    if (last) await deleteItem(uid, "coffeeLogs", last.id);
  }

  // Toggle today's shared workout (same source the main page / Exercise section use).
  async function toggleTodayWorkout() {
    if (!uid) return;
    const todayWorkout = workouts.find((w) => w.date === today);
    if (todayWorkout) await deleteItem(uid, "workouts", todayWorkout.id);
    else await addItem(uid, "workouts", { date: today, type: "Exercise" });
  }

  function startEdit(l: MoodLog) {
    setForm({
      mood: l.mood,
      energy: l.energy,
      caffeineCups: l.caffeineCups ?? 0,
      alcoholDrinks: l.alcoholDrinks ?? 0,
      exercised: !!l.exercised,
      bedtime: l.bedtime ?? "",
      wakeTime: l.wakeTime ?? "",
      aiAnswer: l.aiAnswer ?? "",
      notes: l.notes ?? "",
    });
    setAiQuestion(l.aiQuestion ?? "");
    setEditingId(l.id);
    setShowForm(true);
  }

  function closeForm() {
    setForm(EMPTY_FORM);
    setAiQuestion("");
    setEditingId(null);
    setShowForm(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;
    const editable = {
      mood: form.mood,
      energy: form.energy,
      // New logs snapshot how many coffees were logged up to this moment;
      // edits keep whatever the log was saved with.
      caffeineCups: editingId ? form.caffeineCups : todaysCoffees.length,
      alcoholDrinks: form.alcoholDrinks,
      // New logs snapshot today's shared exercise status; edits keep their own.
      exercised: editingId ? form.exercised : exercisedToday,
      bedtime: form.bedtime,
      wakeTime: form.wakeTime,
      aiQuestion,
      aiAnswer: form.aiAnswer.trim(),
      notes: form.notes.trim(),
    };
    if (editingId) {
      await updateItem(uid, "moodLogs", editingId, editable);
    } else {
      await addItem(uid, "moodLogs", {
        ...editable,
        date: today,
        loggedAt: new Date().toISOString(),
      });
    }
    closeForm();
  }

  async function refreshInsights() {
    if (!uid) return;
    setInsightsLoading(true);
    setInsightsError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      // Send the most recent logs (capped) so the prompt stays lean.
      const payload = [...logs]
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
        .slice(0, 90);
      // Individual coffee timestamps so Claude can correlate timing, not just counts.
      const coffeePayload = [...coffees]
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
        .slice(0, 200)
        .map((c) => c.loggedAt);
      const res = await fetch("/api/ai/mood-insights", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ logs: payload, coffeeTimes: coffeePayload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await setItem(uid, "moodInsights", "latest", {
        summary: data.summary ?? "",
        patterns: data.patterns ?? [],
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : "Could not generate insights");
    } finally {
      setInsightsLoading(false);
    }
  }

  const formSleep =
    form.bedtime && form.wakeTime ? sleepHours(form.bedtime, form.wakeTime) : null;

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="section-title">Mood</h2>
        <div className="flex items-center gap-2">
          {latest && !showForm && (
            <span className="hidden gap-1.5 text-[11px] font-semibold lg:flex">
              <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-indigo">
                {latest.mood}
              </span>
              <span className="rounded-full bg-amber/10 px-2 py-0.5 text-amber">
                ⚡{latest.energy}
              </span>
            </span>
          )}
          <button
            onClick={logCoffee}
            className="btn-ghost px-3 py-1.5 text-xs"
            title="Log a coffee right now"
          >
            ☕ {todaysCoffees.length > 0 ? todaysCoffees.length : "Log"}
          </button>
          <button
            onClick={() => (showForm ? closeForm() : openLog())}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            {showForm ? "Close" : "+ Log"}
          </button>
          <button
            onClick={() => setDetailsOpen((o) => !o)}
            className="text-muted transition hover:text-ink"
            title={detailsOpen ? "Hide insights & logs" : "Show insights & logs"}
          >
            <Chevron open={detailsOpen} />
          </button>
        </div>
      </div>

      {todaysCoffees.length > 0 && (
        <p className="-mt-1 mb-3 text-xs text-muted">
          ☕ Today: {coffeeTimes.join(" · ")}
          <button
            onClick={undoCoffee}
            className="ml-2 font-semibold text-muted underline hover:text-coral"
            title="Remove the last coffee"
          >
            undo
          </button>
        </p>
      )}

      {showForm && (
        <form onSubmit={save} className="mb-4 space-y-4 rounded-lg border border-line bg-bg/50 p-4">
          <Slider
            label="Mood"
            value={form.mood}
            color="#6366f1"
            onChange={(v) => setForm({ ...form, mood: v })}
          />
          <Slider
            label="Energy"
            value={form.energy}
            color="#f59e0b"
            onChange={(v) => setForm({ ...form, energy: v })}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editingId ? (
              <PillGroup
                label="☕ Coffees"
                value={form.caffeineCups}
                onChange={(v) => setForm({ ...form, caffeineCups: v })}
              />
            ) : (
              <div>
                <p className="mb-1 text-xs font-semibold text-muted">☕ Coffees so far</p>
                {todaysCoffees.length > 0 ? (
                  <p className="text-sm">
                    <span className="font-semibold">{todaysCoffees.length}</span>{" "}
                    <span className="text-muted">· {coffeeTimes.join(" · ")}</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted">None yet — tap “☕ Log” when you have one.</p>
                )}
              </div>
            )}
            <PillGroup
              label="🍷 Drinks Yesterday"
              value={form.alcoholDrinks}
              onChange={(v) => setForm({ ...form, alcoholDrinks: v })}
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() =>
                editingId ? setForm({ ...form, exercised: !form.exercised }) : toggleTodayWorkout()
              }
              className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                (editingId ? form.exercised : exercisedToday)
                  ? "bg-teal/15 text-teal"
                  : "bg-bg text-muted hover:text-ink"
              }`}
            >
              {(editingId ? form.exercised : exercisedToday) ? "✓ " : "○ "}🏃 Exercised today
            </button>
            {!editingId && (
              <p className="mt-1 text-xs text-muted">Synced with your exercise log above.</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-muted">🛏 Sleep last night</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-muted">
                Went to bed
                <input
                  type="time"
                  className="input mt-1"
                  value={form.bedtime}
                  onChange={(e) => setForm({ ...form, bedtime: e.target.value })}
                />
              </label>
              <label className="text-xs font-semibold text-muted">
                Woke up
                <input
                  type="time"
                  className="input mt-1"
                  value={form.wakeTime}
                  onChange={(e) => setForm({ ...form, wakeTime: e.target.value })}
                />
              </label>
              {formSleep !== null && (
                <span className="pb-2 text-sm font-medium text-teal">{formSleep}h</span>
              )}
            </div>
          </div>

          {/* AI follow-up */}
          <div className="rounded-lg border border-line bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo">✦ Smart question</span>
              <button
                type="button"
                onClick={() =>
                  fetchQuestion(
                    form.mood,
                    form.energy,
                    form,
                    editingId ? form.exercised : exercisedToday,
                    editingId ? undefined : coffeeTimes
                  )
                }
                className="text-xs text-muted hover:text-ink"
                disabled={aiLoading}
              >
                {aiLoading ? "…" : "↻ new"}
              </button>
            </div>
            <p className="mt-1 text-sm">
              {aiLoading ? "Thinking…" : aiQuestion || "No question — answer anything below."}
            </p>
            <input
              className="input mt-2"
              placeholder="Your answer (optional)"
              value={form.aiAnswer}
              onChange={(e) => setForm({ ...form, aiAnswer: e.target.value })}
            />
          </div>

          <input
            className="input"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <button type="submit" className="btn-primary w-full">
            {editingId ? "Save changes" : "Save log"}
          </button>
        </form>
      )}

      <MoodChart logs={logsInRange} compact={!detailsOpen} />

      {detailsOpen && (
      <>
      {/* AI insights */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold">✦ Insights</h3>
          <button
            onClick={refreshInsights}
            disabled={insightsLoading || logs.length < 3}
            className="btn-ghost px-3 py-1 text-xs disabled:opacity-50"
          >
            {insightsLoading ? "Analyzing…" : "Refresh"}
          </button>
        </div>
        {insightsError && <p className="text-sm text-coral">{insightsError}</p>}
        {!insights && !insightsError && (
          <p className="text-sm text-muted">
            {logs.length < 3
              ? "Log a few times, then generate insights."
              : "Tap “Refresh” to find your patterns."}
          </p>
        )}
        {insights && (
          <div className="space-y-2">
            <p className="text-sm">{insights.summary}</p>
            {insights.patterns?.length > 0 && (
              <ul className="space-y-1">
                {insights.patterns.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-indigo">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">
              Updated {prettyDate(insights.generatedAt.slice(0, 10))},{" "}
              {prettyTime(insights.generatedAt)}
            </p>
          </div>
        )}
      </div>

      {/* Log history */}
      <div className="mt-4 border-t border-line pt-4">
        <h3 className="mb-2 text-sm font-bold">Recent logs</h3>
        {recent.length === 0 && (
          <p className="text-sm text-muted">No logs in this range yet.</p>
        )}
        <div className="space-y-2">
          {visibleLogs.map((l) => {
            const slept = l.bedtime && l.wakeTime ? sleepHours(l.bedtime, l.wakeTime) : null;
            return (
              <article key={l.id} className="group rounded-lg border border-line bg-bg/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {prettyDate(l.date)} · {prettyTime(l.loggedAt)}
                  </span>
                  <span className="flex gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-indigo">
                      Mood {l.mood}
                    </span>
                    <span className="rounded-full bg-amber/10 px-2 py-0.5 text-amber">
                      Energy {l.energy}
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  {!!l.caffeineCups && <span>☕ {l.caffeineCups}</span>}
                  {!!l.alcoholDrinks && <span>🍷 {l.alcoholDrinks}</span>}
                  {l.exercised && <span>🏃 exercised</span>}
                  {slept !== null && <span>🛏 {slept}h</span>}
                </div>
                {l.aiQuestion && (
                  <p className="mt-1.5 text-sm">
                    <span className="text-muted">{l.aiQuestion}</span>
                    {l.aiAnswer && <> — {l.aiAnswer}</>}
                  </p>
                )}
                {l.notes && <p className="mt-1 text-sm">{l.notes}</p>}
                <div className="mt-2 flex gap-3 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => startEdit(l)}
                    className="text-xs text-muted hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => uid && deleteItem(uid, "moodLogs", l.id)}
                    className="text-xs text-muted hover:text-coral"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {recent.length > 3 && (
          <button
            onClick={() => setShowAllLogs((s) => !s)}
            className="mt-2 w-full text-center text-xs font-semibold text-indigo"
          >
            {showAllLogs ? "Show less" : `Show all ${recent.length}`}
          </button>
        )}
      </div>
      </>
      )}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Slider({
  label,
  value,
  color,
  onChange,
}: {
  label: string;
  value: number;
  color: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-sm font-bold" style={{ color }}>
          {value}/10
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: color }}
      />
    </div>
  );
}

function PillGroup({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const opts = [
    { v: 0, t: "0" },
    { v: 1, t: "1" },
    { v: 2, t: "2" },
    { v: 3, t: "3+" },
  ];
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted">{label}</p>
      <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition ${
              value === o.v ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink"
            }`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}
