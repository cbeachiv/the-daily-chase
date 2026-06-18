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
    // Manual order is authoritative: sortOrder first so any task can be moved
    // into the top "most important thing" slot regardless of its due date.
    const open = tasks
      .filter((t) => !t.completedAt && t.dueDate <= today)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.dueDate.localeCompare(b.dueDate));
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
    // New tasks go to the bottom so the top slot stays a deliberate choice.
    const maxOrder = open.reduce((m, t) => Math.max(m, t.sortOrder), 0);
    await addItem(uid, "tasks", {
      title: t,
      dueDate: today,
      completedAt: null,
      sortOrder: maxOrder + 1,
      carriedCount: 0,
    });
  }

  // Swap sortOrder with the neighbor in the open list to move a task up/down.
  async function move(index: number, dir: -1 | 1) {
    if (!uid) return;
    const a = open[index];
    const b = open[index + dir];
    if (!a || !b) return;
    await Promise.all([
      updateItem(uid, "tasks", a.id, { sortOrder: b.sortOrder }),
      updateItem(uid, "tasks", b.id, { sortOrder: a.sortOrder }),
    ]);
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
        {open.map((task, index) => {
          const carried = daysBetween(task.dueDate, today);
          const isTop = index === 0;
          return (
            <li
              key={task.id}
              className={
                isTop
                  ? "group rounded-xl border-2 border-indigo bg-indigo/5 px-3 py-3 ring-1 ring-indigo/20"
                  : "group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-bg"
              }
            >
              {isTop && (
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo">
                  <span aria-hidden>★</span>
                  The most important thing — do this before anything else. Stay focused.
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggle(task)}
                  aria-label="Complete task"
                  className={`shrink-0 rounded-full border-2 border-line transition hover:border-indigo ${
                    isTop ? "h-6 w-6 border-indigo" : "h-5 w-5"
                  }`}
                />
                <span className={`flex-1 ${isTop ? "text-base font-semibold" : "text-sm"}`}>
                  {task.title}
                </span>
                {carried > 0 && (
                  <span className="shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-amber">
                    carried {carried}d · {prettyDate(task.dueDate)}
                  </span>
                )}
                <div className="flex shrink-0 flex-col leading-none opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move task up"
                    className="text-muted transition hover:text-indigo disabled:opacity-20 disabled:hover:text-muted"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === open.length - 1}
                    aria-label="Move task down"
                    className="text-muted transition hover:text-indigo disabled:opacity-20 disabled:hover:text-muted"
                  >
                    ▼
                  </button>
                </div>
                <button
                  onClick={() => remove(task.id)}
                  className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100 hover:text-coral"
                  aria-label="Delete task"
                >
                  ✕
                </button>
              </div>
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
