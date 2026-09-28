"use client";

import { useState } from "react";
import { setItem } from "@/lib/data";
import { addDays, todayStr } from "@/lib/dates";
import { MAX_STEPS_PER_DAY, STEP_LOGS, stepLogId } from "@/lib/steps";
import type { StepLog } from "@/lib/types";

// Manual step entry (copy the number from the Health app). Writes the same
// stepLogs/s_{date} doc the /api/steps Shortcut route uses, so a later
// Shortcut post or re-entry simply overwrites it.
export default function StepsForm({ uid, stepLogs }: { uid: string | null; stepLogs: StepLog[] }) {
  const today = todayStr();
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [val, setVal] = useState("");
  const date = day === "today" ? today : addDays(today, -1);
  const existing = stepLogs.find((s) => s.date === date);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(val.replace(/[,\s]/g, "")));
    if (!uid || !Number.isFinite(n) || n < 0 || n > MAX_STEPS_PER_DAY) return;
    const now = new Date().toISOString();
    await setItem(uid, STEP_LOGS, stepLogId(date), {
      date,
      steps: n,
      source: "manual",
      updatedAt: now,
      ...(existing ? {} : { createdAt: now }),
    });
    setVal("");
  }

  return (
    <form onSubmit={save} className="flex gap-2">
      <select
        value={day}
        onChange={(e) => setDay(e.target.value as "today" | "yesterday")}
        className="input w-auto shrink-0 pr-7"
        aria-label="Which day"
      >
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
      </select>
      <input
        type="text"
        inputMode="numeric"
        className="input min-w-0"
        placeholder={existing ? `Steps: ${existing.steps.toLocaleString()}` : "Steps from Health"}
        value={val}
        onChange={(e) => setVal(e.target.value)}
      />
      <button type="submit" className="btn-primary shrink-0">
        Save
      </button>
    </form>
  );
}
