"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useCollection } from "@/lib/data";
import type { Goal } from "@/lib/types";
import TaskList from "@/components/TaskList";
import QuickLog from "@/components/QuickLog";
import QuoteOfDay from "@/components/QuoteOfDay";
import CallsSection from "@/components/CallsSection";
import { prettyDateLong, startOfMonth, startOfWeek, todayStr } from "@/lib/dates";

export default function TodayPage() {
  const { user } = useAuth();
  const { data: goals } = useCollection<Goal>("goals");
  const week = startOfWeek();
  const month = startOfMonth();

  const { weekGoals, monthGoals } = useMemo(() => {
    return {
      weekGoals: goals.filter((g) => g.period === "week" && g.periodStart === week),
      monthGoals: goals.filter((g) => g.period === "month" && g.periodStart === month),
    };
  }, [goals, week, month]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.displayName?.split(" ")[0] ?? "Chase";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="text-sm text-muted">{prettyDateLong(todayStr())}</p>
      </header>

      <QuoteOfDay />
      <QuickLog />
      <TaskList />
      <CallsSection />

      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Goals</h2>
          <Link href="/goals" className="text-xs font-semibold text-indigo">
            View all →
          </Link>
        </div>
        <GoalSnapshot label="This week" goals={weekGoals} />
        <div className="mt-3 border-t border-line pt-3">
          <GoalSnapshot label="This month" goals={monthGoals} />
        </div>
      </section>
    </div>
  );
}

function GoalSnapshot({ label, goals }: { label: string; goals: Goal[] }) {
  const done = goals.filter((g) => g.done).length;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        {goals.length > 0 && (
          <span className="text-xs text-muted">
            {done}/{goals.length} done
          </span>
        )}
      </div>
      {goals.length === 0 ? (
        <p className="text-sm text-muted">No goals set yet.</p>
      ) : (
        <ul className="space-y-1">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-sm">
              <span className={g.done ? "text-teal" : "text-line"}>{g.done ? "✓" : "○"}</span>
              <span className={g.done ? "text-muted line-through" : ""}>{g.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
