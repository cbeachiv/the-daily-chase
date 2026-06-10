"use client";

import GoalSection from "@/components/GoalSection";
import { startOfMonth, startOfWeek, prettyDate, prettyDateLong } from "@/lib/dates";

export default function GoalsPage() {
  const week = startOfWeek();
  const month = startOfMonth();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Goals</h1>
        <p className="text-sm text-muted">Set them yourself, or tap ✦ AI suggest for ideas.</p>
      </header>

      <div className="space-y-1">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Week of {prettyDate(week)}
        </p>
        <GoalSection period="week" periodStart={week} label="This Week" />
      </div>

      <div className="space-y-1">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {prettyDateLong(month).replace(/, \d{4}$/, "")}
        </p>
        <GoalSection period="month" periodStart={month} label="This Month" />
      </div>
    </div>
  );
}
