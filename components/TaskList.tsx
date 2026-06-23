"use client";

import { useMemo, useState } from "react";
import { orderBy } from "firebase/firestore";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type { Task, TaskCategory, TrackedProject } from "@/lib/types";
import { CAT_LABEL, CAT_CHIP } from "@/lib/categories";
import { todayStr, prettyDate } from "@/lib/dates";

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

// A compact chip on each task row. Click cycles untagged → Hugga → Personal → Hugga.
function CatChip({ category, onSet }: { category?: TaskCategory; onSet: (c: TaskCategory) => void }) {
  const next: TaskCategory = category === "hugga" ? "personal" : "hugga";
  return (
    <button
      onClick={() => onSet(next)}
      aria-label={category ? `Category: ${CAT_LABEL[category]} (tap to change)` : "Tag category"}
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
        category ? CAT_CHIP[category] : "bg-line/60 text-muted hover:text-ink"
      }`}
    >
      {category ? CAT_LABEL[category] : "Tag"}
    </button>
  );
}

// A chip that links a task to a project. Tapping opens a small menu of active
// projects (plus "None"); when set it shows the project name in coral.
function ProjectChip({
  projectId,
  projects,
  onSet,
}: {
  projectId?: string;
  projects: TrackedProject[];
  onSet: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = projects.find((p) => p.id === projectId);
  // Nothing to link to and not already linked — hide the chip entirely.
  if (projects.length === 0 && !current) return null;
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={current ? `Project: ${current.name} (tap to change)` : "Link to project"}
        className={`max-w-[120px] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
          current ? "bg-coral/15 text-coral" : "bg-line/60 text-muted hover:text-ink"
        }`}
      >
        {current ? current.name : "＋ Project"}
      </button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute right-0 z-30 mt-1 max-h-56 w-44 overflow-auto rounded-lg border border-line bg-card py-1 shadow-card-hover">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onSet(p.id);
                  setOpen(false);
                }}
                className={`block w-full truncate px-3 py-1.5 text-left text-xs font-medium ${
                  p.id === projectId ? "bg-bg text-ink" : "text-muted hover:bg-bg hover:text-ink"
                }`}
              >
                {p.name}
              </button>
            ))}
            {current && (
              <button
                onClick={() => {
                  onSet(null);
                  setOpen(false);
                }}
                className="block w-full border-t border-line px-3 py-1.5 text-left text-xs font-medium text-muted hover:bg-bg hover:text-coral"
              >
                None
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function TaskList() {
  const { data: tasks, uid } = useCollection<Task>("tasks", [orderBy("sortOrder", "asc")]);
  const { data: allProjects } = useCollection<TrackedProject>("trackedProjects");
  // Only active projects are offered for linking.
  const projects = useMemo(
    () => allProjects.filter((p) => p.status !== "archived"),
    [allProjects]
  );
  const [title, setTitle] = useState("");
  // The area for newly-added tasks; sticky within the session so a run of Hugga
  // tasks doesn't need re-picking each time.
  const [newCat, setNewCat] = useState<TaskCategory>("hugga");
  // Sticky project for new tasks (null = unlinked), same idea as newCat.
  const [newProject, setNewProject] = useState<string | null>(null);
  const [showUntagged, setShowUntagged] = useState(true);
  const today = todayStr();

  // Carryover is derived, not stored: any open task whose dueDate is on or
  // before today shows up today. An open task from a past day is "carried over".
  const { open, doneToday, untaggedPast } = useMemo(() => {
    // Manual order is authoritative: sortOrder first so any task can be moved
    // into the top "most important thing" slot regardless of its due date.
    const open = tasks
      .filter((t) => !t.completedAt && t.dueDate <= today)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.dueDate.localeCompare(b.dueDate));
    const doneToday = tasks.filter((t) => t.completedAt && t.completedAt.slice(0, 10) === today);
    // Everything untagged that isn't already shown above — for retroactive tagging.
    const shown = new Set([...open, ...doneToday].map((t) => t.id));
    const untaggedPast = tasks
      .filter((t) => !t.category && !shown.has(t.id))
      .sort((a, b) => (b.completedAt ?? b.dueDate).localeCompare(a.completedAt ?? a.dueDate));
    return { open, doneToday, untaggedPast };
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
      category: newCat,
      sortOrder: maxOrder + 1,
      carriedCount: 0,
      ...(newProject ? { projectId: newProject } : {}),
    });
  }

  async function setCat(id: string, category: TaskCategory) {
    if (!uid) return;
    await updateItem(uid, "tasks", id, { category });
  }

  // null clears the link; updateDoc with deleteField would be cleaner but an
  // empty string is enough to mean "unlinked" for the project rollup filter.
  async function setProject(id: string, projectId: string | null) {
    if (!uid) return;
    await updateItem(uid, "tasks", id, { projectId: projectId ?? "" });
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

      <form onSubmit={add} className="mb-4 space-y-2">
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Add a task…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0">
            Add
          </button>
        </div>
        {/* Area toggle for the new task — sticky for the session. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(["hugga", "personal"] as TaskCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNewCat(c)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                newCat === c ? CAT_CHIP[c] : "bg-bg text-muted hover:text-ink"
              }`}
            >
              {CAT_LABEL[c]}
            </button>
          ))}
          {projects.length > 0 && (
            <>
              <span className="mx-0.5 text-line">·</span>
              <select
                value={newProject ?? ""}
                onChange={(e) => setNewProject(e.target.value || null)}
                className="rounded-full bg-bg px-2.5 py-1 text-[11px] font-semibold text-muted outline-none transition hover:text-ink focus:text-ink"
                aria-label="Link new task to a project"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </form>

      {open.length === 0 && doneToday.length === 0 && untaggedPast.length === 0 && (
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
                  ? "group rounded-lg border-l-2 border-indigo bg-indigo/[0.04] py-2.5 pl-3.5 pr-2"
                  : "group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-bg"
              }
            >
              {isTop && (
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo/80">
                  Most important
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggle(task)}
                  aria-label="Complete task"
                  className={`h-5 w-5 shrink-0 rounded-full border-2 transition hover:border-indigo ${
                    isTop ? "border-indigo/60" : "border-line"
                  }`}
                />
                <span className={`flex-1 text-sm ${isTop ? "font-semibold" : ""}`}>
                  {task.title}
                </span>
                {carried > 0 && (
                  <span className="shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-amber">
                    carried {carried}d · {prettyDate(task.dueDate)}
                  </span>
                )}
                <CatChip category={task.category} onSet={(c) => setCat(task.id, c)} />
                <ProjectChip
                  projectId={task.projectId}
                  projects={projects}
                  onSet={(id) => setProject(task.id, id)}
                />
                <div className="flex shrink-0 flex-col text-[9px] leading-none text-muted/50 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move task up"
                    className="px-1 py-0.5 transition hover:text-indigo disabled:opacity-0"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === open.length - 1}
                    aria-label="Move task down"
                    className="px-1 py-0.5 transition hover:text-indigo disabled:opacity-0"
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
              <CatChip category={task.category} onSet={(c) => setCat(task.id, c)} />
              <ProjectChip
                projectId={task.projectId}
                projects={projects}
                onSet={(id) => setProject(task.id, id)}
              />
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

      {/* Retroactive tagging: every untagged task not already shown above. */}
      {untaggedPast.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <button
            onClick={() => setShowUntagged((s) => !s)}
            className="flex w-full items-center justify-between text-xs font-semibold text-muted hover:text-ink"
          >
            <span>Untagged past to-dos ({untaggedPast.length})</span>
            <span className="text-[10px]">{showUntagged ? "▲ hide" : "▼ show"}</span>
          </button>
          {showUntagged && (
            <ul className="mt-2 max-h-72 space-y-1 overflow-auto pr-1">
              {untaggedPast.map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg">
                  <span className={`flex-1 text-sm ${task.completedAt ? "text-muted line-through" : ""}`}>
                    {task.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted/60">{prettyDate(task.dueDate)}</span>
                  <button
                    onClick={() => setCat(task.id, "hugga")}
                    className="shrink-0 rounded-full bg-indigo/10 px-2 py-0.5 text-[10px] font-semibold text-indigo hover:bg-indigo/20"
                  >
                    Hugga
                  </button>
                  <button
                    onClick={() => setCat(task.id, "personal")}
                    className="shrink-0 rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold text-teal hover:bg-teal/20"
                  >
                    Personal
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
