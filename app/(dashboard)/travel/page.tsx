"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, deleteItem, updateItem } from "@/lib/data";
import type { Travel } from "@/lib/types";
import { prettyDate, todayStr } from "@/lib/dates";

const ACCENTS = ["border-l-indigo", "border-l-amber", "border-l-teal", "border-l-coral", "border-l-sky", "border-l-pink"];

export default function TravelPage() {
  const { data: trips, uid } = useCollection<Travel>("travel");
  const today = todayStr();
  const emptyForm = {
    destination: "",
    startDate: "",
    endDate: "",
    notes: "",
    flightsBooked: false,
    lodgingBooked: false,
  };
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { upcoming, past } = useMemo(() => {
    const sorted = [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate));
    return {
      upcoming: sorted.filter((t) => (t.endDate || t.startDate) >= today),
      past: sorted.filter((t) => (t.endDate || t.startDate) < today).reverse(),
    };
  }, [trips, today]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.destination.trim() || !form.startDate || !uid) return;
    const payload = {
      destination: form.destination.trim(),
      startDate: form.startDate,
      endDate: form.endDate || form.startDate,
      notes: form.notes.trim(),
      flightsBooked: form.flightsBooked,
      lodgingBooked: form.lodgingBooked,
    };
    if (editingId) {
      await updateItem(uid, "travel", editingId, payload);
    } else {
      await addItem(uid, "travel", payload);
    }
    closeForm();
  }

  function startEdit(t: Travel) {
    setForm({
      destination: t.destination,
      startDate: t.startDate,
      endDate: t.endDate || "",
      notes: t.notes || "",
      flightsBooked: !!t.flightsBooked,
      lodgingBooked: !!t.lodgingBooked,
    });
    setEditingId(t.id);
    setShowForm(true);
  }

  function closeForm() {
    setForm(emptyForm);
    setEditingId(null);
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
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="btn-primary"
        >
          {showForm ? "Close" : "+ Trip"}
        </button>
      </header>

      {showForm && (
        <form onSubmit={save} className="card space-y-3 p-4">
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
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.flightsBooked}
                onChange={(e) => setForm({ ...form, flightsBooked: e.target.checked })}
              />
              Flights booked
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.lodgingBooked}
                onChange={(e) => setForm({ ...form, lodgingBooked: e.target.checked })}
              />
              Lodging booked
            </label>
          </div>
          <button type="submit" className="btn-primary w-full">
            {editingId ? "Save changes" : "Add trip"}
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
            <div className="mt-2 flex flex-wrap gap-2">
              <BookingPill
                label="Flights"
                booked={!!t.flightsBooked}
                onClick={() =>
                  uid && updateItem(uid, "travel", t.id, { flightsBooked: !t.flightsBooked })
                }
              />
              <BookingPill
                label="Lodging"
                booked={!!t.lodgingBooked}
                onClick={() =>
                  uid && updateItem(uid, "travel", t.id, { lodgingBooked: !t.lodgingBooked })
                }
              />
            </div>
            <div className="mt-2 flex gap-3 opacity-0 transition group-hover:opacity-100">
              <button
                onClick={() => startEdit(t)}
                className="text-xs text-muted hover:text-ink"
              >
                Edit
              </button>
              <button
                onClick={() => uid && deleteItem(uid, "travel", t.id)}
                className="text-xs text-muted hover:text-coral"
              >
                Delete
              </button>
            </div>
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
                <div className="flex gap-3 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => startEdit(t)}
                    className="text-xs text-muted hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => uid && deleteItem(uid, "travel", t.id)}
                    className="text-xs text-muted hover:text-coral"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BookingPill({
  label,
  booked,
  onClick,
}: {
  label: string;
  booked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition ${
        booked
          ? "bg-teal/15 text-teal"
          : "bg-bg text-muted hover:text-ink"
      }`}
    >
      {booked ? "✓ " : "○ "}
      {label}
    </button>
  );
}
