"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCollection, addItem } from "@/lib/data";
import {
  mergeSessions,
  lastExercise,
  formatBestSet,
  nowStamp,
  todayISO,
  type LoggedSessionDoc,
} from "@/lib/lifts";
import { getTemplate } from "@/lib/workoutTemplates";
import { useWorkouts } from "@/lib/useWorkouts";

interface DraftSet { weight: string; reps: string; done: boolean }
interface DraftExercise { name: string; bodyweight: boolean; targetReps: string; sets: DraftSet[] }
interface Draft {
  workoutKey: string;
  name: string;
  date: string;
  startedAt: number; // epoch ms
  exercises: DraftExercise[];
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

export default function WorkoutLogger({ workoutKey }: { workoutKey: string }) {
  const router = useRouter();
  const { config, loading: cfgLoading } = useWorkouts();
  const base = getTemplate(workoutKey);
  const template = useMemo(
    () => ({ name: base.name, exercises: config.templates[workoutKey] ?? base.exercises }),
    [base.name, base.exercises, config.templates, workoutKey]
  );
  const { data: logged, loading, uid } = useCollection<LoggedSessionDoc>("liftSessions");
  const sessionsDesc = useMemo(() => mergeSessions(logged), [logged]);

  const STORAGE = `lift-draft-${workoutKey}`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [, setTick] = useState(0);
  const initRef = useRef(false);

  // Live timer.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Initialize once: restore an in-progress draft, else build from the template
  // prefilled with last time's numbers (waits for history to load first).
  useEffect(() => {
    if (initRef.current) return;
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE) : null;
    if (saved) {
      try { setDraft(JSON.parse(saved)); initRef.current = true; return; } catch { /* rebuild */ }
    }
    if (loading || cfgLoading) return;

    const exercises: DraftExercise[] = template.exercises.map((te) => {
      const prev = lastExercise(sessionsDesc, te.name);
      const prevSets = prev?.ex.sets;
      const count = prevSets?.length || te.sets;
      const sets: DraftSet[] = Array.from({ length: count }, (_, i) => {
        const ps = prevSets?.[i] ?? (prev ? prev.ex.best : null);
        return {
          weight: ps && ps.weight ? String(ps.weight) : "",
          reps: ps && ps.reps ? String(ps.reps) : "",
          done: false,
        };
      });
      return { name: te.name, bodyweight: te.bodyweight, targetReps: te.targetReps, sets };
    });

    setDraft({
      workoutKey,
      name: template.name,
      date: todayISO(),
      startedAt: Date.now(),
      exercises,
    });
    initRef.current = true;
  }, [loading, cfgLoading, sessionsDesc, template, workoutKey, STORAGE]);

  // Autosave the draft.
  useEffect(() => {
    if (draft) localStorage.setItem(STORAGE, JSON.stringify(draft));
  }, [draft, STORAGE]);

  if (!draft) {
    return <p className="py-12 text-center text-sm text-muted">Loading…</p>;
  }

