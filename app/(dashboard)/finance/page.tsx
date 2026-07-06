"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { orderBy } from "firebase/firestore";
import { useCollection, addItem, setItem, updateItem, deleteItem, bulkSet } from "@/lib/data";
import type { FinanceCategory, FinanceRecurring, FinanceSnapshot, FinanceTransaction } from "@/lib/types";
import { todayStr, shortDate } from "@/lib/dates";
import {
  FINANCE_CATEGORIES,
  CATEGORY_COLOR,
  aggregateMonth,
  buildTxnDocs,
  detectFormat,
  feedCoverage,
  fmtUSD,
  matchAmazonOrders,
  monthLabel,
  parseAmazonDigitalOrders,
  parseAmazonOrders,
  parseCsv,
  parseTransactions,
  resolveMonthTotals,
} from "@/lib/finance";
import FinanceCategoryChart from "@/components/charts/FinanceCategoryChart";
import FinanceTrendChart, { type TrendPoint } from "@/components/charts/FinanceTrendChart";
import FinanceTable from "@/components/FinanceTable";
import PlaidConnect from "@/components/PlaidConnect";

const pad2 = (n: number) => String(n).padStart(2, "0");
const thisMonth = () => todayStr().slice(0, 7);

type ImportPreview =
  | {
      kind: "txns";
      format: "capitalone" | "chase";
      newDocs: { id: string; data: Record<string, unknown> }[];
      dupCount: number;
      excludedCount: number;
      dateMin: string;
      dateMax: string;
    }
  | { kind: "amazon"; updates: { id: string; note: string }[]; orderCount: number; unmatchedCount: number }
  | { kind: "error"; message: string };

