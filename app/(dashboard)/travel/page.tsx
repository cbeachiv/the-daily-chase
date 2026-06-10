"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, deleteItem } from "@/lib/data";
import type { Travel } from "@/lib/types";
import { prettyDate, todayStr } from "@/lib/dates";

const ACCENTS = ["border-l-indigo", "border-l-amber", "border-l-teal", "border-l-coral", "border-l-sky", "border-l-pink"];

export default function TravelPage() {
  const { data: trips, uid } = useCollection<Travel>("travel");
  const today = todayStr();
  const [form, setForm] = useState({ destination: "", startDate: "", endDate: "", notes: "" });
  const [showForm, setShowForm] = useState(false);

  const { upcoming, past } = useMemo(() => {
    const sorted = [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate));
    return {
      upcoming: sorted.filter((t) => (t.endDate || t.startDate) >= today),
      past: sorted.filter((t) => (t.endDate || t.startDate) < today).reverse(),
    };
  }, [trips, today]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.destination.trim() || !form.startDate || !uid) return;
    await addItem(uid, "travel", {
      destination: form.destination.trim(),
      startDate: form.startDate,
      endDate: form.endDate || form.startDate,
      notes: form.notes.trim(),
    });
    setForm({ destination: "", startDate: "", endDate: "", notes: "" });
    setShowForm(false);
  }

  function dateRange(t: Travel) {
    if (t.endDate && t.endDate !== t.startDate) {
      return `${prettyDate(t.startDate)} – ${prettyDate(t.endDate)}`;
    }
    return prettyDate(t.startDate);
  }

  function daysUntil(t: Travel) {
    const d = Math.round(
      (new Date(t.startDate + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) /
        86_400_000
    );
    if (d <= 0) return "Now";
    return `in ${d}d`;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Travel</h1>
          <p className="text-sm text-muted">Upcoming trips.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          {showForm ? "Close" : "+ Trip"}
        </button>
      </header>

      {showForm && (
        <form onSubmit={add} className="card space-y-3 p-4">
          <input
            className="input"
            placeholder="Destination"
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
          />
          <div className="flex gap-2">
            <label className="flex-1 text-xs font-semibold text-muted">
              Start
              <input
                type="date"
                className="input mt-1"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </label>
            <label className="flex-1 text-xs font-semibold text-muted">
              End
              <input
                type="date"
                className="input mt-1"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
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
            Add trip
          </button>
        </form>
      )}

      <section className="space-y-3">
        {upcoming.length === 0 && (
          <p className="card p-6 text-center text-sm text-muted">No upcoming trips.</p>
        )}
        {upcoming.map((t, i) => (
          <article
            key={t.id}
            className={`card group border-l-4 ${ACCENTS[i % ACCENTS.length]} p-4`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t.destination}</h3>
              <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-muted">
                {daysUntil(t)}
              </span>
            </div>
            <p className="text-sm text-muted">{dateRange(t)}</p>
            {t.notes && <p className="mt-1 text-sm">{t.notes}</p>}
            <button
              onClick={() => uid && deleteItem(uid, "travel", t.id)}
              className="mt-2 text-xs text-muted opacity-0 transition group-hover:opacity-100 hover:text-coral"
            >
              Delete
            </button>
          </article>
        ))}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Past
          </h2>
          <div className="space-y-2">
            {past.map((t) => (
              <article key={t.id} className="card group flex items-center justify-between p-3 opacity-70">
                <div>
                  <h3 className="text-sm font-semibold">{t.destination}</h3>
                  <p className="text-xs text-muted">{dateRange(t)}</p>
                </div>
                <button
                  onClick={() => uid && deleteItem(uid, "travel", t.id)}
                  className="text-xs text-muted opacity-0 transition group-hover:opacity-100 hover:text-coral"
                >
                  Delete
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
