"use client";

// Effective workout templates = code defaults (workoutTemplates.ts) overlaid with
// the user's saved customizations in Firestore (users/{uid}/workoutConfig/main).
// Retiring an exercise moves it from a workout into the "retired" bucket; un-retiring
// moves it back into a chosen workout. Every change persists the full config doc.

import { useMemo } from "react";
import { useCollection, setItem } from "@/lib/data";
import { TEMPLATES, RETIRED_DEFAULTS, getTemplate, type TemplateExercise } from "@/lib/workoutTemplates";

const CONFIG_COL = "workoutConfig";
const CONFIG_ID = "main";

export interface WorkoutConfig {
  templates: Record<string, TemplateExercise[]>; // keyed by workout key: "a" | "b" | "c"
  retired: TemplateExercise[];
}

type StoredConfig = Partial<WorkoutConfig> & { id: string };

function defaults(): WorkoutConfig {
  return {
    templates: Object.fromEntries(TEMPLATES.map((t) => [t.key, t.exercises])),
    retired: RETIRED_DEFAULTS,
  };
}

/** Display name for a workout key, e.g. "a" → "Workout A". */
export function workoutName(key: string): string {
  return getTemplate(key).name;
}

export function useWorkouts() {
  const { data, loading, uid } = useCollection<StoredConfig>(CONFIG_COL);
  const stored = data.find((d) => d.id === CONFIG_ID);

  const config: WorkoutConfig = useMemo(() => {
    const base = defaults();
    if (!stored) return base;
    return {
      templates: { ...base.templates, ...(stored.templates ?? {}) },
      retired: stored.retired ?? base.retired,
    };
  }, [stored]);

  const persist = async (next: WorkoutConfig) => {
    if (!uid) return;
    await setItem(uid, CONFIG_COL, CONFIG_ID, next as unknown as Record<string, unknown>);
  };

  /** Bench the exercise at `index` of workout `key` into the retired bucket. */
  const retire = (key: string, index: number) => {
    const ex = config.templates[key]?.[index];
    if (!ex) return;
    return persist({
      templates: { ...config.templates, [key]: config.templates[key].filter((_, i) => i !== index) },
      retired: [...config.retired, ex],
    });
  };

  /** Reorder within a workout: move the exercise at `index` by `dir` (-1 up, +1 down). */
  const move = (key: string, index: number, dir: -1 | 1) => {
    const list = config.templates[key];
    const to = index + dir;
    if (!list || to < 0 || to >= list.length) return;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    return persist({ ...config, templates: { ...config.templates, [key]: next } });
  };

  /** Move the retired exercise at `index` back into workout `targetKey`. */
  const unretire = (index: number, targetKey: string) => {
    const ex = config.retired[index];
    if (!ex) return;
    return persist({
      templates: { ...config.templates, [targetKey]: [...(config.templates[targetKey] ?? []), ex] },
      retired: config.retired.filter((_, i) => i !== index),
    });
  };

  return { config, loading, uid, retire, unretire, move };
}
