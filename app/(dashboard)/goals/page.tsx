"use client";

import GoalSection from "@/components/GoalSection";

export default function GoalsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Goals</h1>
        <p className="text-sm text-muted">
          Set them yourself, or tap ✦ AI suggest for ideas. Use ‹ › to browse past periods.
        </p>
      </header>

      <div className="space-y-1">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Weekly</p>
        <GoalSection period="week" />
      </div>

      <div className="space-y-1">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Monthly</p>
        <GoalSection period="month" />
      </div>
    </div>
  );
}
