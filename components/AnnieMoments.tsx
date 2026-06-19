"use client";

import { useMemo, useRef, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type { AnnieInterest, AnnieMoment, AnnieMomentKind } from "@/lib/types";
import { prettyDate, todayStr } from "@/lib/dates";
import { uploadAnniePhoto, deleteAnniePhoto } from "@/lib/storage";

const KINDS: { value: AnnieMomentKind; label: string; emoji: string }[] = [
  { value: "moment", label: "Moment", emoji: "✨" },
  { value: "first", label: "First", emoji: "🌱" },
  { value: "milestone", label: "Milestone", emoji: "🏁" },
  { value: "funny", label: "Funny", emoji: "😄" },
  { value: "note", label: "Note", emoji: "📝" },
];

function kindMeta(kind?: AnnieMomentKind) {
  return KINDS.find((k) => k.value === kind) ?? KINDS[0];
}

export default function AnnieMoments() {
  const today = todayStr();
  const { data: moments, uid } = useCollection<AnnieMoment>("annieMoments");
  const { data: interests } = useCollection<AnnieInterest>("annieInterests");

  const activeInterests = useMemo(
    () => interests.filter((i) => i.status === "active"),
    [interests],
  );

  const emptyForm = () => ({
    text: "",
    date: today,
    kind: "moment" as AnnieMomentKind,
    interestId: "",
    photoUrl: "",
    photoPath: "",
  });
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => [...moments].sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`)),
    [moments],
  );
  const visible = showAll ? sorted : sorted.slice(0, 6);

  function openForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(m: AnnieMoment) {
    setForm({
      text: m.text,
      date: m.date,
      kind: m.kind ?? "moment",
      interestId: m.interestId ?? "",
      photoUrl: m.photoUrl ?? "",
      photoPath: m.photoPath ?? "",
    });
    setEditingId(m.id);
    setShowForm(true);
  }

  function closeForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    setUploading(true);
    try {
      const { url, path } = await uploadAnniePhoto(uid, file);
      setForm((f) => ({ ...f, photoUrl: url, photoPath: path }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearPhoto() {
    if (form.photoPath) await deleteAnniePhoto(form.photoPath);
    setForm((f) => ({ ...f, photoUrl: "", photoPath: "" }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.text.trim() || !form.date || !uid) return;
    const payload: Record<string, unknown> = {
      text: form.text.trim(),
      date: form.date,
      kind: form.kind,
      interestId: form.interestId || null,
      photoUrl: form.photoUrl || null,
      photoPath: form.photoPath || null,
    };
    if (editingId) await updateItem(uid, "annieMoments", editingId, payload);
    else await addItem(uid, "annieMoments", payload);
    closeForm();
  }

  async function remove(m: AnnieMoment) {
    if (!uid) return;
    if (m.photoPath) await deleteAnniePhoto(m.photoPath);
    await deleteItem(uid, "annieMoments", m.id);
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="section-title">Moments</h2>
          <span className="text-xs text-muted">{moments.length} logged</span>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : openForm())}
          className="btn-primary shrink-0 px-3 py-1.5 text-xs"
        >
          {showForm ? "Close" : "+ Moment"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-lg border border-line bg-bg/50 p-4">
          <textarea
            className="input min-h-[70px] resize-y"
            placeholder="What happened? A first, a funny thing, a moment to remember…"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            autoFocus
          />

          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setForm({ ...form, kind: k.value })}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  form.kind === k.value
                    ? "border-pink bg-pink/10 text-ink"
                    : "border-line bg-card text-muted hover:text-ink"
                }`}
              >
                {k.emoji} {k.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex-1 text-xs font-semibold text-muted">
              Date
              <input
                type="date"
                className="input mt-1"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            {activeInterests.length > 0 && (
              <label className="flex-1 text-xs font-semibold text-muted">
                Link to an interest (optional)
                <select
                  className="input mt-1"
                  value={form.interestId}
                  onChange={(e) => setForm({ ...form, interestId: e.target.value })}
                >
                  <option value="">—</option>
                  {activeInterests.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Photo */}
          <div>
            {form.photoUrl ? (
              <div className="relative inline-block">
                {/* Firebase Storage URLs are remote; plain img avoids next/image config. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.photoUrl}
                  alt="Annie"
                  className="max-h-48 rounded-lg border border-line object-cover"
                />
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-coral text-xs text-white shadow"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="btn-ghost cursor-pointer px-3 py-2 text-xs">
                {uploading ? "Uploading…" : "📷 Add photo"}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickPhoto}
                  disabled={uploading}
                />
              </label>
            )}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={uploading}>
            {editingId ? "Save changes" : "Add moment"}
          </button>
        </form>
      )}

      {sorted.length === 0 && !showForm && (
        <p className="py-2 text-sm text-muted">
          No moments yet — tap &ldquo;+ Moment&rdquo; to start her story.
        </p>
      )}

      <div className="space-y-2">
        {visible.map((m) => {
          const meta = kindMeta(m.kind);
          const interest = m.interestId ? interests.find((i) => i.id === m.interestId) : null;
          return (
            <article key={m.id} className="group rounded-lg border border-line bg-bg/50 p-3">
              <div className="flex items-start gap-3">
                {m.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.photoUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">
                      {meta.emoji} {meta.label}
                      {m.source === "weekly" && " · from weekly review"}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{prettyDate(m.date)}</span>
                  </div>
                  <p className="mt-0.5 text-sm">{m.text}</p>
                  {interest && (
                    <p className="mt-1 text-xs text-pink">↳ {interest.title}</p>
                  )}
                  <div className="mt-1.5 flex gap-3 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => startEdit(m)} className="text-xs text-muted hover:text-ink">
                      Edit
                    </button>
                    <button onClick={() => remove(m)} className="text-xs text-muted hover:text-coral">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {sorted.length > 6 && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="mt-2 w-full text-center text-xs font-semibold text-indigo"
        >
          {showAll ? "Show less" : `Show all ${sorted.length}`}
        </button>
      )}
    </section>
  );
}
