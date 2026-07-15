"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type { AnnieGrowth as Growth } from "@/lib/types";
import { ageInMonths, lbOzToKg, inToCm, percentileFor, ordinal, type GrowthKind } from "@/lib/growth";
import { ageLabel, prettyDate, shortDate, todayStr } from "@/lib/dates";
import AnnieGrowthChart, { type GrowthPoint } from "@/components/charts/AnnieGrowthChart";

const KINDS: { key: GrowthKind; label: string; color: string }[] = [
  { key: "weight", label: "Weight", color: "text-indigo" },
  { key: "length", label: "Length", color: "text-teal" },
  { key: "head", label: "Head", color: "text-coral" },
];

// Manual-override field name for each metric.
const MANUAL: Record<GrowthKind, keyof Growth> = {
  weight: "weightPctManual",
  length: "lengthPctManual",
  head: "headPctManual",
};

// The metric measurement in WHO units (kg / cm), or null if this entry doesn't have it.
function metricValue(kind: GrowthKind, e: Growth): number | null {
  if (kind === "weight") {
    if (e.weightLb == null && e.weightOz == null) return null;
    return lbOzToKg(e.weightLb ?? 0, e.weightOz ?? 0);
  }
  if (kind === "length") return e.lengthIn == null ? null : inToCm(e.lengthIn);
  return e.headCm ?? null;
}

function hasMetric(kind: GrowthKind, e: Growth): boolean {
  return metricValue(kind, e) != null;
}

// Human-readable measurement, e.g. "16 lb 12 oz", "27.5 in", "42 cm".
function formatValue(kind: GrowthKind, e: Growth): string {
  if (kind === "weight") {
    const lb = e.weightLb;
    const oz = e.weightOz;
    if (lb != null && oz != null && oz !== 0) return `${lb} lb ${oz} oz`;
    if (lb != null) return `${lb} lb`;
    if (oz != null) return `${oz} oz`;
    return "—";
  }
  if (kind === "length") return e.lengthIn != null ? `${e.lengthIn} in` : "—";
  return e.headCm != null ? `${e.headCm} cm` : "—";
}

// Percentile for an entry: the doctor's stated number if pinned, else computed.
function pctFor(kind: GrowthKind, e: Growth): number | null {
  const manual = e[MANUAL[kind]] as number | null | undefined;
  if (manual != null) return manual;
  return percentileFor(kind, ageInMonths(e.date), metricValue(kind, e));
}

