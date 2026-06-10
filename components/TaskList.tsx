"use client";

import { useMemo, useState } from "react";
import { orderBy } from "firebase/firestore";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type { Task } from "@/lib/types";
import { todayStr, prettyDate } from "@/lib/dates";

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

export default function TaskList() {
  const { data: tasks, uid } = useCollection<Task>("tasks", [orderBy("sortOrder", "asc")]);
  const [title, setTitle] = useState("");
  const today = todayStr();

  // Carryover is derived, not stored: any open task whose dueDate is on or
  // before today shows up today. An open task from a past day is "carried over".
  const { open, doneToday } = useMemo(() => {
    const open = tasks
      .filter((t) => !t.completedAt && t.dueDate <= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sortOrder - b.sortOrder);
    const doneToday = tasks.filter(
      (t) => t.completedAt && t.completedAt.slice(0, 10) === today
    );
    return { open, doneToday };
  }, [tasks, today]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || !uid) return;
    setTitle("");
    await addItem(uid, "tasks", {
      title: t,
      dueDate: today,
      completedAt: null,
      sortOrder: Date.now(),
      carriedCount: 0,
    });
  }

  async function toggle(task: Task) {
    if (!uid) return;
    await updateItem(uid, "tasks", task.id, {
      completedAt: task.completedAt ? null : new Date().toISOString(),
    });
  }

  async function remove(id: string) {
    if (!uid) return;
    await deleteItem(uid, "tasks", id);
  }

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="section-title mb-3">To-Do</h2>

      <form onSubmit={add} className="mb-4 flex gap-2">
        <input
          className="input"
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="btn-primary shrink-0">
          Add
        </button>
      </form>

      {open.length === 0 && doneToday.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          Nothing yet. Add your first task above. ✦
        </p>
      )}

      <ul className="space-y-1.5">
        {open.map((task) => {
          const carried = daysBetween(task.dueDate, today);
          return (
            <li key={task.id} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-bg">
              <button
                onClick={() => toggle(task)}
                aria-label="Complete task"
                className="h-5 w-5 shrink-0 rounded-full border-2 border-line transition hover:border-indigo"
              />
              <span className="flex-1 text-sm">{task.title}</span>
              {carried > 0 && (
                <span className="shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-amber">
                  carried {carried}d · {prettyDate(task.dueDate)}
                </span>
              )}
              <button
                onClick={() => remove(task.id)}
                className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100 hover:text-coral"
                aria-label="Delete task"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      {doneToday.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {doneToday.map((task) => (
            <li key={task.id} className="group flex items-center gap-3 rounded-lg px-2 py-2">
              <button
                onClick={() => toggle(task)}
                aria-label="Mark incomplete"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal text-[11px] text-white"
              >
                ✓
              </button>
              <span className="flex-1 text-sm text-muted line-through">{task.title}</span>
              <button
                onClick={() => remove(task.id)}
                className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100 hover:text-coral"
                aria-label="Delete task"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
