"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCollection, deleteItem } from "@/lib/data";
import {
  mergeSessions,
  summarize,
  exerciseNames,
  exerciseProgress,
  groupByMonth,
  formatSessionDate,
  formatDuration,
  formatBestSet,
  type LiftSession,
  type LoggedSessionDoc,
} from "@/lib/lifts";
import { TEMPLATES } from "@/lib/workoutTemplates";
import { useWorkouts, workoutName } from "@/lib/useWorkouts";
import {
  cardioDesc,
  cardioDistanceMi,
  cardioPaceMin,
  timeByActivity,
  isRacketSport,
  fmtClock,
  fmtPace,
  CARDIO_KIND_LABEL,
  type CardioLog,
  type CardioScope,
} from "@/lib/cardio";
import { todayISO } from "@/lib/lifts";
import LiftProgressChart from "@/components/charts/LiftProgressChart";
import CardioTimeChart from "@/components/charts/CardioTimeChart";

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "k";
  return String(n);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}
function WeightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10" />
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
    </svg>
  );
}

function SessionCard({ session, onDelete }: { session: LiftSession; onDelete?: () => void }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-ink">
            {session.name}
            {session.source === "logged" && (
              <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-teal">
                logged here
              </span>
            )}
          </h3>
          <p className="text-sm text-muted">{formatSessionDate(session.date)}</p>
        </div>
        {onDelete && (
          <button onClick={onDelete} className="shrink-0 text-xs font-medium text-muted hover:text-coral">
            Delete
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5"><ClockIcon /> {formatDuration(session.durationMin)}</span>
        <span className="inline-flex items-center gap-1.5"><WeightIcon /> {session.volume.toLocaleString()} lb</span>
        <span className={`inline-flex items-center gap-1.5 ${session.prCount > 0 ? "text-amber" : ""}`}>
          <TrophyIcon /> {session.prCount} {session.prCount === 1 ? "PR" : "PRs"}
        </span>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-1.5 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted">
          <span>Exercise</span><span>Best Set</span>
        </div>
        <ul className="space-y-1.5">
          {session.exercises.map((ex, i) => (
            <li key={i} className="grid grid-cols-[1fr_auto] items-baseline gap-3 text-sm">
              <span className="truncate text-ink">
                <span className="text-muted">{ex.workingSets} × </span>{ex.name}
              </span>
              <span className="tabular-nums text-ink">{formatBestSet(ex)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CardioRow({ c, onDelete }: { c: CardioLog; onDelete?: () => void }) {
  const dist = cardioDistanceMi(c);
  const pace = cardioPaceMin(c);
  const parts: string[] = [];
  if (isRacketSport(c.kind)) {
    parts.push(fmtClock(c.durationMin));
    if (c.wins != null || c.losses != null) parts.push(`${c.wins ?? 0}–${c.losses ?? 0}`);
  } else if (c.kind === "other") {
    parts.push(c.activity || "Activity", fmtClock(c.durationMin));
  } else {
    parts.push(fmtClock(c.durationMin));
    if (c.kind === "treadmill") {
      if (c.speedMph) parts.push(`${c.speedMph} mph`);
      parts.push(`${c.inclinePct ?? 0}% incline`);
    } else if (pace) {
      parts.push(`${fmtPace(pace)} /mi`);
    }
    if (dist !== null) parts.push(`${dist.toFixed(2)} mi`);
  }

  const badge =
    c.kind === "treadmill" ? "bg-amber/15 text-amber"
    : c.kind === "outdoor" ? "bg-teal/15 text-teal"
    : c.kind === "pickleball" ? "bg-coral/15 text-coral"
    : c.kind === "tennis" ? "bg-sky/15 text-sky"
    : "bg-indigo/15 text-indigo";

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">{formatSessionDate(c.date)}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge}`}>
            {CARDIO_KIND_LABEL[c.kind]}
          </span>
        </div>
        <p className="truncate text-sm text-muted">{parts.join(" · ")}</p>
        {c.playedWith && <p className="truncate text-sm text-muted/80">with {c.playedWith}</p>}
        {c.notes && <p className="mt-0.5 text-sm text-muted/80">{c.notes}</p>}
      </div>
      {onDelete && (
        <button onClick={onDelete} className="shrink-0 text-xs font-medium text-muted hover:text-coral">
          Delete
        </button>
      )}
    </div>
  );
}

export default function LiftsPage() {
  const { data: logged, uid } = useCollection<LoggedSessionDoc>("liftSessions");
  const { data: cardio } = useCollection<CardioLog>("cardio");
  const cardioList = useMemo(() => cardioDesc(cardio), [cardio]);
  const [cardioScope, setCardioScope] = useState<CardioScope>("month");
  const today = todayISO();
  const activityData = useMemo(
    () => timeByActivity(cardio, cardioScope, today),
    [cardio, cardioScope, today]
  );
  const { config, retire, unretire, move } = useWorkouts();
  const [editing, setEditing] = useState(false);
  const sessions = useMemo(() => mergeSessions(logged), [logged]);
  const stats = useMemo(() => summarize(sessions), [sessions]);
  const names = useMemo(() => exerciseNames(sessions), [sessions]);
  const monthGroups = useMemo(() => groupByMonth(sessions), [sessions]);

  const [selected, setSelected] = useState("");
  const current = names.includes(selected) ? selected : names[0] ?? "";
  const points = useMemo(() => (current ? exerciseProgress(sessions, current) : []), [sessions, current]);
  const bodyweight = points.length > 0 && points.every((p) => p.weight === 0);

  // Group the progression dropdown by workout (A/B/C), with everything else in "Retired".
  const exerciseGroups = useMemo(() => {
    const tmplSets = TEMPLATES.map((t) => new Set((config.templates[t.key] ?? []).map((e) => e.name)));
    const groups = TEMPLATES.map((t) => ({ label: t.name, items: [] as string[] }));
    const retired: string[] = [];
    for (const n of names) {
      const gi = tmplSets.findIndex((s) => s.has(n));
      if (gi >= 0) groups[gi].items.push(n);
      else retired.push(n);
    }
    return [...groups, { label: "Retired", items: retired }];
  }, [names, config.templates]);

  const remove = async (s: LiftSession) => {
    if (!uid || !s.docId) return;
    if (!confirm("Delete this logged workout?")) return;
    await deleteItem(uid, "liftSessions", s.docId);
  };

  const removeCardio = async (c: CardioLog) => {
    if (!uid) return;
    if (!confirm("Delete this cardio entry?")) return;
    await deleteItem(uid, "cardio", c.id);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Lifts</h1>
        <p className="text-sm text-muted">Log your workouts and track every lift.</p>
      </header>

      {/* Start a workout */}
      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="section-title">Start a workout</h2>
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-xs font-semibold text-indigo hover:underline"
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>

        {editing ? (
          <div className="space-y-4">
            {TEMPLATES.map((t) => {
              const exercises = config.templates[t.key] ?? [];
              return (
                <div key={t.key}>
                  <h3 className="mb-1 text-sm font-bold text-ink">{t.name}</h3>
                  <ul className="divide-y divide-line">
                    {exercises.length === 0 && (
                      <li className="py-2 text-sm text-muted">No exercises — un-retire some below.</li>
                    )}
                    {exercises.map((ex, i) => (
                      <li key={`${ex.name}-${i}`} className="flex items-center justify-between gap-3 py-2">
                        <span className="truncate text-sm text-ink">
                          <span className="text-muted">{ex.sets} × </span>{ex.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={() => move(t.key, i, -1)}
                            disabled={i === 0}
                            aria-label="Move up"
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-muted hover:border-indigo hover:text-indigo disabled:opacity-30 disabled:hover:border-line disabled:hover:text-muted"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => move(t.key, i, 1)}
                            disabled={i === exercises.length - 1}
                            aria-label="Move down"
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-muted hover:border-indigo hover:text-indigo disabled:opacity-30 disabled:hover:border-line disabled:hover:text-muted"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => retire(t.key, i)}
                            className="text-xs font-medium text-muted hover:text-coral"
                          >
                            Retire
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <Link
                key={t.key}
                href={`/lifts/new/${t.key}`}
                className="btn-primary flex-col !items-start gap-0.5 px-4 py-3 text-left"
              >
                <span className="text-base font-bold">{t.name}</span>
                <span className="text-xs font-medium opacity-80">
                  {(config.templates[t.key] ?? t.exercises).length} exercises
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Cardio */}
      <section className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Cardio</h2>
          <Link href="/lifts/cardio" className="btn-primary px-4 py-2">Log Cardio</Link>
        </div>
        {cardioList.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No cardio logged yet.</p>
        ) : (
          <div className="mt-1 divide-y divide-line">
            {cardioList.slice(0, 8).map((c) => (
              <CardioRow key={c.id} c={c} onDelete={() => removeCardio(c)} />
            ))}
          </div>
        )}
      </section>

      {/* Time by activity */}
      {cardioList.length > 0 && (
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Time by activity</h2>
            <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
              {(
                [
                  ["week", "This week"],
                  ["month", "This month"],
                  ["year", today.slice(0, 4)],
                  ["all", "All time"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setCardioScope(v)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    cardioScope === v ? "bg-card text-ink shadow-card" : "text-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <CardioTimeChart data={activityData} />
        </section>
      )}

      {sessions.length === 0 ? (
        <div className="card p-6 text-sm text-muted">
          No workouts yet — tap a workout above to log your first one. To bring in your
          Strong history, save your export to{" "}
          <code className="rounded bg-bg px-1.5 py-0.5 text-[13px]">data/strong_workouts.csv</code>{" "}
          and run{" "}
          <code className="rounded bg-bg px-1.5 py-0.5 text-[13px]">npm run lifts:import</code>.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Workouts" value={String(stats.workouts)} />
            <Stat label="Volume" value={`${compact(stats.totalVolume)} lb`} />
            <Stat label="Est. PRs" value={String(stats.totalPRs)} />
            <Stat label="This week" value={String(stats.thisWeek)} />
          </section>

          <section className="card p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Progression</h2>
              <select
                value={current}
                onChange={(e) => setSelected(e.target.value)}
                className="input max-w-[60%] sm:max-w-xs"
              >
                {exerciseGroups.map((g) =>
                  g.items.length > 0 ? (
                    <optgroup key={g.label} label={g.label}>
                      {g.items.map((n) => (<option key={n} value={n}>{n}</option>))}
                    </optgroup>
                  ) : null
                )}
              </select>
            </div>
            <LiftProgressChart points={points} bodyweight={bodyweight} />
            <p className="mt-2 text-xs text-muted">
              {bodyweight
                ? "Top set reps per session."
                : "Estimated 1-rep max (Epley) of your best set each session."}
            </p>
          </section>

          {/* Retired exercises */}
          {config.retired.length > 0 && (
            <details className="card p-4 sm:p-5">
              <summary className="section-title flex cursor-pointer items-center justify-between">
                <span>Retired exercises</span>
                <span className="text-xs font-medium text-muted">{config.retired.length}</span>
              </summary>
              <ul className="mt-2 divide-y divide-line">
                {config.retired.map((ex, i) => (
                  <li key={`${ex.name}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="truncate text-sm text-ink">
                      <span className="text-muted">{ex.sets} × </span>{ex.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-medium text-muted">Un-retire to</span>
                      {TEMPLATES.map((t) => (
                        <button
                          key={t.key}
                          onClick={() => unretire(i, t.key)}
                          title={`Un-retire to ${workoutName(t.key)}`}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-xs font-bold text-muted hover:border-indigo hover:text-indigo"
                        >
                          {t.key.toUpperCase()}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <section className="space-y-6">
            {monthGroups.map((g) => (
              <div key={g.label} className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</h2>
                {g.sessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onDelete={s.source === "logged" ? () => remove(s) : undefined}
                  />
                ))}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
