"use client";

import { useCallback, useMemo } from "react";
import { useCollection, setItem, deleteItem } from "@/lib/data";
import type { CardioLog } from "@/lib/cardio";
import type { TrainingSessionLog } from "@/lib/types";

export interface SessionStatus {
  done: boolean;
  /** The run logged that day, if any (outdoor/treadmill cardio). */
  run?: CardioLog;
  /** Manual override doc, if any. */
  override?: TrainingSessionLog;
}

/**
 * Completion state for planned runs, keyed by date. A date is done when an
 * outdoor/treadmill cardio log exists for it OR a trainingSessions override says
 * so. `toggle(date)` flips the override (and removes it when clearing a day that
 * has no run logged, so the doc only exists when it carries information).
 */
export function useTrainingStatus() {
  const { data: cardio, uid } = useCollection<CardioLog>("cardio");
  const { data: overrides } = useCollection<TrainingSessionLog>("trainingSessions");

  const byDate = useMemo(() => {
    const map = new Map<string, SessionStatus>();
    for (const c of cardio) {
      if (c.kind !== "outdoor" && c.kind !== "treadmill") continue;
      const cur = map.get(c.date);
      // Keep the longest run of the day as "the" run.
      if (!cur?.run || c.durationMin > cur.run.durationMin) map.set(c.date, { done: true, run: c, override: cur?.override });
    }
    for (const o of overrides) {
      const cur = map.get(o.id);
      map.set(o.id, { done: o.done || !!cur?.run, run: cur?.run, override: o });
    }
    return map;
  }, [cardio, overrides]);

  const status = useCallback((date: string): SessionStatus => byDate.get(date) ?? { done: false }, [byDate]);

  const toggle = useCallback(
    async (date: string) => {
      if (!uid) return;
      const cur = byDate.get(date);
      const nowDone = cur?.override ? cur.override.done : !!cur?.run;
      if (nowDone && cur?.override && !cur.run) {
        await deleteItem(uid, "trainingSessions", date);
      } else {
        await setItem(uid, "trainingSessions", date, { done: !nowDone, updatedAt: new Date().toISOString() });
      }
    },
    [uid, byDate]
  );

  return { status, toggle, uid };
}
