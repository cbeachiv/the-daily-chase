"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type { Injury, InjuryCheckIn } from "@/lib/types";
import { prettyDate, shortDate, todayStr } from "@/lib/dates";

// Tailwind text color for a pain level (lower = better).
function painColor(pain: number): string {
  if (pain <= 3) return "text-teal";
  if (pain <= 7) return "text-amber";
  return "text-coral";
}

// Hex for the sparkline stroke, keyed to the trend direction.
function trendStroke(first: number, last: number): string {
  if (last < first) return "#14b8a6"; // improving — teal
  if (last > first) return "#ff6b6b"; // worsening — coral
  return "#64748b"; // flat — muted
}

// Whole days between two YYYY-MM-DD strings.
function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// "12 days" / "3 weeks" / "1 week, 2 days" — compact elapsed label.
function durationLabel(days: number): string {
  if (days <= 0) return "today";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  const w = `${weeks} week${weeks === 1 ? "" : "s"}`;
  return rem === 0 ? w : `${w}, ${rem} day${rem === 1 ? "" : "s"}`;
}

// Tiny inline SVG sparkline of pain over time (0 bottom → 10 top, so a
// downward line reads as "getting better").
function PainSparkline({ checkIns }: { checkIns: InjuryCheckIn[] }) {
  if (checkIns.length < 2) return null;
  const w = 88;
  const h = 28;
  const n = checkIns.length;
  const stroke = trendStroke(checkIns[0].pain, checkIns[n - 1].pain);
  const pts = checkIns.map((c, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - (Math.min(10, Math.max(0, c.pain)) / 10) * h;
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.8" fill={stroke} />
      ))}
    </svg>
  );
}

