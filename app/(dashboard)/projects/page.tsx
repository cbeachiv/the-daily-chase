"use client";

import { useMemo, useState } from "react";
import { orderBy } from "firebase/firestore";
import { useCollection, addItem, updateItem } from "@/lib/data";
import type { Task, TaskCategory, TrackedProject } from "@/lib/types";
import { CAT_CHIP, CAT_LABEL } from "@/lib/categories";
import ProjectCard from "@/components/ProjectCard";

export default function ProjectsPage() {
  const { data: projects, uid } = useCollection<TrackedProject>("trackedProjects", [
    orderBy("sortOrder", "asc"),
  ]);
  const { data: tasks } = useCollection<Task>("tasks");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [newCat, setNewCat] = useState<TaskCategory>("hugga");
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { hugga, personal, archived } = useMemo(() => {
    const active = projects.filter((p) => p.status !== "archived");
    return {
      hugga: active.filter((p) => p.category === "hugga"),
      personal: active.filter((p) => p.category === "personal"),
      archived: projects.filter((p) => p.status === "archived"),
    };
  }, [projects]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !uid) return;
    // New projects sort to the top of their group so the newest is the default
    // priority; reorder arrows then let you push the important ones up.
    const minOrder = projects.reduce((m, p) => Math.min(m, p.sortOrder), 0);
    await addItem(uid, "trackedProjects", {
      name: name.trim(),
      description: description.trim(),
      category: newCat,
      status: "active",
      milestones: [],
      link: link.trim(),
      targetDate: targetDate || "",
      sortOrder: minOrder - 1,
    });
    setName("");
    setDescription("");
    setLink("");
    setTargetDate("");
    setShowForm(false);
  }

  // Reorder within a group by swapping sortOrder with the neighbor — same
  // pattern as the to-do list. `list` is the already-sorted group.
  async function move(list: TrackedProject[], index: number, dir: -1 | 1) {
    if (!uid) return;
    const a = list[index];
    const b = list[index + dir];
    if (!a || !b) return;
    await Promise.all([
      updateItem(uid, "trackedProjects", a.id, { sortOrder: b.sortOrder }),
      updateItem(uid, "trackedProjects", b.id, { sortOrder: a.sortOrder }),
    ]);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Projects</h1>
          <p className="text-sm text-muted">What you&apos;re building right now.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          {showForm ? "Close" : "+ Project"}
        </button>
      </header>

      {showForm && (
        <form onSubmit={add} className="card space-y-3 p-4">
          <input
            className="input"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="input min-h-[70px]"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="block text-xs font-semibold text-muted">
            Target finish date (optional)
            <input
              type="date"
              className="input mt-1"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </label>
          <input
            className="input"
            placeholder="Link — repo, site, or doc (optional)"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <div className="flex gap-1.5">
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
          </div>
          <button type="submit" className="btn-primary w-full">
            Add project
          </button>
        </form>
      )}

      {hugga.length === 0 && personal.length === 0 && archived.length === 0 && !showForm && (
        <p className="card p-6 text-center text-sm text-muted">
          No projects yet. Add your first one above. ✦
        </p>
      )}

      {hugga.length > 0 && (
        <section className="space-y-3">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Hugga</h2>
          {hugga.map((p, i) => (
            <ProjectCard
              key={p.id}
              project={p}
              tasks={tasks}
              uid={uid}
              onMoveUp={i > 0 ? () => move(hugga, i, -1) : undefined}
              onMoveDown={i < hugga.length - 1 ? () => move(hugga, i, 1) : undefined}
            />
          ))}
        </section>
      )}

      {personal.length > 0 && (
        <section className="space-y-3">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Personal</h2>
          {personal.map((p, i) => (
            <ProjectCard
              key={p.id}
              project={p}
              tasks={tasks}
              uid={uid}
              onMoveUp={i > 0 ? () => move(personal, i, -1) : undefined}
              onMoveDown={i < personal.length - 1 ? () => move(personal, i, 1) : undefined}
            />
          ))}
        </section>
      )}

      {archived.length > 0 && (
        <section className="space-y-3 border-t border-line pt-4">
          <button
            onClick={() => setShowArchived((s) => !s)}
            className="flex w-full items-center justify-between text-xs font-semibold text-muted hover:text-ink"
          >
            <span>Archived ({archived.length})</span>
            <span className="text-[10px]">{showArchived ? "▲ hide" : "▼ show"}</span>
          </button>
          {showArchived &&
            archived.map((p) => <ProjectCard key={p.id} project={p} tasks={tasks} uid={uid} />)}
        </section>
      )}
    </div>
  );
}
