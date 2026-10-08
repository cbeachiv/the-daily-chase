"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import { auth } from "@/lib/firebase/client";
import type { HomeInspiration as Pin } from "@/lib/types";
import { firstUrl, INSPIRATION, ROOMS, youTubeId, youTubeThumb } from "@/lib/inspiration";
import { uploadInspirationImage, deleteInspirationImage } from "@/lib/storage";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Full-screen viewer: a photo, or the YouTube video playing inline. Arrow
// buttons, ←/→ keys, and swiping step through the rest of the board.
function Lightbox({
  pins,
  index,
  onIndex,
  onClose,
}: {
  pins: Pin[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const pin = pins[index];
  const count = pins.length;
  const go = useCallback(
    (step: number) => count > 1 && onIndex((index + step + count) % count),
    [index, count, onIndex],
  );
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, go]);

  if (!pin) return null;
  const arrow =
    "absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/30";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-lg text-white hover:bg-white/25"
        aria-label="Close"
      >
        ✕
      </button>
      {count > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className={`${arrow} left-2 sm:left-4`}
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className={`${arrow} right-2 sm:right-4`}
            aria-label="Next"
          >
            ›
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60">
            {index + 1} / {count}
          </div>
        </>
      )}
      <div className="w-full max-w-5xl px-10 sm:px-14" onClick={(e) => e.stopPropagation()}>
        {pin.kind === "youtube" && pin.youtubeId ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              key={pin.id}
              src={`https://www.youtube-nocookie.com/embed/${pin.youtubeId}?autoplay=1&rel=0`}
              title={pin.title ?? "YouTube video"}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={pin.id}
            src={pin.url}
            alt={pin.note ?? pin.title ?? ""}
            className="mx-auto max-h-[80vh] max-w-full rounded-lg object-contain"
          />
        )}
        {(pin.title || pin.note) && (
          <div className="mt-3 text-center text-sm text-white/85">
            {pin.title && <div className="font-semibold">{pin.title}</div>}
            {pin.note && <div className="mt-0.5 text-white/70">{pin.note}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// Note + room editor for one pin.
function EditPin({
  pin,
  rooms,
  onSave,
  onDelete,
  onClose,
}: {
  pin: Pin;
  rooms: string[];
  onSave: (patch: { note?: string; room?: string }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState(pin.note ?? "");
  const [room, setRoom] = useState(pin.room ?? "");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="card w-full max-w-sm space-y-3 p-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ note: note.trim() || undefined, room: room.trim() || undefined });
        }}
      >
        <h3 className="section-title">Edit pin</h3>
        <textarea
          className="input min-h-[70px] resize-y"
          placeholder="What do you like about it?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">Room</div>
          <div className="flex flex-wrap gap-1.5">
            {rooms.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoom(room === r ? "" : r)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  room === r ? "border-indigo bg-indigo text-white" : "border-line text-muted hover:text-ink"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            className="input mt-2"
            placeholder="Or type a new one"
            value={rooms.includes(room) ? "" : room}
            onChange={(e) => setRoom(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => confirm("Remove this pin?") && onDelete()}
            className="text-xs font-medium text-coral hover:underline"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost px-3 py-1.5 text-xs">
              Cancel
            </button>
            <button type="submit" className="btn-primary px-3 py-1.5 text-xs">
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function PinCard({ pin, onOpen, onEdit }: { pin: Pin; onOpen: () => void; onEdit: () => void }) {
  const thumb = pin.kind === "image" ? pin.url : pin.imageUrl;
  const isLink = pin.kind === "link";
  const media = thumb ? (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt={pin.note ?? pin.title ?? ""} loading="lazy" className="block w-full" />
      {pin.kind === "youtube" && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-16 place-items-center rounded-xl bg-black/70 text-xl text-white">▶</span>
        </span>
      )}
    </div>
  ) : (
    <div className="grid aspect-[4/3] place-items-center bg-bg text-3xl text-muted">🔗</div>
  );

  return (
    <article className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border border-line bg-card shadow-card">
      {isLink ? (
        <a href={pin.url} target="_blank" rel="noopener noreferrer" className="block">
          {media}
        </a>
      ) : (
        <button onClick={onOpen} className="block w-full text-left">
          {media}
        </button>
      )}
      {(pin.title || pin.note || pin.room || isLink) && (
        <div className="space-y-1 p-2.5">
          {pin.title && <div className="line-clamp-2 text-xs font-semibold leading-snug">{pin.title}</div>}
          {pin.note && <div className="text-xs text-muted">{pin.note}</div>}
          <div className="flex items-center gap-2 text-[11px] text-muted">
            {pin.room && <span className="rounded-full bg-bg px-2 py-0.5 font-medium">{pin.room}</span>}
            {pin.kind !== "image" && (
              <a href={pin.url} target="_blank" rel="noopener noreferrer" className="truncate hover:text-ink">
                {hostOf(pin.url)} ↗
              </a>
            )}
          </div>
        </div>
      )}
      <button
        onClick={onEdit}
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-sm text-white opacity-100 transition hover:bg-black/75 sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="Edit pin"
      >
        ✎
      </button>
    </article>
  );
}

export default function HomeInspiration() {
  const { data: pins, uid, loading } = useCollection<Pin>(INSPIRATION);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [editing, setEditing] = useState<Pin | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => [...pins].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [pins],
  );
  const usedRooms = useMemo(
    () => Array.from(new Set(pins.map((p) => p.room).filter((r): r is string => !!r))).sort(),
    [pins],
  );
  const allRooms = useMemo(() => Array.from(new Set([...ROOMS, ...usedRooms])), [usedRooms]);
  const visible = filter ? sorted.filter((p) => p.room === filter) : sorted;
  // Photos and videos open in the viewer; plain links open their site instead.
  const viewable = useMemo(() => visible.filter((p) => p.kind !== "link"), [visible]);

  // New pins land in whatever room you're looking at.
  const room = filter || undefined;

  const addUrl = useCallback(
    async (raw: string) => {
      if (!uid) return;
      const url = firstUrl(raw);
      if (!url) {
        setError("Paste a link that starts with http(s)://");
        return;
      }
      setError("");
      setBusy((n) => n + 1);
      try {
        // Save YouTube instantly; the title fills in once the preview returns.
        const yt = youTubeId(url);
        let preview: Partial<Pin> = yt
          ? { kind: "youtube", url, youtubeId: yt, imageUrl: youTubeThumb(yt) }
          : { kind: "link", url };
        try {
          const token = await auth.currentUser?.getIdToken();
          const res = await fetch("/api/inspiration/preview", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify({ url }),
          });
          if (res.ok) preview = await res.json();
        } catch {
          // Offline or preview failed: keep the bare pin.
        }
        await addItem(uid, INSPIRATION, { ...preview, room, source: "web" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that link");
      } finally {
        setBusy((n) => n - 1);
      }
    },
    [uid, room],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!uid) return;
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (!images.length) {
        if (files.length) setError("Only photos can be added here");
        return;
      }
      setError("");
      setBusy((n) => n + images.length);
      await Promise.all(
        images.map(async (f) => {
          try {
            const { url, path } = await uploadInspirationImage(uid, f);
            await addItem(uid, INSPIRATION, { kind: "image", url, path, room, source: "web" });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
          } finally {
            setBusy((n) => n - 1);
          }
        }),
      );
    },
    [uid, room],
  );

  // Cmd+V anywhere on the page: images upload, links pin. Typing in a field
  // (other than the add box, which handles its own submit) is left alone.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.some((f) => f.type.startsWith("image/"))) {
        e.preventDefault();
        addFiles(files);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const pasted = e.clipboardData?.getData("text") ?? "";
      if (firstUrl(pasted)) {
        e.preventDefault();
        addUrl(pasted);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles, addUrl]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) return addFiles(files);
    const dropped = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text");
    if (dropped) addUrl(dropped);
  }

  async function remove(pin: Pin) {
    if (!uid) return;
    setEditing(null);
    await deleteItem(uid, INSPIRATION, pin.id);
    if (pin.path) deleteInspirationImage(pin.path);
  }

  return (
    <div
      className="relative space-y-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Home Inspiration</h1>
          <p className="text-sm text-muted">
            {pins.length} {pins.length === 1 ? "pin" : "pins"}
            {busy > 0 && <span className="ml-2 text-indigo">· adding {busy}…</span>}
          </p>
        </div>
      </header>

      <section className="card space-y-2 p-3 sm:p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            addUrl(text);
            setText("");
          }}
        >
          <input
            className="input flex-1"
            inputMode="url"
            placeholder="Paste a YouTube or web link…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0 px-4 text-sm" disabled={!text.trim()}>
            Add
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-ghost shrink-0 px-3 text-sm"
            aria-label="Add photos"
          >
            📷 <span className="hidden sm:inline">Photos</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </form>
        <p className="text-xs text-muted">
          Or paste (⌘V) or drag a photo or link anywhere on this page. On iPhone, use the
          &ldquo;Save to Inspiration&rdquo; Shortcut from the share sheet.
          {room && (
            <>
              {" "}
              New pins go in <span className="font-semibold text-ink">{room}</span>.
            </>
          )}
        </p>
        {error && <p className="text-xs text-coral">{error}</p>}
      </section>

      {usedRooms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {["", ...usedRooms].map((r) => (
            <button
              key={r || "all"}
              onClick={() => setFilter(r)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                filter === r ? "border-indigo bg-indigo text-white" : "border-line bg-card text-muted hover:text-ink"
              }`}
            >
              {r || "All"}
            </button>
          ))}
        </div>
      )}

      {!loading && visible.length === 0 ? (
        <div className="card grid place-items-center gap-1 p-10 text-center text-sm text-muted">
          <div className="text-3xl">🏡</div>
          <div>Nothing here yet. Paste a link or drop in a photo you love.</div>
        </div>
      ) : (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
          {visible.map((p) => (
            <PinCard key={p.id} pin={p} onOpen={() => setViewing(viewable.indexOf(p))} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-indigo/15 backdrop-blur-[2px]">
          <div className="rounded-2xl border-2 border-dashed border-indigo bg-card px-8 py-6 text-sm font-semibold text-indigo shadow-card-hover">
            Drop to add to Home Inspiration
          </div>
        </div>
      )}

      {viewing !== null && (
        <Lightbox pins={viewable} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      )}
      {editing && (
        <EditPin
          pin={editing}
          rooms={allRooms}
          onClose={() => setEditing(null)}
          onDelete={() => remove(editing)}
          onSave={async (patch) => {
            if (uid) await updateItem(uid, INSPIRATION, editing.id, patch);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