export default function InjuriesSection() {
  const today = todayStr();
  const { data: injuries, uid } = useCollection<Injury>("injuries");

  const emptyForm = () => ({ bodyPart: "", description: "", startDate: today, pain: 5 });
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Per-card check-in form (only one open at a time).
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [ci, setCi] = useState({ date: today, pain: 5, note: "" });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showRecovered, setShowRecovered] = useState(false);

  const active = useMemo(
    () =>
      injuries
        .filter((i) => i.status === "active")
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [injuries]
  );
  const recovered = useMemo(
    () =>
      injuries
        .filter((i) => i.status === "recovered")
        .sort((a, b) => (b.recoveredDate ?? "").localeCompare(a.recoveredDate ?? "")),
    [injuries]
  );

  function openForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
  }
  function startEdit(inj: Injury) {
    setForm({
      bodyPart: inj.bodyPart,
      description: inj.description,
      startDate: inj.startDate,
      pain: inj.checkIns[0]?.pain ?? 5,
    });
    setEditingId(inj.id);
    setShowForm(true);
  }
  function closeForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.bodyPart.trim() || !form.startDate || !uid) return;
    if (editingId) {
      // Edit core fields + keep checkIns; sync the initial check-in's pain.
      const inj = injuries.find((i) => i.id === editingId);
      const checkIns = inj ? [...inj.checkIns] : [];
      if (checkIns.length > 0) checkIns[0] = { ...checkIns[0], pain: form.pain };
      await updateItem(uid, "injuries", editingId, {
        bodyPart: form.bodyPart.trim(),
        description: form.description.trim(),
        startDate: form.startDate,
        checkIns,
      });
    } else {
      await addItem(uid, "injuries", {
        bodyPart: form.bodyPart.trim(),
        description: form.description.trim(),
        startDate: form.startDate,
        status: "active",
        checkIns: [{ date: form.startDate, pain: form.pain }],
      });
    }
    closeForm();
  }

  function openCheckIn(inj: Injury) {
    const lastPain = inj.checkIns[inj.checkIns.length - 1]?.pain ?? 5;
    setCi({ date: today, pain: lastPain, note: "" });
    setCheckInId(inj.id);
  }

  async function saveCheckIn(e: React.FormEvent, inj: Injury) {
    e.preventDefault();
    if (!uid || !ci.date) return;
    const entry: InjuryCheckIn = { date: ci.date, pain: ci.pain };
    if (ci.note.trim()) entry.note = ci.note.trim();
    const checkIns = [...inj.checkIns, entry].sort((a, b) => a.date.localeCompare(b.date));
    await updateItem(uid, "injuries", inj.id, { checkIns });
    setCheckInId(null);
  }

  async function markRecovered(inj: Injury) {
    if (!uid) return;
    await updateItem(uid, "injuries", inj.id, { status: "recovered", recoveredDate: today });
  }
  async function reopen(inj: Injury) {
    if (!uid) return;
    await updateItem(uid, "injuries", inj.id, { status: "active", recoveredDate: null });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="section-title">Injuries</h2>
          <span className="text-xs text-muted">
            {active.length} active · {recovered.length} recovered
          </span>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : openForm())}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {showForm ? "Close" : "+ Injury"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-lg border border-line bg-bg/50 p-4">
          <input
            className="input"
            placeholder="Body part — e.g. Left elbow (inner)"
            value={form.bodyPart}
            onChange={(e) => setForm({ ...form, bodyPart: e.target.value })}
          />
          <textarea
            className="input min-h-[60px]"
            placeholder="What happened / likely diagnosis (e.g. ISO Row machine — likely medial epicondylitis)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex gap-2">
            <label className="flex-1 text-xs font-semibold text-muted">
              Date it happened
              <input
                type="date"
                className="input mt-1"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </label>
            <label className="flex-1 text-xs font-semibold text-muted">
              Pain now: <span className={`font-bold ${painColor(form.pain)}`}>{form.pain}</span>/10
              <input
                type="range"
                min="0"
                max="10"
                className="mt-2 w-full accent-indigo"
                value={form.pain}
                onChange={(e) => setForm({ ...form, pain: Number(e.target.value) })}
              />
            </label>
          </div>
          <button type="submit" className="btn-primary w-full">
            {editingId ? "Save changes" : "Add injury"}
          </button>
        </form>
      )}

      {active.length === 0 && recovered.length === 0 && !showForm && (
        <p className="py-2 text-sm text-muted">
          No injuries logged — tap “+ Injury” to start tracking one.
        </p>
      )}

      {/* Active injuries */}
      <div className="space-y-2">
        {active.map((inj) => {
          const last = inj.checkIns[inj.checkIns.length - 1];
          const prev = inj.checkIns[inj.checkIns.length - 2];
          const pain = last?.pain ?? 0;
          const arrow =
            prev == null
              ? null
              : pain < prev.pain
              ? { sym: "▼", cls: "text-teal", label: "improving" }
              : pain > prev.pain
              ? { sym: "▲", cls: "text-coral", label: "worse" }
              : { sym: "→", cls: "text-muted", label: "same" };
          const isExpanded = expanded.has(inj.id);
          return (
            <article key={inj.id} className="group rounded-lg border border-line bg-bg/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">🩹 {inj.bodyPart}</span>
                  {inj.description && (
                    <p className="mt-0.5 text-sm text-muted">{inj.description}</p>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    {durationLabel(daysBetween(inj.startDate, today))} ago · since{" "}
                    {prettyDate(inj.startDate)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PainSparkline checkIns={inj.checkIns} />
                  <div className="text-right">
                    <div className={`text-lg font-extrabold leading-none ${painColor(pain)}`}>
                      {pain}
                      <span className="text-xs font-medium text-muted">/10</span>
                    </div>
                    {arrow && (
                      <div className={`text-[10px] font-semibold ${arrow.cls}`}>
                        {arrow.sym} {arrow.label}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {last?.note && <p className="mt-2 text-sm">“{last.note}”</p>}

              {isExpanded && inj.checkIns.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-line pt-2">
                  {[...inj.checkIns]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((c, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-xs">
                        <span className="w-16 shrink-0 text-muted">{shortDate(c.date)}</span>
                        <span className={`font-bold ${painColor(c.pain)}`}>{c.pain}/10</span>
                        {c.note && <span className="text-muted">— {c.note}</span>}
                      </li>
                    ))}
                </ul>
              )}

              {checkInId === inj.id && (
                <form
                  onSubmit={(e) => saveCheckIn(e, inj)}
                  className="mt-2 space-y-2 rounded-lg border border-line bg-card p-3"
                >
                  <div className="flex gap-2">
                    <label className="flex-1 text-xs font-semibold text-muted">
                      Date
                      <input
                        type="date"
                        className="input mt-1"
                        value={ci.date}
                        onChange={(e) => setCi({ ...ci, date: e.target.value })}
                      />
                    </label>
                    <label className="flex-1 text-xs font-semibold text-muted">
                      Pain: <span className={`font-bold ${painColor(ci.pain)}`}>{ci.pain}</span>/10
                      <input
                        type="range"
                        min="0"
                        max="10"
                        className="mt-2 w-full accent-indigo"
                        value={ci.pain}
                        onChange={(e) => setCi({ ...ci, pain: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <input
                    className="input"
                    placeholder="How does it feel? (optional)"
                    value={ci.note}
                    onChange={(e) => setCi({ ...ci, note: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary flex-1 py-1.5 text-xs">
                      Save check-in
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckInId(null)}
                      className="btn-ghost py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                {checkInId !== inj.id && (
                  <button
                    onClick={() => openCheckIn(inj)}
                    className="font-semibold text-indigo hover:opacity-80"
                  >
                    + Check-in
                  </button>
                )}
                {inj.checkIns.length > 1 && (
                  <button
                    onClick={() => toggleExpanded(inj.id)}
                    className="text-muted hover:text-ink"
                  >
                    {isExpanded ? "Hide check-ins" : `All ${inj.checkIns.length} check-ins`}
                  </button>
                )}
                <span className="ml-auto flex gap-3 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => markRecovered(inj)} className="text-muted hover:text-teal">
                    Mark recovered
                  </button>
                  <button onClick={() => startEdit(inj)} className="text-muted hover:text-ink">
                    Edit
                  </button>
                  <button
                    onClick={() => uid && deleteItem(uid, "injuries", inj.id)}
                    className="text-muted hover:text-coral"
                  >
                    Delete
                  </button>
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {/* Recovered injuries — collapsed history */}
      {recovered.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowRecovered((s) => !s)}
            className="w-full text-center text-xs font-semibold text-indigo"
          >
            {showRecovered ? "Hide recovered" : `Recovered (${recovered.length})`}
          </button>
          {showRecovered && (
            <div className="mt-2 space-y-2">
              {recovered.map((inj) => {
                const recDays = inj.recoveredDate
                  ? daysBetween(inj.startDate, inj.recoveredDate)
                  : 0;
                return (
                  <article
                    key={inj.id}
                    className="group rounded-lg border border-line bg-bg/30 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-muted">
                          ✓ {inj.bodyPart}
                        </span>
                        {inj.description && (
                          <p className="mt-0.5 text-xs text-muted">{inj.description}</p>
                        )}
                        <p className="mt-1 text-xs text-muted">
                          Recovered in {durationLabel(recDays)}
                          {inj.recoveredDate && ` · ${prettyDate(inj.recoveredDate)}`}
                        </p>
                      </div>
                      <PainSparkline checkIns={inj.checkIns} />
                    </div>
                    <div className="mt-2 flex gap-3 text-xs opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => reopen(inj)} className="text-muted hover:text-amber">
                        Reopen
                      </button>
                      <button onClick={() => startEdit(inj)} className="text-muted hover:text-ink">
                        Edit
                      </button>
                      <button
                        onClick={() => uid && deleteItem(uid, "injuries", inj.id)}
                        className="text-muted hover:text-coral"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
