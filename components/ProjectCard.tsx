"use client";

import { useMemo, useState } from "react";
import { updateItem, deleteItem } from "@/lib/data";
import type { Milestone, Task, TrackedProject } from "@/lib/types";
import { CAT_CHIP, CAT_LABEL } from "@/lib/categories";
import { prettyDate, todayStr } from "@/lib/dates";

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) / 86_400_000
  );
}

function daysUntil(dateStr: string): string {
  const d = daysBetween(todayStr(), dateStr);
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return "due today";
  return `in ${d}d`;
}

// "took 13 days", with a rough week/month gloss once it gets long.
function tookLabel(days: number): string {
  if (days <= 0) return "done same day";
  if (days === 1) return "took 1 day";
  if (days < 21) return `took ${days} days`;
  if (days < 60) return `took ${days} days (~${Math.round(days / 7)} wks)`;
  return `took ${days} days (~${Math.round(days / 30)} mo)`;
}

// One tracked project: milestone checklist with a progress bar, plus a rollup of
// the to-dos tagged to it. `tasks` is the full task list; we filter to this
// project here so the page can pass it once.
export default function ProjectCard({
  project,
  tasks,
  uid,
  onMoveUp,
  onMoveDown,
}: {
  project: TrackedProject;
  tasks: Task[];
  uid: string | null;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [newMilestone, setNewMilestone] = useState("");
  const [showTodos, setShowTodos] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editDesc, setEditDesc] = useState(project.description ?? "");
  const [editLink, setEditLink] = useState(project.link ?? "");
  const [editStart, setEditStart] = useState(project.startDate ?? project.createdAt.slice(0, 10));
  const [editTarget, setEditTarget] = useState(project.targetDate ?? "");
  const [editCompleted, setEditCompleted] = useState(project.completedDate ?? "");
  const [completing, setCompleting] = useState(false);
  const [completeDate, setCompleteDate] = useState(todayStr());

  const isActive = project.status === "active" || !project.status;
  const isCompleted = project.status === "completed";
  const startDate = project.startDate ?? project.createdAt.slice(0, 10);

  const milestones = project.milestones ?? [];
  const doneCount = milestones.filter((m) => m.done).length;
  const pct = milestones.length ? Math.round((doneCount / milestones.length) * 100) : 0;
  const allMilestonesDone = milestones.length > 0 && doneCount === milestones.length;

  const linked = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id]
  );
  const openTodos = linked.filter((t) => !t.completedAt);
  const doneTodos = linked.filter((t) => t.completedAt);

  // All milestone edits rewrite the embedded array, mirroring Injury.checkIns /
  // AnnieInterest.facilitation.
  function writeMilestones(next: Milestone[]) {
    if (!uid) return;
    updateItem(uid, "trackedProjects", project.id, { milestones: next });
  }

  function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    const title = newMilestone.trim();
    if (!title) return;
    setNewMilestone("");
    writeMilestones([...milestones, { id: crypto.randomUUID(), title, done: false }]);
  }

  function toggleMilestone(id: string) {
    writeMilestones(milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)));
  }

  function removeMilestone(id: string) {
    writeMilestones(milestones.filter((m) => m.id !== id));
  }

  function toggleTodo(task: Task) {
    if (!uid) return;
    updateItem(uid, "tasks", task.id, {
      completedAt: task.completedAt ? null : new Date().toISOString(),
    });
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!uid || !editName.trim()) return;
    updateItem(uid, "trackedProjects", project.id, {
      name: editName.trim(),
      description: editDesc.trim(),
      link: editLink.trim(),
      startDate: editStart || project.createdAt.slice(0, 10),
      targetDate: editTarget || "",
      ...(isCompleted ? { completedDate: editCompleted || todayStr() } : {}),
    });
    setEditing(false);
  }

  function complete(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;
    updateItem(uid, "trackedProjects", project.id, {
      status: "completed",
      completedDate: completeDate || todayStr(),
    });
    setEditCompleted(completeDate || todayStr());
    setCompleting(false);
  }

  // Back to active from either completed or archived. completedDate is cleared
  // so a reopened project doesn't carry a stale finish date.
  function reopen() {
    if (!uid) return;
    updateItem(uid, "trackedProjects", project.id, {
      status: "active",
      completedDate: "",
    });
  }

  function archive() {
    if (!uid) return;
    updateItem(uid, "trackedProjects", project.id, { status: "archived" });
  }

  function remove() {
    if (!uid) return;
    if (!confirm(`Delete "${project.name}"? This can't be undone.`)) return;
    deleteItem(uid, "trackedProjects", project.id);
  }

  if (editing) {
    return (
      <form onSubmit={saveEdit} className="card space-y-3 p-4">
        <input
          className="input"
          placeholder="Project name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
        <textarea
          className="input min-h-[70px]"
          placeholder="Description (optional)"
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
        />
        <div className="flex gap-2">
          <label className="flex-1 text-xs font-semibold text-muted">
            Start date
            <input
              type="date"
              className="input mt-1"
              value={editStart}
              onChange={(e) => setEditStart(e.target.value)}
            />
          </label>
          <label className="flex-1 text-xs font-semibold text-muted">
            Target finish (optional)
            <input
              type="date"
              className="input mt-1"
              value={editTarget}
              onChange={(e) => setEditTarget(e.target.value)}
            />
          </label>
          {isCompleted && (
            <label className="flex-1 text-xs font-semibold text-muted">
              Finished
              <input
                type="date"
                className="input mt-1"
                value={editCompleted}
                onChange={(e) => setEditCompleted(e.target.value)}
              />
            </label>
          )}
        </div>
        <input
          className="input"
          placeholder="Link — repo, site, or doc (optional)"
          value={editLink}
          onChange={(e) => setEditLink(e.target.value)}
        />
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1">
            Save changes
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost flex-1">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className="card group p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{project.name}</h3>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${CAT_CHIP[project.category]}`}
            >
              {CAT_LABEL[project.category]}
            </span>
          </div>
          {project.description && (
            <p className="mt-0.5 text-sm text-muted">{project.description}</p>
          )}
          {project.link && (
            <a
              href={project.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-block text-xs font-medium text-indigo hover:underline"
            >
              {project.link.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-3">
          {/* Priority arrows — kept visible so reordering is discoverable. */}
          {(onMoveUp || onMoveDown) && (
            <div className="flex flex-col text-[11px] leading-none text-muted/50">
              <button
                onClick={onMoveUp}
                disabled={!onMoveUp}
                aria-label="Raise priority"
                className="px-1 py-0.5 transition hover:text-indigo disabled:opacity-0"
              >
                ▲
              </button>
              <button
                onClick={onMoveDown}
                disabled={!onMoveDown}
                aria-label="Lower priority"
                className="px-1 py-0.5 transition hover:text-indigo disabled:opacity-0"
              >
                ▼
              </button>
            </div>
          )}
          <div className="flex gap-3">
            {isActive ? (
              <button
                onClick={() => setCompleting((c) => !c)}
                className="text-xs font-semibold text-teal hover:text-ink"
              >
                Complete
              </button>
            ) : (
              <button onClick={reopen} className="text-xs text-muted hover:text-ink">
                {isCompleted ? "Reopen" : "Unarchive"}
              </button>
            )}
            <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-ink">
              Edit
            </button>
            {isActive && (
              <button onClick={archive} className="text-xs text-muted hover:text-ink">
                Archive
              </button>
            )}
            <button onClick={remove} className="text-xs text-muted hover:text-coral">
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Created + target dates */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>Started {prettyDate(startDate)}</span>
        {isCompleted && project.completedDate ? (
          <span className="flex items-center gap-1.5">
            <span>· Finished {prettyDate(project.completedDate)}</span>
            <span className="rounded-full bg-teal/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal">
              {tookLabel(daysBetween(startDate, project.completedDate))}
            </span>
            {project.targetDate && (
              <span className="text-[10px] text-muted/70">
                {daysBetween(project.targetDate, project.completedDate) <= 0
                  ? "on time"
                  : `${daysBetween(project.targetDate, project.completedDate)}d past target`}
              </span>
            )}
          </span>
        ) : (
          isActive &&
          project.targetDate && (
            <span className="flex items-center gap-1.5">
              <span>· Target {prettyDate(project.targetDate)}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  daysUntil(project.targetDate).includes("overdue")
                    ? "bg-coral/15 text-coral"
                    : "bg-amber/15 text-amber"
                }`}
              >
                {daysUntil(project.targetDate)}
              </span>
            </span>
          )
        )}
      </div>

      {completing && (
        <form
          onSubmit={complete}
          className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-teal/10 p-2.5"
        >
          <label className="text-xs font-semibold text-muted">
            Finished on
            <input
              type="date"
              className="input mt-1 py-1.5 text-sm"
              value={completeDate}
              onChange={(e) => setCompleteDate(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary px-3 py-1.5 text-sm">
            Mark complete
          </button>
          <button
            type="button"
            onClick={() => setCompleting(false)}
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </form>
      )}

      {isActive && allMilestonesDone && !completing && (
        <button
          onClick={() => setCompleting(true)}
          className="mt-3 w-full rounded-lg bg-teal/10 px-3 py-2 text-left text-xs font-semibold text-teal transition hover:bg-teal/20"
        >
          All milestones done. Mark this project complete? →
        </button>
      )}

      {/* Progress bar */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span className="font-semibold">
            {milestones.length
              ? `${doneCount}/${milestones.length} milestones`
              : "No milestones yet"}
          </span>
          {milestones.length > 0 && <span className="tabular-nums">{pct}%</span>}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-indigo transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Milestone checklist */}
      <ul className="mt-3 space-y-1">
        {milestones.map((m) => (
          <li
            key={m.id}
            className="group/m flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-bg"
          >
            <button
              onClick={() => toggleMilestone(m.id)}
              aria-label={m.done ? "Mark milestone incomplete" : "Complete milestone"}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[9px] transition ${
                m.done ? "border-teal bg-teal text-white" : "border-line hover:border-indigo"
              }`}
            >
              {m.done ? "✓" : ""}
            </button>
            <span className={`flex-1 text-sm ${m.done ? "text-muted line-through" : ""}`}>
              {m.title}
            </span>
            <button
              onClick={() => removeMilestone(m.id)}
              className="shrink-0 text-muted opacity-0 transition group-hover/m:opacity-100 hover:text-coral"
              aria-label="Delete milestone"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {isActive && (
        <form onSubmit={addMilestone} className="mt-2 flex gap-2">
          <input
            className="input py-1.5 text-sm"
            placeholder="Add a milestone…"
            value={newMilestone}
            onChange={(e) => setNewMilestone(e.target.value)}
          />
          <button type="submit" className="btn-ghost shrink-0 px-3 py-1.5 text-sm">
            Add
          </button>
        </form>
      )}

      {/* To-do rollup */}
      {linked.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <button
            onClick={() => setShowTodos((s) => !s)}
            className="flex w-full items-center justify-between text-xs font-semibold text-muted hover:text-ink"
          >
            <span>
              To-dos · {openTodos.length} open · {doneTodos.length} done
            </span>
            <span className="text-[10px]">{showTodos ? "▲ hide" : "▼ show"}</span>
          </button>
          {showTodos && (
            <ul className="mt-2 space-y-1">
              {[...openTodos, ...doneTodos].map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-bg"
                >
                  <button
                    onClick={() => toggleTodo(task)}
                    aria-label={task.completedAt ? "Mark incomplete" : "Complete task"}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[9px] transition ${
                      task.completedAt
                        ? "border-teal bg-teal text-white"
                        : "border-line hover:border-indigo"
                    }`}
                  >
                    {task.completedAt ? "✓" : ""}
                  </button>
                  <span
                    className={`flex-1 text-sm ${task.completedAt ? "text-muted line-through" : ""}`}
                  >
                    {task.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted/60">
                    {prettyDate(task.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
