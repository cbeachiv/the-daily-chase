"use client";

import { useEffect, useState } from "react";
import { setItem } from "@/lib/data";
import type { HousePlan } from "@/lib/types";
import { HOUSE_PLAN_DOC_ID } from "@/lib/house";

// Editable affordability assumptions, persisted to users/{uid}/housePlan/mariemont.
// Local string state per field (so partial typing doesn't fight the numbers),
// reloaded whenever the doc changes elsewhere; Save writes the parsed values.
export default function AssumptionsEditor({
  uid,
  plan,
  docExists,
}: {
  uid: string | null;
  plan: HousePlan;
  docExists: boolean;
}) {
  const [form, setForm] = useState(toForm(plan));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(toForm(plan));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(toForm(plan))]);

  const set = (k: keyof ReturnType<typeof toForm>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved(false);
  };

  async function save() {
    if (!uid) return;
    const num = (s: string, fallback: number) => {
      const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : fallback;
    };
    await setItem(uid, "housePlan", HOUSE_PLAN_DOC_ID, {
      purchasePrice: num(form.purchasePrice, plan.purchasePrice),
      downPaymentPct: num(form.downPaymentPct, plan.downPaymentPct * 100) / 100,
      ratePct: num(form.ratePct, plan.ratePct),
      termYears: num(form.termYears, plan.termYears),
      closingCostPct: num(form.closingCostPct, plan.closingCostPct * 100) / 100,
      reserveMonths: num(form.reserveMonths, plan.reserveMonths),
      supportLow: num(form.supportLow, plan.supportLow),
      supportHigh: num(form.supportHigh, plan.supportHigh),
      windowStart: form.windowStart || plan.windowStart,
      windowEnd: form.windowEnd || plan.windowEnd,
      carryComfort: num(form.carryComfort, plan.carryComfort),
      propertyTaxPct: num(form.propertyTaxPct, plan.propertyTaxPct * 100) / 100,
      insurancePct: num(form.insurancePct, plan.insurancePct * 100) / 100,
      sarahDesignFee: num(form.sarahDesignFee, plan.sarahDesignFee),
      updatedAt: new Date().toISOString(),
      ...(docExists ? {} : { createdAt: new Date().toISOString() }),
    });
    setSaved(true);
  }

  const fields: [keyof ReturnType<typeof toForm>, string, string][] = [
    ["purchasePrice", "Purchase price ($)", "1300000"],
    ["downPaymentPct", "Down payment (%)", "25"],
    ["ratePct", "Mortgage rate (%)", "6.0"],
    ["termYears", "Term (years)", "30"],
    ["closingCostPct", "Closing costs (%)", "2"],
    ["reserveMonths", "Reserves (months of carry)", "6"],
    ["supportLow", "Support range low ($)", "150000"],
    ["supportHigh", "Support range high ($)", "350000"],
    ["windowStart", "Window start (YYYY-MM)", "2027-06"],
    ["windowEnd", "Window end (YYYY-MM)", "2028-12"],
    ["carryComfort", "Comfortable monthly carry ($)", "7000"],
    ["propertyTaxPct", "Property tax (%/yr)", "2.2"],
    ["insurancePct", "Insurance (%/yr)", "0.4"],
    ["sarahDesignFee", "Sarah design fee ($)", "210000"],
  ];

  return (
    <section className="card p-4 print:hidden">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title">Assumptions</h2>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm font-medium text-teal">Saved ✓</span>}
          <button onClick={save} className="btn-primary">
            Save
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {fields.map(([key, label, placeholder]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              {label}
            </span>
            <input
              className="input"
              inputMode="decimal"
              value={form[key]}
              placeholder={placeholder}
              onChange={set(key)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

// Percent-style fractions render as human percentages (0.25 → "25").
function toForm(plan: HousePlan) {
  const pct = (f: number) => String(Math.round(f * 10000) / 100);
  return {
    purchasePrice: String(plan.purchasePrice),
    downPaymentPct: pct(plan.downPaymentPct),
    ratePct: String(plan.ratePct),
    termYears: String(plan.termYears),
    closingCostPct: pct(plan.closingCostPct),
    reserveMonths: String(plan.reserveMonths),
    supportLow: String(plan.supportLow),
    supportHigh: String(plan.supportHigh),
    windowStart: plan.windowStart,
    windowEnd: plan.windowEnd,
    carryComfort: String(plan.carryComfort),
    propertyTaxPct: pct(plan.propertyTaxPct),
    insurancePct: pct(plan.insurancePct),
    sarahDesignFee: String(plan.sarahDesignFee),
  };
}
