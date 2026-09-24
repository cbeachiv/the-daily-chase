"use client";

import Link from "next/link";
import { todayStr, prettyDate } from "@/lib/dates";
import { RACE, daysToRace, nextSession, weekFor, SESSION_LABEL } from "@/lib/trainingPlan";
import { useTrainingStatus } from "@/lib/useTrainingStatus";

// Compact Today-page card: countdown, this week's phase, and the next planned run.
export default function RaceCard() {
  const today = todayStr();
  const { status } = useTrainingStatus();
  const days = daysToRace(today);
  if (days < 0) return null;

  const next = nextSession(today);
  const week = weekFor(today);
  const isToday = next?.date === today;
  const done = isToday && status(today).done;

  return (
    <Link
      href="/race"
      className="card flex items-center justify-between gap-3 border-l-4 border-l-teal p-4 transition hover:shadow-card sm:p-5"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">
          {days === 0 ? "Race day." : `Thanksgiving 5K in ${days} day${days === 1 ? "" : "s"}`}
          {week && <span className="font-normal text-muted"> · Week {week.n}, {week.phase}</span>}
        </p>
        {next ? (
          <p className="truncate text-xs text-muted">
            {done ? "✓ " : ""}
            {isToday ? "Today" : prettyDate(next.date)}: {next.session.title}
            {next.session.targetPace && next.session.type !== "race" && <> · {next.session.targetPace}/mi</>}
            {!isToday && <> ({SESSION_LABEL[next.session.type].toLowerCase()})</>}
          </p>
        ) : (
          <p className="text-xs text-muted">{RACE.name}</p>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold text-teal">Plan →</span>
    </Link>
  );
}