const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export default function AnnieGrowth() {
  const { data: entries, uid } = useCollection<Growth>("annieGrowth");
  const [kind, setKind] = useState<GrowthKind>("weight");
  const [showForm, setShowForm] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyForm = () => ({
    date: todayStr(),
    weightLb: "",
    weightOz: "",
    lengthIn: "",
    headCm: "",
    note: "",
    weightPctManual: "",
    lengthPctManual: "",
    headPctManual: "",
  });
  const [form, setForm] = useState(emptyForm);

  // Newest first for tiles + history; oldest first feeds the chart.
  const byDateDesc = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );

  const chartPoints: GrowthPoint[] = useMemo(
    () =>
      entries
        .filter((e) => hasMetric(kind, e))
        .map((e) => ({
          ageMonths: ageInMonths(e.date),
          valueMetric: metricValue(kind, e) as number,
          dateLabel: prettyDate(e.date),
        })),
    [entries, kind],
  );

  // Latest entry that actually has each metric, for the summary tiles.
  const latest = useMemo(() => {
    const out: Partial<Record<GrowthKind, Growth>> = {};
    for (const k of KINDS) out[k.key] = byDateDesc.find((e) => hasMetric(k.key, e));
    return out;
  }, [byDateDesc]);

  function openForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowManual(false);
    setShowForm(true);
  }

  function startEdit(e: Growth) {
    const str = (v: number | null | undefined) => (v == null ? "" : String(v));
    setForm({
      date: e.date,
      weightLb: str(e.weightLb),
      weightOz: str(e.weightOz),
      lengthIn: str(e.lengthIn),
      headCm: str(e.headCm),
      note: e.note ?? "",
      weightPctManual: str(e.weightPctManual),
      lengthPctManual: str(e.lengthPctManual),
      headPctManual: str(e.headPctManual),
    });
    setEditingId(e.id);
    setShowManual(
      e.weightPctManual != null || e.lengthPctManual != null || e.headPctManual != null,
    );
    setShowForm(true);
  }

  function closeForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.date || !uid) return;
    const payload: Record<string, unknown> = {
      date: form.date,
      weightLb: numOrNull(form.weightLb),
      weightOz: numOrNull(form.weightOz),
      lengthIn: numOrNull(form.lengthIn),
      headCm: numOrNull(form.headCm),
      note: form.note.trim() || null,
      weightPctManual: numOrNull(form.weightPctManual),
      lengthPctManual: numOrNull(form.lengthPctManual),
      headPctManual: numOrNull(form.headPctManual),
    };
    if (editingId) await updateItem(uid, "annieGrowth", editingId, payload);
    else await addItem(uid, "annieGrowth", payload);
    closeForm();
  }

  async function remove(e: Growth) {
    if (!uid) return;
    await deleteItem(uid, "annieGrowth", e.id);
  }

  // Live percentile preview for a metric as it's typed into the form.
  function previewPct(k: GrowthKind): number | null {
    const months = ageInMonths(form.date);
    if (k === "weight") {
      const lb = numOrNull(form.weightLb);
      const oz = numOrNull(form.weightOz);
      if (lb == null && oz == null) return null;
      return percentileFor("weight", months, lbOzToKg(lb ?? 0, oz ?? 0));
    }
    if (k === "length") {
      const v = numOrNull(form.lengthIn);
      return v == null ? null : percentileFor("length", months, inToCm(v));
    }
    const v = numOrNull(form.headCm);
    return v == null ? null : percentileFor("head", months, v);
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="section-title">Growth</h2>
          <span className="text-xs text-muted">{entries.length} measurements</span>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : openForm())}
          className="btn-primary shrink-0 px-3 py-1.5 text-xs"
        >
          {showForm ? "Close" : "+ Measurement"}
        </button>
      </div>

      {/* Summary tiles: latest value + percentile for each metric */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {KINDS.map((k) => {
          const e = latest[k.key];
          const pct = e ? pctFor(k.key, e) : null;
          return (
            <div key={k.key} className="rounded-lg border border-line bg-bg/50 p-3 text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                {k.label}
              </div>
              <div className={`mt-1 text-sm font-bold ${k.color}`}>
                {e ? formatValue(k.key, e) : "—"}
              </div>
              <div className="text-xs text-muted">
                {pct != null ? `${ordinal(pct)} pct` : e ? "" : "no data"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Metric toggle */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              kind === k.key
                ? "border-pink bg-pink/10 text-ink"
                : "border-line bg-card text-muted hover:text-ink"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {chartPoints.length > 0 ? (
        <>
          <AnnieGrowthChart kind={kind} points={chartPoints} />
          <p className="mt-1 text-center text-[11px] text-muted">
            Dashed lines: WHO girls 3rd–97th percentile · solid tan: median · blue: Annie
          </p>
        </>
      ) : (
        <p className="py-8 text-center text-sm text-muted">
          No {KINDS.find((k) => k.key === kind)?.label.toLowerCase()} logged yet.
        </p>
      )}

      {/* Add / edit form */}
      {showForm && (
        <form onSubmit={save} className="mt-4 space-y-3 rounded-lg border border-line bg-bg/50 p-4">
          <label className="block text-xs font-semibold text-muted">
            Date
            <input
              type="date"
              className="input mt-1"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
            <span className="mt-0.5 block font-normal text-muted">
              At this date she&apos;s {ageLabel(form.date)} old.
            </span>
          </label>

          <div>
            <span className="text-xs font-semibold text-muted">Weight</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="lb"
                className="input"
                value={form.weightLb}
                onChange={(e) => setForm({ ...form, weightLb: e.target.value })}
              />
              <span className="text-xs text-muted">lb</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="oz"
                className="input"
                value={form.weightOz}
                onChange={(e) => setForm({ ...form, weightOz: e.target.value })}
              />
              <span className="text-xs text-muted">oz</span>
            </div>
            {previewPct("weight") != null && (
              <span className="mt-0.5 block text-xs text-indigo">
                ≈ {ordinal(previewPct("weight") as number)} percentile
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="flex-1 text-xs font-semibold text-muted">
              Length (in)
              <input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="in"
                className="input mt-1"
                value={form.lengthIn}
                onChange={(e) => setForm({ ...form, lengthIn: e.target.value })}
              />
              {previewPct("length") != null && (
                <span className="mt-0.5 block font-normal text-teal">
                  ≈ {ordinal(previewPct("length") as number)} pct
                </span>
              )}
            </label>
            <label className="flex-1 text-xs font-semibold text-muted">
              Head circ. (cm)
              <input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="cm"
                className="input mt-1"
                value={form.headCm}
                onChange={(e) => setForm({ ...form, headCm: e.target.value })}
              />
              {previewPct("head") != null && (
                <span className="mt-0.5 block font-normal text-coral">
                  ≈ {ordinal(previewPct("head") as number)} pct
                </span>
              )}
            </label>
          </div>

          <label className="block text-xs font-semibold text-muted">
            Note (optional)
            <input
              type="text"
              placeholder="e.g. 9 month appointment"
              className="input mt-1"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>

          {showManual ? (
            <div className="rounded-lg border border-line bg-card/60 p-3">
              <p className="mb-2 text-xs font-semibold text-muted">
                Doctor&apos;s stated percentiles (optional — override the computed values)
              </p>
              <div className="flex flex-wrap gap-3">
                {KINDS.map((k) => {
                  const field = `${k.key}PctManual` as
                    | "weightPctManual"
                    | "lengthPctManual"
                    | "headPctManual";
                  return (
                    <label key={k.key} className="flex-1 text-xs font-semibold text-muted">
                      {k.label} %
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        placeholder="pct"
                        className="input mt-1"
                        value={form[field]}
                        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="text-xs font-semibold text-indigo"
            >
              + Add doctor&apos;s percentiles
            </button>
          )}

          <button type="submit" className="btn-primary w-full">
            {editingId ? "Save changes" : "Add measurement"}
          </button>
        </form>
      )}

      {/* History */}
      {byDateDesc.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {byDateDesc.map((e) => (
            <div
              key={e.id}
              className="group flex items-center justify-between gap-2 rounded-lg border border-line bg-bg/50 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{shortDate(e.date)}</span>
                  <span className="text-xs text-muted">{ageLabel(e.date)}</span>
                  {e.note && <span className="truncate text-xs text-muted">· {e.note}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  {KINDS.filter((k) => hasMetric(k.key, e)).map((k) => {
                    const pct = pctFor(k.key, e);
                    return (
                      <span key={k.key}>
                        <span className={k.color}>{formatValue(k.key, e)}</span>
                        {pct != null && ` (${ordinal(pct)})`}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex shrink-0 gap-2 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={() => startEdit(e)}
                  className="text-xs text-muted hover:text-ink"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(e)}
                  className="text-xs text-muted hover:text-coral"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