export default function FinancePage() {
  const { data: txns, uid } = useCollection<FinanceTransaction>("financeTransactions");
  const { data: snapshots } = useCollection<FinanceSnapshot>("financeSnapshots");
  const { data: recurring } = useCollection<FinanceRecurring>("financeRecurring", [orderBy("sortOrder", "asc")]);

  const [month, setMonth] = useState(thisMonth());
  const [view, setView] = useState<"dashboard" | "table">("dashboard");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [plaidCount, setPlaidCount] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [catScope, setCatScope] = useState<"month" | "year">("month");
  const fileRef = useRef<HTMLInputElement>(null);

  // Months available in the selector: every month with data, plus the current one.
  const months = useMemo(() => {
    const set = new Set<string>([thisMonth(), month]);
    txns.forEach((t) => set.add(t.month));
    snapshots.forEach((s) => set.add(s.month));
    return Array.from(set).sort().reverse();
  }, [txns, snapshots, month]);

  const monthTxns = useMemo(
    () => txns.filter((t) => t.month === month).sort((a, b) => b.date.localeCompare(a.date)),
    [txns, month]
  );
  const agg = useMemo(() => aggregateMonth(monthTxns), [monthTxns]);
  const snapshot = useMemo(() => snapshots.find((s) => s.month === month), [snapshots, month]);

  // Headline income/spend: trust transactions only for fully-covered months, else
  // the snapshot (fixes the partial first Plaid month, e.g. late-March-only data).
  const coverage = useMemo(() => feedCoverage(txns), [txns]);
  const totals = useMemo(
    () => resolveMonthTotals(month, monthTxns, snapshot, coverage),
    [month, monthTxns, snapshot, coverage]
  );
  const savingsPct = totals.income > 0 ? (totals.income - totals.spend) / totals.income : null;

  // Year-to-date aggregation for the selected month's year (e.g. all of 2026).
  const year = month.slice(0, 4);
  const yearAgg = useMemo(
    () => aggregateMonth(txns.filter((t) => t.month.startsWith(`${year}-`))),
    [txns, year]
  );

  // Chronological per-month series for the trend charts. Income/spend come from
  // transactions when present, else fall back to the snapshot's stored totals.
  const trendPoints: TrendPoint[] = useMemo(() => {
    const all = new Set<string>();
    txns.forEach((t) => all.add(t.month));
    snapshots.forEach((s) => all.add(s.month));
    const cov = feedCoverage(txns);
    return Array.from(all)
      .sort()
      .map((m) => {
        const mTxns = txns.filter((t) => t.month === m);
        const snap = snapshots.find((s) => s.month === m);
        const { income, spend } = resolveMonthTotals(m, mTxns, snap, cov);
        return {
          month: m,
          income,
          spend,
          bitcoin: snap?.bitcoin ?? 0,
          ira: snap?.ira ?? 0,
          savings: snap?.savings ?? 0,
        };
      });
  }, [txns, snapshots]);

  // ── CSV import ──────────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setPreview(null);
    const text = await file.text();
    const { header } = parseCsv(text);
    const format = detectFormat(header);

    if (format === "amazon") {
      // Retail order history and the DSAR digital-content export share the format
      // detection; each parser returns [] for the other's file.
      const orders = [...parseAmazonOrders(text), ...parseAmazonDigitalOrders(text)];
      const amazonCharges = txns.filter((t) => /amazon|amzn/i.test(t.description) && !t.excluded);
      const updates = matchAmazonOrders(amazonCharges, orders);
      setPreview({ kind: "amazon", updates, orderCount: orders.length, unmatchedCount: amazonCharges.length - updates.length });
      return;
    }
    if (format === "capitalone" || format === "chase") {
      const { txns: parsed } = parseTransactions(text);
      const docs = buildTxnDocs(parsed, new Date().toISOString());
      const existing = new Set(txns.map((t) => t.id));
      const newDocs = docs.filter((d) => !existing.has(d.id));
      const dates = parsed.map((p) => p.date).sort();
      setPreview({
        kind: "txns",
        format,
        newDocs,
        dupCount: docs.length - newDocs.length,
        excludedCount: parsed.filter((p) => p.excluded).length,
        dateMin: dates[0] ?? "",
        dateMax: dates[dates.length - 1] ?? "",
      });
      return;
    }
    setPreview({ kind: "error", message: "Unrecognized CSV. Expected a Capital One, Chase, or Amazon order export." });
  }

  async function confirmImport() {
    if (!uid || !preview) return;
    setBusy(true);
    try {
      if (preview.kind === "txns") {
        await bulkSet(uid, "financeTransactions", preview.newDocs);
      } else if (preview.kind === "amazon") {
        await bulkSet(
          uid,
          "financeTransactions",
          preview.updates.map((u) => ({ id: u.id, data: { note: u.note } })),
          true
        );
      }
    } finally {
      setBusy(false);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Finance</h1>
          <p className="text-sm text-muted">Where the money went, and where it&apos;s growing.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
            {(
              [
                ["dashboard", "Dashboard"],
                ["table", "Table"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  view === v ? "bg-card text-ink shadow-card" : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "dashboard" && (
            <select className="input w-auto font-semibold" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {view === "table" && <FinanceTable snapshots={snapshots} txns={txns} />}

      {view === "dashboard" && (
        <>
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Income" value={fmtUSD(totals.income)} accent="text-teal" />
        <Stat label="Spend" value={fmtUSD(totals.spend)} accent="text-coral" />
        <Stat
          label="Net saved"
          value={fmtUSD(totals.income - totals.spend)}
          accent={totals.income - totals.spend >= 0 ? "text-teal" : "text-coral"}
        />
        <Stat
          label="Savings rate"
          value={savingsPct === null ? "—" : `${Math.round(savingsPct * 100)}%`}
          accent="text-indigo"
        />
      </div>

      {/* Connected accounts (Plaid) */}
      <PlaidConnect onItemsLoaded={(items) => setPlaidCount(items.length)} />

      {/* Import — once a bank is connected, collapse CSV to a fallback so the same
          account isn't double-imported via both Plaid and a manual upload. */}
      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">
            {plaidCount > 0 ? "Manual CSV import" : "Import transactions"}
          </h2>
          {plaidCount > 0 && !showImport ? (
            <button className="btn-ghost" onClick={() => setShowImport(true)}>
              Show
            </button>
          ) : (
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              Upload CSV
            </button>
          )}
        </div>
        {plaidCount > 0 && (
          <p className="text-xs text-muted">
            You have connected accounts syncing automatically. Only upload a CSV for an account you{" "}
            <strong>haven&apos;t</strong> connected, or to enrich Amazon charges — uploading a connected account&apos;s
            export would double-count it.
          </p>
        )}
        {(plaidCount === 0 || showImport) && (
        <>
        <p className="text-xs text-muted">
          Drop a monthly <strong>Capital One</strong> or <strong>Chase</strong> export to load transactions, or an{" "}
          <strong>Amazon order history</strong> export to attach item names to your Amazon charges.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
          }}
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-lg border border-dashed border-line bg-bg px-4 py-6 text-center text-sm text-muted hover:border-indigo"
        >
          Drop a .csv here or click to choose a file
        </div>

        {preview?.kind === "error" && <p className="text-sm font-medium text-coral">{preview.message}</p>}
        {preview?.kind === "txns" && (
          <div className="rounded-lg border border-line bg-bg p-3 text-sm">
            <p className="font-semibold capitalize">{preview.format} export</p>
            <p className="text-muted">
              {preview.newDocs.length} new · {preview.dupCount} duplicate{preview.dupCount === 1 ? "" : "s"} skipped ·{" "}
              {preview.excludedCount} transfer/payment row{preview.excludedCount === 1 ? "" : "s"}
              {preview.dateMin && ` · ${shortDate(preview.dateMin)} → ${shortDate(preview.dateMax)}`}
            </p>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary" disabled={busy || preview.newDocs.length === 0} onClick={confirmImport}>
                {busy ? "Importing…" : `Import ${preview.newDocs.length}`}
              </button>
              <button className="btn-ghost" onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {preview?.kind === "amazon" && (
          <div className="rounded-lg border border-line bg-bg p-3 text-sm">
            <p className="font-semibold">Amazon order history</p>
            <p className="text-muted">
              {preview.orderCount} orders read · {preview.updates.length} Amazon charge
              {preview.updates.length === 1 ? "" : "s"} will be labeled with their items
              {preview.unmatchedCount > 0 ? ` · ${preview.unmatchedCount} left unmatched` : ""}
            </p>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary" disabled={busy || preview.updates.length === 0} onClick={confirmImport}>
                {busy ? "Saving…" : `Enrich ${preview.updates.length}`}
              </button>
              <button className="btn-ghost" onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        </>
        )}
      </section>

      {/* Quick add + recurring */}
      <QuickAddAndRecurring uid={uid} month={month} recurring={recurring} txns={txns} />

      {/* Category breakdown */}
      {(() => {
        const catAgg = catScope === "year" ? yearAgg : agg;
        const scopeLabel = catScope === "year" ? year : monthLabel(month);
        return (
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Spending by category · {scopeLabel}</h2>
              <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
                {(
                  [
                    ["month", "This month"],
                    ["year", year],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setCatScope(v)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      catScope === v ? "bg-card text-ink shadow-card" : "text-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <FinanceCategoryChart byCategory={catAgg.byCategory} />
            {catAgg.byCategory.length > 0 && (
              <div className="mt-4 divide-y divide-line border-t border-line">
                {catAgg.byCategory.map((c) => (
                  <div key={c.category} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLOR[c.category] }} />
                      {c.category}
                    </span>
                    <span className="tabular-nums font-semibold">
                      {fmtUSD(c.amount)}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {catAgg.spend > 0 ? Math.round((c.amount / catAgg.spend) * 100) : 0}%
                      </span>
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-1.5 text-sm font-bold">
                  <span>Total spend · {scopeLabel}</span>
                  <span className="tabular-nums">{fmtUSD(catAgg.spend)}</span>
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* Trends */}
      <section className="card p-4">
        <h2 className="section-title mb-3">Over time</h2>
        <FinanceTrendChart points={trendPoints} />
      </section>

      {/* Monthly snapshot (investments) */}
      <SnapshotEditor uid={uid} month={month} snapshot={snapshot} />

      {/* Transactions */}
      <TransactionList uid={uid} monthTxns={monthTxns} month={month} />
        </>
      )}
    </div>
  );
}

// ── Headline stat card ─────────────────────────────────────────────────────────
function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card p-4">
      <div className={`text-xl font-extrabold tracking-tight ${accent}`}>{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
  className = "",
}: {
  value: FinanceCategory;
  onChange: (c: FinanceCategory) => void;
  className?: string;
}) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value as FinanceCategory)}>
      {FINANCE_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

// ── Quick add + recurring ──────────────────────────────────────────────────────
function QuickAddAndRecurring({
  uid,
  month,
  recurring,
  txns,
}: {
  uid: string | null;
  month: string;
  recurring: FinanceRecurring[];
  txns: FinanceTransaction[];
}) {
  const [open, setOpen] = useState(false);
  // quick-add form
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<FinanceCategory>("Chase Discretionary");
  const [income, setIncome] = useState(false);
  const [note, setNote] = useState("");
  // recurring add form
  const [rLabel, setRLabel] = useState("");
  const [rAmount, setRAmount] = useState("");
  const [rCat, setRCat] = useState<FinanceCategory>("Rent");
  const [rDay, setRDay] = useState("1");

  async function addTxn(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!uid || !desc.trim() || !Number.isFinite(amt) || amt === 0) return;
    await addItem(uid, "financeTransactions", {
      date,
      month: date.slice(0, 7),
      description: desc.trim(),
      amount: income ? Math.abs(amt) : -Math.abs(amt),
      category: income ? "Income" : cat,
      source: "manual",
      excluded: false,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setAmount("");
    setDesc("");
    setNote("");
  }

  async function addRecurring(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(rAmount);
    if (!uid || !rLabel.trim() || !Number.isFinite(amt) || amt <= 0) return;
    const minOrder = recurring.reduce((m, r) => Math.min(m, r.sortOrder), 0);
    await addItem(uid, "financeRecurring", {
      label: rLabel.trim(),
      amount: Math.abs(amt),
      category: rCat,
      dayOfMonth: Math.min(28, Math.max(1, parseInt(rDay) || 1)),
      active: true,
      sortOrder: minOrder - 1,
    });
    setRLabel("");
    setRAmount("");
  }

  // Insert each active recurring item as this month's transaction (idempotent:
  // deterministic id per month so re-clicking doesn't double-add).
  async function addThisMonth() {
    if (!uid) return;
    const docs = recurring
      .filter((r) => r.active)
      .map((r) => {
        const day = pad2(Math.min(28, Math.max(1, r.dayOfMonth ?? 1)));
        return {
          id: `recurring_${month}_${r.id}`,
          data: {
            date: `${month}-${day}`,
            month,
            description: r.label,
            amount: -Math.abs(r.amount),
            category: r.category,
            source: "recurring" as const,
            excluded: false,
            createdAt: new Date().toISOString(),
          },
        };
      });
    if (docs.length) await bulkSet(uid, "financeTransactions", docs);
  }

  const alreadyAdded = recurring
    .filter((r) => r.active)
    .every((r) => txns.some((t) => t.id === `recurring_${month}_${r.id}`));

  return (
    <section className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Add expenses</h2>
        <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Add / recurring"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Log one-offs that never hit the card (Venmo, Zelle, cash), and manage fixed monthly bills like rent.
      </p>

      {open && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Quick add */}
          <form onSubmit={addTxn} className="space-y-2 rounded-lg border border-line bg-bg p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">One-off transaction</p>
            <div className="flex gap-2">
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <input className="input" placeholder="Description (e.g. Venmo — Sarah)" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <div className="flex gap-2">
              <CategorySelect value={cat} onChange={setCat} className="input flex-1" />
              <label className="flex items-center gap-1.5 px-1 text-sm text-muted">
                <input type="checkbox" checked={income} onChange={(e) => setIncome(e.target.checked)} /> Income
              </label>
            </div>
            <button className="btn-primary w-full" type="submit">
              Add transaction
            </button>
          </form>

          {/* Recurring */}
          <div className="space-y-2 rounded-lg border border-line bg-bg p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recurring bills</p>
              <button
                className="text-xs font-semibold text-indigo hover:underline disabled:text-muted"
                onClick={addThisMonth}
                disabled={!recurring.some((r) => r.active) || alreadyAdded}
              >
                {alreadyAdded ? "Added this month ✓" : "Add this month"}
              </button>
            </div>
            {recurring.length === 0 && <p className="text-sm text-muted">No recurring bills yet.</p>}
            {recurring.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className={r.active ? "" : "text-muted line-through"}>
                  {r.label} · {fmtUSD(r.amount)}
                </span>
                <span className="flex items-center gap-2">
                  <button
                    className="text-xs text-muted hover:text-ink"
                    onClick={() => uid && updateItem(uid, "financeRecurring", r.id, { active: !r.active })}
                  >
                    {r.active ? "pause" : "resume"}
                  </button>
                  <button
                    className="text-xs text-muted hover:text-coral"
                    onClick={() => uid && deleteItem(uid, "financeRecurring", r.id)}
                  >
                    ×
                  </button>
                </span>
              </div>
            ))}
            <form onSubmit={addRecurring} className="flex flex-wrap gap-2 border-t border-line pt-2">
              <input className="input flex-1" placeholder="Bill (e.g. Rent)" value={rLabel} onChange={(e) => setRLabel(e.target.value)} />
              <input
                className="input w-24"
                type="number"
                step="0.01"
                placeholder="$/mo"
                value={rAmount}
                onChange={(e) => setRAmount(e.target.value)}
              />
              <input
                className="input w-16"
                type="number"
                min="1"
                max="28"
                placeholder="Day"
                value={rDay}
                onChange={(e) => setRDay(e.target.value)}
              />
              <CategorySelect value={rCat} onChange={setRCat} className="input w-32" />
              <button className="btn-ghost" type="submit">
                Add bill
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Monthly snapshot editor ────────────────────────────────────────────────────
function SnapshotEditor({
  uid,
  month,
  snapshot,
}: {
  uid: string | null;
  month: string;
  snapshot: FinanceSnapshot | undefined;
}) {
  const [bitcoin, setBitcoin] = useState("");
  const [ira, setIra] = useState("");
  const [savings, setSavings] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  // Reload fields when the selected month (or its snapshot) changes.
  useEffect(() => {
    setBitcoin(snapshot?.bitcoin != null ? String(snapshot.bitcoin) : "");
    setIra(snapshot?.ira != null ? String(snapshot.ira) : "");
    setSavings(snapshot?.savings != null ? String(snapshot.savings) : "");
    setNotes(snapshot?.notes ?? "");
    setSaved(false);
  }, [month, snapshot]);

  const numOrUndef = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : undefined;
  };

  async function save() {
    if (!uid) return;
    await setItem(uid, "financeSnapshots", month, {
      month,
      bitcoin: numOrUndef(bitcoin) ?? null,
      ira: numOrUndef(ira) ?? null,
      savings: numOrUndef(savings) ?? null,
      notes: notes.trim(),
      updatedAt: new Date().toISOString(),
      ...(snapshot ? {} : { createdAt: new Date().toISOString() }),
    });
    setSaved(true);
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="section-title">Balances · {monthLabel(month)}</h2>
      <p className="text-xs text-muted">Month-end investment & savings balances — these feed the net-worth chart.</p>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs font-semibold text-muted">
          Bitcoin
          <input className="input mt-1" type="number" step="0.01" value={bitcoin} onChange={(e) => setBitcoin(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-muted">
          IRA
          <input className="input mt-1" type="number" step="0.01" value={ira} onChange={(e) => setIra(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-muted">
          Savings
          <input className="input mt-1" type="number" step="0.01" value={savings} onChange={(e) => setSavings(e.target.value)} />
        </label>
      </div>
      <textarea
        className="input min-h-[60px]"
        placeholder="Notable items this month (like the spreadsheet footnotes)…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button className="btn-primary" onClick={save}>
        {saved ? "Saved ✓" : "Save balances"}
      </button>
    </section>
  );
}

// ── Transaction list ───────────────────────────────────────────────────────────
function TransactionList({
  uid,
  monthTxns,
  month,
}: {
  uid: string | null;
  monthTxns: FinanceTransaction[];
  month: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FinanceCategory | "all">("all");
  const [sort, setSort] = useState<"date" | "amount">("date");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // What to show as the name: a user rename wins over Plaid's (sometimes masked) text.
  const nameOf = (t: FinanceTransaction) =>
    t.descriptionOverride && t.descriptionOverride.trim() ? t.descriptionOverride : t.description;

  async function saveRename(t: FinanceTransaction) {
    setEditingId(null);
    if (!uid) return;
    const v = editValue.trim();
    // Empty or unchanged → clear the override (fall back to the original).
    const next = !v || v === t.description ? "" : v;
    if (next !== (t.descriptionOverride ?? "")) {
      await updateItem(uid, "financeTransactions", t.id, { descriptionOverride: next });
    }
  }

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = monthTxns.filter(
      (t) =>
        (filter === "all" || t.category === filter) &&
        (!q ||
          t.description.toLowerCase().includes(q) ||
          (t.descriptionOverride ?? "").toLowerCase().includes(q) ||
          (t.note ?? "").toLowerCase().includes(q))
    );
    // "Largest spend" → biggest expense first (amounts are negative for spend);
    // "date" keeps the parent's newest-first order.
    return sort === "amount" ? [...filtered].sort((a, b) => a.amount - b.amount) : filtered;
  }, [monthTxns, search, filter, sort]);

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">Transactions · {monthLabel(month)}</h2>
        <div className="flex gap-2">
          <input className="input w-40" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input w-32" value={filter} onChange={(e) => setFilter(e.target.value as FinanceCategory | "all")}>
            <option value="all">All</option>
            {FINANCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="input w-36" value={sort} onChange={(e) => setSort(e.target.value as "date" | "amount")}>
            <option value="date">Newest first</option>
            <option value="amount">Largest spend</option>
          </select>
        </div>
      </div>

      {rows.length === 0 && <p className="py-6 text-center text-sm text-muted">No transactions for this month yet.</p>}

      <div className="divide-y divide-line">
        {rows.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 py-2 text-sm ${t.excluded ? "opacity-50" : ""}`}>
            <span className="w-12 shrink-0 text-xs text-muted">{shortDate(t.date)}</span>
            <div className="min-w-0 flex-1">
              {editingId === t.id ? (
                <input
                  autoFocus
                  className="w-full rounded border border-line px-1.5 py-0.5 text-sm outline-none focus:border-indigo"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => saveRename(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(t);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <button
                  className="block max-w-full truncate text-left font-medium hover:text-indigo"
                  title="Click to rename"
                  onClick={() => {
                    setEditingId(t.id);
                    setEditValue(nameOf(t));
                  }}
                >
                  {nameOf(t)}
                  {t.descriptionOverride && t.descriptionOverride.trim() && (
                    <span className="ml-1 text-[10px] text-muted" title="Renamed">✎</span>
                  )}
                </button>
              )}
              {t.note && <div className="truncate text-xs text-muted">{t.note}</div>}
            </div>
            <span
              className="hidden h-2 w-2 shrink-0 rounded-full sm:block"
              style={{ background: CATEGORY_COLOR[t.category] }}
              title={t.category}
            />
            <select
              className="hidden rounded-md border border-line bg-card px-1.5 py-1 text-xs sm:block"
              value={t.category}
              onChange={(e) => uid && updateItem(uid, "financeTransactions", t.id, { category: e.target.value })}
            >
              {FINANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className={`w-20 shrink-0 text-right font-semibold ${t.amount >= 0 ? "text-teal" : "text-ink"}`}>
              {t.amount >= 0 ? "+" : ""}
              {fmtUSD(t.amount, true)}
            </span>
            <button
              className="shrink-0 text-xs text-muted hover:text-amber"
              title={t.excluded ? "Include in totals" : "Exclude from totals"}
              onClick={() => uid && updateItem(uid, "financeTransactions", t.id, { excluded: !t.excluded })}
            >
              {t.excluded ? "incl" : "excl"}
            </button>
            <button
              className="shrink-0 text-muted hover:text-coral"
              onClick={() => uid && deleteItem(uid, "financeTransactions", t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
