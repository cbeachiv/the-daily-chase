"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, deleteItem, updateItem } from "@/lib/data";
import type { Travel, HuggaTrip } from "@/lib/types";
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
              Logistics booked
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
                label="Logistics"
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
          <div className="border-l border-line pl-4">
            {past.map((t) => (
              <div
                key={t.id}
                className="group relative flex items-center justify-between py-2"
              >
                <span className="absolute -left-[1.3rem] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-line" />
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-medium text-muted">{t.destination}</h3>
                  <p className="text-xs text-muted/70">{dateRange(t)}</p>
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
              </div>
            ))}
          </div>
        </section>
      )}

      <HuggaSection />
    </div>
  );
}

function HuggaSection() {
  const { data: trips, uid } = useCollection<HuggaTrip>("huggaTrips");
  const today = todayStr();
  const emptyForm = { date: "", stayType: "day" as "day" | "overnight", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { upcoming, past } = useMemo(() => {
    const sorted = [...trips].sort((a, b) => b.date.localeCompare(a.date));
    return {
      upcoming: sorted.filter((t) => t.date > today).reverse(),
      past: sorted.filter((t) => t.date <= today),
    };
  }, [trips, today]);

  const stats = useMemo(() => {
    if (past.length === 0) return null;
    const dayMs = 86_400_000;
    const asDay = (d: string) => new Date(d + "T00:00:00").getTime();
    const daysSince = Math.round((asDay(today) - asDay(past[0].date)) / dayMs);
    let avgGap: number | null = null;
    if (past.length >= 2) {
      const newest = asDay(past[0].date);
      const oldest = asDay(past[past.length - 1].date);
      avgGap = Math.round((newest - oldest) / dayMs / (past.length - 1));
    }
    return { daysSince: Math.max(0, daysSince), avgGap };
  }, [past, today]);

  function daysUntil(date: string) {
    const d = Math.round(
      (new Date(date + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) /
        86_400_000
    );
    return d <= 0 ? "Today" : `in ${d}d`;
  }

  function closeForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date || !uid) return;
    const payload = { date: form.date, stayType: form.stayType, notes: form.notes.trim() };
    if (editingId) {
      await updateItem(uid, "huggaTrips", editingId, payload);
    } else {
      await addItem(uid, "huggaTrips", payload);
    }
    closeForm();
  }

  function startEdit(t: HuggaTrip) {
    setForm({ date: t.date, stayType: t.stayType || "day", notes: t.notes || "" });
    setEditingId(t.id);
    setShowForm(true);
  }

  return (
    <section className="space-y-3 border-t border-line pt-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Hugga Travel</h2>
          <p className="text-sm text-muted">Visits to Hugga.</p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="btn-primary"
        >
          {showForm ? "Close" : "+ Visit"}
        </button>
      </header>

      {stats && (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-baseline gap-1.5 rounded-full bg-card border border-line px-3 py-1.5">
            <span className="text-sm font-bold tabular-nums">{stats.daysSince}</span>
            <span className="text-xs text-muted">
              {stats.daysSince === 1 ? "day" : "days"} since last visit
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 rounded-full bg-card border border-line px-3 py-1.5">
            <span className="text-sm font-bold tabular-nums">
              {stats.avgGap == null ? "—" : stats.avgGap}
            </span>
            <span className="text-xs text-muted">avg days between</span>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={save} className="card space-y-3 p-4">
          <label className="block text-xs font-semibold text-muted">
            Date
            <input
              type="date"
              className="input mt-1"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <div className="flex gap-2">
            {(["day", "overnight"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setForm({ ...form, stayType: opt })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  form.stayType === opt
                    ? "border-indigo bg-indigo/10 text-indigo"
                    : "border-line bg-card text-muted hover:text-ink"
                }`}
              >
                {opt === "day" ? "Day trip" : "Overnight"}
              </button>
            ))}
          </div>
          <textarea
            className="input min-h-[100px]"
            placeholder="Notes from the trip"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <button type="submit" className="btn-primary w-full">
            {editingId ? "Save changes" : "Add visit"}
          </button>
        </form>
      )}

      {upcoming.length === 0 && past.length === 0 && !showForm && (
        <p className="card p-6 text-center text-sm text-muted">No Hugga visits yet.</p>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Upcoming
          </h3>
          {upcoming.map((t) => (
            <HuggaVisitCard
              key={t.id}
              trip={t}
              badge={daysUntil(t.date)}
              onEdit={() => startEdit(t)}
              onDelete={() => uid && deleteItem(uid, "huggaTrips", t.id)}
            />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          {upcoming.length > 0 && (
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Past
            </h3>
          )}
          {past.map((t) => (
            <HuggaVisitCard
              key={t.id}
              trip={t}
              onEdit={() => startEdit(t)}
              onDelete={() => uid && deleteItem(uid, "huggaTrips", t.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HuggaVisitCard({
  trip,
  badge,
  onEdit,
  onDelete,
}: {
  trip: HuggaTrip;
  badge?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="card group p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{prettyDate(trip.date)}</h3>
          <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-muted">
            {trip.stayType === "overnight" ? "Overnight" : "Day trip"}
          </span>
          {badge && (
            <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-xs font-semibold text-indigo">
              {badge}
            </span>
          )}
        </div>
        <div className="flex gap-3 opacity-0 transition group-hover:opacity-100">
          <button onClick={onEdit} className="text-xs text-muted hover:text-ink">
            Edit
          </button>
          <button onClick={onDelete} className="text-xs text-muted hover:text-coral">
            Delete
          </button>
        </div>
      </div>
      {trip.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{trip.notes}</p>}
    </article>
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
