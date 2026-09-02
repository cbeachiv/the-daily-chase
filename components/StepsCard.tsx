"use client";

import { useMemo, useState } from "react";
import { setItem } from "@/lib/data";
import type { StepGoal, StepLog } from "@/lib/types";
import { prettyMonth } from "@/lib/dates";
import {
  DEFAULT_STEP_TARGET,
  MAX_STEPS_PER_DAY,
  STEP_GOALS,
  fmtSteps,
  monthPace,
  paceLabel,
} from "@/lib/steps";
import StepsChart from "@/components/charts/StepsChart";
import Chevron from "@/components/Chevron";

// Monthly step goal: progress toward dailyTarget * daysInMonth, the daily pace
// still needed, and (expanded) the day-by-day chart plus the target editor.
export default function StepsCard({
  logs,
  goals,
  uid,
  today,
}: {
  logs: StepLog[];
  goals: StepGoal[];
  uid: string | null;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [targetInput, setTargetInput] = useState("");

  const month = today.slice(0, 7);
  const dailyTarget = goals.find((g) => g.id === month)?.dailyTarget ?? DEFAULT_STEP_TARGET;
  const pace = useMemo(() => monthPace(logs, today, dailyTarget), [logs, today, dailyTarget]);

  const tone = pace.done ? "amber" : pace.onPace ? "teal" : "coral";
  const barColor = { amber: "bg-amber", teal: "bg-teal", coral: "bg-coral" }[tone];
  const textColor = { amber: "text-amber", teal: "text-teal", coral: "text-coral" }[tone];
  // Where the fill would sit if every day so far had hit the target exactly.
  const planPct = Math.min(100, (Math.max(0, pace.dayOfMonth - 1) / pace.daysInMonth) * 100);

  const previewTarget = parseInt(targetInput, 10);
  const previewValid = Number.isFinite(previewTarget) && previewTarget > 0 && previewTarget <= MAX_STEPS_PER_DAY;

  async function saveTarget(e: React.FormEvent) {
    e.preventDefault();
    if (!uid || !previewValid) return;
    await setItem(uid, STEP_GOALS, month, {
      month,
      dailyTarget: previewTarget,
      updatedAt: new Date().toISOString(),
    });
    setTargetInput("");
  }

  return (
    <section className="card p-4 sm:p-5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between">
        <h2 className="section-title">Steps</h2>
        <span className="flex items-center gap-2 text-sm text-muted">
          <span>
            <span className="font-semibold text-ink">{fmtSteps(pace.total)}</span> / {fmtSteps(pace.monthTarget)}
          </span>
          <Chevron open={open} />
        </span>
      </button>

      <div className="relative mt-3 h-2 rounded-full bg-bg">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pace.pct}%` }} />
        {planPct > 0 && planPct < 100 && (
          <div
            className="absolute top-[-3px] h-[14px] w-px bg-ink/40"
            style={{ left: `${planPct}%` }}
            title={`Target pace through yesterday: ${fmtSteps(pace.dailyTarget * (pace.dayOfMonth - 1))}`}
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className={`text-sm font-semibold ${textColor}`}>{paceLabel(pace)}</p>
        <p className="text-xs text-muted">
          Today {fmtSteps(pace.todaySteps)} · 7d avg {pace.avg7 !== null ? fmtSteps(pace.avg7) : "—"} ·{" "}
          {pace.remainingDays} day{pace.remainingDays === 1 ? "" : "s"} left
        </p>
      </div>

      {open && (
        <>
          <div className="mt-3">
            <StepsChart logs={logs} month={month} dailyTarget={dailyTarget} today={today} aspect={2} />
          </div>
          <form onSubmit={saveTarget} className="mt-3 flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              className="input"
              placeholder={`Daily target (now ${dailyTarget.toLocaleString()})`}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
            />
            <button type="submit" className="btn-primary shrink-0" disabled={!previewValid}>
              Save
            </button>
          </form>
          <p className="mt-1.5 text-[11px] text-muted">
            Applies to all of {prettyMonth(today)}
            {previewValid && <> · month target {fmtSteps(previewTarget * pace.daysInMonth)}</>}
          </p>
        </>
      )}
    </section>
  );
}
