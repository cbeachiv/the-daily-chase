"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type { AnnieInterest, AnnieMoment, AnnieMomentKind } from "@/lib/types";
import { ageLabel, prettyDate, prettyMonth, todayStr } from "@/lib/dates";
import { uploadAnnieMedia, deleteAnnieMedia } from "@/lib/storage";

const KINDS: { value: AnnieMomentKind; label: string; emoji: string }[] = [
  { value: "moment", label: "Moment", emoji: "✨" },
  { value: "ageUpdate", label: "Age Update", emoji: "🎂" },
  { value: "first", label: "First", emoji: "🌱" },
  { value: "milestone", label: "Milestone", emoji: "🏁" },
  { value: "funny", label: "Funny", emoji: "😄" },
  { value: "note", label: "Note", emoji: "📝" },
];

function kindMeta(kind?: AnnieMomentKind) {
  return KINDS.find((k) => k.value === kind) ?? KINDS[0];
}

// Full-screen viewer for a tapped photo/video. Click backdrop or Escape to close.
function Lightbox({
  url,
  type,
  onClose,
}: {
  url: string;
  type: "image" | "video";
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-lg text-white hover:bg-white/25"
        aria-label="Close"
      >
        ✕
      </button>
      {type === "video" ? (
        <video
          src={url}
          controls
          autoPlay
          playsInline
          className="max-h-[90vh] max-w-full rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Annie"
          className="max-h-[90vh] max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
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
    mediaType: "image" as "image" | "video",
  });
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [lightbox, setLightbox] = useState<{ url: string; type: "image" | "video" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => [...moments].sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`)),
    [moments],
  );
  const visible = showAll ? sorted : sorted.slice(0, 6);

  // Group the visible moments into month sections (e.g. "June 2026") so the
  // feed can show a sticky date header while scrolling, like the Photos app.
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: AnnieMoment[] }[] = [];
    for (const m of visible) {
      const key = m.date.slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(m);
      else out.push({ key, label: prettyMonth(m.date), items: [m] });
    }
    return out;
  }, [visible]);

  function openForm() {
    setForm(emptyForm());
    setEditingId(null);
    setUploadError("");
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
      mediaType: m.mediaType ?? "image",
    });
    setEditingId(m.id);
    setUploadError("");
    setShowForm(true);
  }

  function closeForm() {
    setForm(emptyForm());
    setEditingId(null);
    setUploadError("");
    setShowForm(false);
  }

  async function onPickMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    setUploadError("");
    setUploading(true);
    try {
      const { url, path, mediaType } = await uploadAnnieMedia(uid, file);
      setForm((f) => ({ ...f, photoUrl: url, photoPath: path, mediaType }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearMedia() {
    if (form.photoPath) await deleteAnnieMedia(form.photoPath);
    setForm((f) => ({ ...f, photoUrl: "", photoPath: "", mediaType: "image" }));
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
      mediaType: form.photoUrl ? form.mediaType : null,
    };
    if (editingId) await updateItem(uid, "annieMoments", editingId, payload);
    else await addItem(uid, "annieMoments", payload);
    closeForm();
  }

  async function remove(m: AnnieMoment) {
    if (!uid) return;
    if (m.photoPath) await deleteAnnieMedia(m.photoPath);
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

          {form.kind === "ageUpdate" && (
            <p className="text-xs text-muted">
              📅 At this date she&apos;s <span className="font-semibold text-ink">{ageLabel(form.date)}</span> old.
            </p>
          )}

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

          {/* Photo / video */}
          <div>
            {form.photoUrl ? (
              <div className="relative inline-block">
                {form.mediaType === "video" ? (
                  <video
                    src={form.photoUrl}
                    controls
                    playsInline
                    className="max-h-48 rounded-lg border border-line"
                  />
                ) : (
                  // Firebase Storage URLs are remote; plain img avoids next/image config.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.photoUrl}
                    alt="Annie"
                    className="max-h-48 rounded-lg border border-line object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={clearMedia}
                  className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-coral text-xs text-white shadow"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="btn-ghost cursor-pointer px-3 py-2 text-xs">
                {uploading ? "Uploading…" : "📷 Add photo / video"}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={onPickMedia}
                  disabled={uploading}
                />
              </label>
            )}
            {uploadError && <p className="mt-1 text-xs text-coral">{uploadError}</p>}
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

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.key}>
            {/* Sticky month label — stays pinned while you scroll the section.
                Sits below the desktop top nav (sm:top-14); pins to the very top on mobile. */}
            <h3 className="sticky top-0 z-10 -mx-4 mb-2 bg-card/95 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur sm:-mx-5 sm:top-14 sm:px-5">
              {g.label}
            </h3>
            <div className="space-y-2">
              {g.items.map((m) => {
                const meta = kindMeta(m.kind);
                const interest = m.interestId ? interests.find((i) => i.id === m.interestId) : null;
                const isVideo = m.mediaType === "video";
                return (
                  <article key={m.id} className="group rounded-lg border border-line bg-bg/50 p-3">
              <div className="flex items-start gap-3">
                {m.photoUrl && (
                  <button
                    type="button"
                    onClick={() => setLightbox({ url: m.photoUrl!, type: isVideo ? "video" : "image" })}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line"
                    aria-label="View media"
                  >
                    {isVideo ? (
                      <>
                        <video src={m.photoUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                        <span className="absolute inset-0 grid place-items-center bg-black/25 text-white">▶</span>
                      </>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.photoUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">
                      {meta.emoji} {m.kind === "ageUpdate" ? ageLabel(m.date) : meta.label}
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
          </div>
        ))}
      </div>

      {sorted.length > 6 && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="mt-2 w-full text-center text-xs font-semibold text-indigo"
        >
          {showAll ? "Show less" : `Show all ${sorted.length}`}
        </button>
      )}

      {lightbox && (
        <Lightbox url={lightbox.url} type={lightbox.type} onClose={() => setLightbox(null)} />
      )}
    </section>
  );
}
