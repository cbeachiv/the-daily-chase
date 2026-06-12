"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type { CallLog } from "@/lib/types";
import { prettyDate, startOfWeek, todayStr } from "@/lib/dates";

// "14:30" -> "2:30 PM"
function prettyClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const am = h < 12;
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

export default function CallsSection() {
  const today = todayStr();
  const { data: calls, uid } = useCollection<CallLog>("calls");

  const emptyForm = () => ({
    person: "",
    date: today,
    time: new Date().toTimeString().slice(0, 5),
    notes: "",
  });
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () =>
      [...calls].sort((a, b) =>
        `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
      ),
    [calls]
  );
  const visible = showAll ? sorted : sorted.slice(0, 5);

  const weekStart = startOfWeek(today);
  const weekCount = useMemo(() => calls.filter((c) => c.date >= weekStart).length, [calls, weekStart]);
  const monthCalls = useMemo(
    () => calls.filter((c) => c.date.slice(0, 7) === today.slice(0, 7)),
    [calls, today]
  );
  // Who's getting the most of your time this month.
  const topPeople = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of monthCalls) counts.set(c.person, (counts.get(c.person) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [monthCalls]);

  function openForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(c: CallLog) {
    setForm({ person: c.person, date: c.date, time: c.time, notes: c.notes ?? "" });
    setEditingId(c.id);
    setShowForm(true);
  }

  function closeForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.person.trim() || !form.date || !form.time || !uid) return;
    const payload = {
      person: form.person.trim(),
      date: form.date,
      time: form.time,
      notes: form.notes.trim(),
    };
    if (editingId) await updateItem(uid, "calls", editingId, payload);
    else await addItem(uid, "calls", payload);
    closeForm();
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="section-title">Calls</h2>
          <span className="text-xs text-muted">
            {weekCount} this week · {monthCalls.length} this month
          </span>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : openForm())}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {showForm ? "Close" : "+ Call"}
        </button>
      </div>

      {topPeople.length > 0 && (
        <p className="mb-3 text-xs text-muted">
          Most this month:{" "}
          {topPeople.map(([person, n], i) => (
            <span key={person}>
              {i > 0 && ", "}
              <span className="font-semibold text-ink">{person}</span> ({n})
            </span>
          ))}
        </p>
      )}

      {showForm && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-lg border border-line bg-bg/50 p-4">
          <input
            className="input"
            placeholder="Who was the call with?"
            value={form.person}
            onChange={(e) => setForm({ ...form, person: e.target.value })}
          />
          <div className="flex gap-2">
            <label className="flex-1 text-xs font-semibold text-muted">
              Date
              <input
                type="date"
                className="input mt-1"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label className="flex-1 text-xs font-semibold text-muted">
              Time
              <input
                type="time"
                className="input mt-1"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </label>
          </div>
          <input
            className="input"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <button type="submit" className="btn-primary w-full">
            {editingId ? "Save changes" : "Add call"}
          </button>
        </form>
      )}

      {sorted.length === 0 && !showForm && (
        <p className="py-2 text-sm text-muted">No calls logged yet — tap “+ Call” to start.</p>
      )}

      <div className="space-y-2">
        {visible.map((c) => (
          <article key={c.id} className="group rounded-lg border border-line bg-bg/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">📞 {c.person}</span>
              <span className="text-xs text-muted">
                {prettyDate(c.date)} · {prettyClock(c.time)}
              </span>
            </div>
            {c.notes && <p className="mt-1 text-sm">{c.notes}</p>}
            <div className="mt-1.5 flex gap-3 opacity-0 transition group-hover:opacity-100">
              <button onClick={() => startEdit(c)} className="text-xs text-muted hover:text-ink">
                Edit
              </button>
              <button
                onClick={() => uid && deleteItem(uid, "calls", c.id)}
                className="text-xs text-muted hover:text-coral"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      {sorted.length > 5 && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="mt-2 w-full text-center text-xs font-semibold text-indigo"
        >
          {showAll ? "Show less" : `Show all ${sorted.length}`}
        </button>
      )}
    </section>
  );
}
