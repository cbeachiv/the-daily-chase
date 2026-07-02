"use client";

import { useMemo } from "react";
import type { FinanceSnapshot, FinanceTransaction } from "@/lib/types";
import { aggregateMonth, feedCoverage, fmtUSD, monthLabel, DEFAULT_HUGGA } from "@/lib/finance";

// A spreadsheet-style month-over-month grid (newest month first), mirroring the
// budget Google Sheet: income, savings balance + monthly change, investments,
// rent/spend, and a computed net-worth row. Numbers come from transactions when a
// month has them, else from that month's stored snapshot totals.

interface Col {
  month: string;
  income?: number;
  totalSpend?: number;
  rent?: number;
  cardSpend?: number;
  savings?: number;
  savingsAmount?: number; // change vs the prior (older) month
  savingsPct?: number; // savingsAmount / income
  bitcoin?: number;
  ira?: number;
  hugga?: number;
  netWorth?: number;
}

const sum = (xs: (number | undefined)[]) => {
  const defined = xs.filter((x): x is number => typeof x === "number");
  return defined.length ? defined.reduce((s, x) => s + x, 0) : undefined;
};

export default function FinanceTable({
  snapshots,
  txns,
}: {
  snapshots: FinanceSnapshot[];
  txns: FinanceTransaction[];
}) {
  const cols = useMemo<Col[]>(() => {
    const months = new Set<string>();
    snapshots.forEach((s) => months.add(s.month));
    txns.forEach((t) => months.add(t.month));
    const asc = Array.from(months).sort();

    const cov = feedCoverage(txns);
    const built: Col[] = asc.map((month) => {
      const mTxns = txns.filter((t) => t.month === month);
      const snap = snapshots.find((s) => s.month === month);
      // Transactions only for months the feed fully covers; otherwise the
      // snapshot's stored totals (pre-feed history + the partial boundary month).
      const fullyCovered = cov !== null && (month > cov.month || (month === cov.month && cov.full));
      const agg = fullyCovered && mTxns.length ? aggregateMonth(mTxns) : null;
      const income = agg ? agg.income : snap?.income;
      const totalSpend = agg ? agg.spend : snap?.spend;
      const rent = snap?.rent;
      const cardSpend = totalSpend != null && rent != null ? totalSpend - rent : undefined;
      // Hugga is a fixed $5,000 holding: default it for any month that has a
      // snapshot but no explicit value. Months with no snapshot stay blank.
      const hugga = snap ? snap.hugga ?? DEFAULT_HUGGA : undefined;
      return {
        month,
        income,
        totalSpend,
        rent,
        cardSpend,
        savings: snap?.savings,
        bitcoin: snap?.bitcoin,
        ira: snap?.ira,
        hugga,
        netWorth: sum([snap?.savings, snap?.bitcoin, snap?.ira, hugga]),
      };
    });

    // Month-over-month savings change + rate (needs the prior, older month).
    for (let i = 0; i < built.length; i++) {
      const prev = built[i - 1];
      if (built[i].savings != null && prev?.savings != null) {
        const delta = built[i].savings! - prev.savings!;
        built[i].savingsAmount = delta;
        if (built[i].income) built[i].savingsPct = delta / built[i].income!;
      }
    }

    return built.reverse(); // newest first, like the sheet
  }, [snapshots, txns]);

  if (cols.length === 0) {
    return <p className="card p-6 text-center text-sm text-muted">No monthly data yet.</p>;
  }

  const money = (n?: number) => (n == null ? "" : fmtUSD(n));
  const pct = (n?: number) => (n == null ? "" : `${(n * 100).toFixed(2)}%`);
  const signedMoney = (n?: number) => (n == null ? "" : `${n < 0 ? "−" : ""}${fmtUSD(Math.abs(n))}`);

  type Row = {
    label: string;
    get: (c: Col) => string;
    tint?: string; // row background tint
    bold?: boolean;
    signed?: (c: Col) => number | undefined; // drives red/green for signed rows
  };

  const rows: Row[] = [
    { label: "Income", get: (c) => money(c.income), tint: "bg-teal/5" },
    { label: "Savings", get: (c) => money(c.savings), tint: "bg-teal/5" },
    { label: "Savings Amount", get: (c) => signedMoney(c.savingsAmount), tint: "bg-teal/5", signed: (c) => c.savingsAmount },
    { label: "Savings %", get: (c) => pct(c.savingsPct), tint: "bg-teal/5", signed: (c) => c.savingsPct },
    { label: "Bitcoin", get: (c) => money(c.bitcoin) },
    { label: "IRA", get: (c) => money(c.ira) },
    { label: "Hugga", get: (c) => money(c.hugga) },
    { label: "Rent", get: (c) => money(c.rent), tint: "bg-amber/5" },
    { label: "Spend", get: (c) => money(c.cardSpend), tint: "bg-amber/5" },
    { label: "Total Spend", get: (c) => money(c.totalSpend), tint: "bg-amber/5" },
    { label: "Net Worth", get: (c) => money(c.netWorth), bold: true },
  ];

  return (
    <div className="card overflow-x-auto">
      <table className="w-full border-collapse text-right text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-line bg-card px-3 py-2 text-left font-semibold text-muted">
              &nbsp;
            </th>
            {cols.map((c) => (
              <th
                key={c.month}
                className="whitespace-nowrap border-b border-line bg-card px-3 py-2 font-bold text-ink"
              >
                {monthLabel(c.month)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={row.tint ?? ""}>
              <th
                className={`sticky left-0 z-10 whitespace-nowrap border-b border-line px-3 py-2 text-left font-medium ${
                  row.bold ? "font-bold text-ink" : "text-muted"
                } ${row.tint ?? "bg-card"}`}
              >
                {row.label}
              </th>
              {cols.map((c) => {
                const signedVal = row.signed?.(c);
                const color =
                  signedVal == null ? "" : signedVal < 0 ? "text-coral" : "text-teal";
                return (
                  <td
                    key={c.month}
                    className={`whitespace-nowrap border-b border-line px-3 py-2 tabular-nums ${
                      row.bold ? "font-bold text-ink" : color || "text-ink"
                    }`}
                  >
                    {row.get(c)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