  // --- mutations -----------------------------------------------------------
  const update = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d));
  const editSet = (ei: number, si: number, patch: Partial<DraftSet>) =>
    update((d) => {
      const ex = d.exercises.map((e, i) =>
        i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) },
      );
      return { ...d, exercises: ex };
    });
  const addSet = (ei: number) =>
    update((d) => {
      const ex = d.exercises.map((e, i) => {
        if (i !== ei) return e;
        const last = e.sets[e.sets.length - 1];
        return { ...e, sets: [...e.sets, { weight: last?.weight ?? "", reps: last?.reps ?? "", done: false }] };
      });
      return { ...d, exercises: ex };
    });
  const removeSet = (ei: number, si: number) =>
    update((d) => ({
      ...d,
      exercises: d.exercises.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.filter((_, j) => j !== si) })),
    }));
  const removeExercise = (ei: number) =>
    update((d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== ei) }));
  const addExercise = () => {
    const name = window.prompt("Exercise name")?.trim();
    if (!name) return;
    update((d) => ({
      ...d,
      exercises: [...d.exercises, { name, bodyweight: false, targetReps: "", sets: [{ weight: "", reps: "", done: false }] }],
    }));
  };

  const completedSets = draft.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => parseFloat(s.reps) > 0).length, 0,
  );

  const finish = async () => {
    if (!uid) return;
    const exercises = draft.exercises
      .map((ex) => ({
        name: ex.name.trim(),
        isBodyweight: ex.bodyweight,
        sets: ex.sets
          .map((s) => ({ weight: parseFloat(s.weight) || 0, reps: parseFloat(s.reps) || 0 }))
          .filter((s) => s.reps > 0),
      }))
      .filter((ex) => ex.name && ex.sets.length > 0);

    if (exercises.length === 0) {
      alert("Log at least one set (reps) before finishing.");
      return;
    }
    setSaving(true);
    try {
      await addItem(uid, "liftSessions", {
        date: draft.date,
        dateTime: nowStamp(draft.date),
        name: draft.name.trim() || "Workout",
        durationMin: Math.max(1, Math.round((Date.now() - draft.startedAt) / 60000)),
        exercises,
      });
      localStorage.removeItem(STORAGE);
      router.push("/lifts");
    } catch (e) {
      setSaving(false);
      alert("Could not save workout. Try again.");
      console.error(e);
    }
  };

  const discard = () => {
    if (!confirm("Discard this workout? Logged sets will be lost.")) return;
    localStorage.removeItem(STORAGE);
    router.push("/lifts");
  };

  return (
    <div className="space-y-5 pb-24">
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="flex items-center justify-between gap-3">
          <input
            value={draft.name}
            onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
            className="min-w-0 flex-1 bg-transparent text-2xl font-extrabold tracking-tight outline-none"
          />
          <span className="shrink-0 tabular-nums text-lg font-bold text-indigo">
            {fmtElapsed(Date.now() - draft.startedAt)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted">
          <input
            type="date"
            value={draft.date}
            onChange={(e) => update((d) => ({ ...d, date: e.target.value }))}
            className="bg-transparent outline-none"
          />
          <span>· {completedSets} sets done</span>
        </div>
      </header>

      <div className="space-y-4">
        {draft.exercises.map((ex, ei) => {
          const prev = lastExercise(sessionsDesc, ex.name);
          return (
            <div key={ei} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-ink">{ex.name}</h3>
                  <p className="text-xs text-muted">
                    {prev
                      ? `Last: ${formatBestSet(prev.ex)} · ${prev.date}`
                      : ex.targetReps
                        ? `Target ${ex.targetReps} reps`
                        : "No history yet"}
                  </p>
                </div>
                <button
                  onClick={() => removeExercise(ei)}
                  className="shrink-0 text-xs font-medium text-muted hover:text-coral"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 space-y-1.5">
                <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <span>Set</span>
                  <span>{ex.bodyweight ? "Weight (+)" : "Weight"}</span>
                  <span>Reps</span>
                  <span className="text-center">✓</span>
                </div>
                {ex.sets.map((s, si) => {
                  const done = s.done && parseFloat(s.reps) > 0;
                  return (
                    <div
                      key={si}
                      className={`grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 rounded-lg px-1 py-0.5 ${
                        done ? "bg-teal/10" : ""
                      }`}
                    >
                      <span className="text-sm font-semibold text-muted">{si + 1}</span>
                      <input
                        inputMode="decimal"
                        placeholder={ex.bodyweight ? "0" : "lb"}
                        value={s.weight}
                        onChange={(e) => editSet(ei, si, { weight: e.target.value })}
                        className="input py-1.5 text-center"
                      />
                      <input
                        inputMode="numeric"
                        placeholder="reps"
                        value={s.reps}
                        onChange={(e) => editSet(ei, si, { reps: e.target.value })}
                        className="input py-1.5 text-center"
                      />
                      <button
                        onClick={() => editSet(ei, si, { done: !s.done })}
                        aria-label="Mark set done"
                        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md border text-sm ${
                          done ? "border-teal bg-teal text-white" : "border-line text-muted"
                        }`}
                      >
                        ✓
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 flex gap-3 text-xs font-medium">
                <button onClick={() => addSet(ei)} className="text-indigo hover:underline">+ Add set</button>
                {ex.sets.length > 0 && (
                  <button onClick={() => removeSet(ei, ex.sets.length - 1)} className="text-muted hover:text-coral">
                    − Remove set
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={addExercise} className="btn-ghost w-full">+ Add exercise</button>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-content gap-3">
          <button onClick={discard} className="btn-ghost flex-1">Discard</button>
          <button onClick={finish} disabled={saving || !uid} className="btn-primary flex-[2] disabled:opacity-50">
            {saving ? "Saving…" : "Finish workout"}
          </button>
        </div>
      </div>
    </div>
  );
}
