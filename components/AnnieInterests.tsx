"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type { AnnieInterest } from "@/lib/types";
import { prettyDate, todayStr } from "@/lib/dates";

// One active interest, with its observations and "ways I'm feeding it" checklist.
function InterestCard({ interest, uid }: { interest: AnnieInterest; uid: string }) {
  const [obs, setObs] = useState("");
  const [idea, setIdea] = useState("");

  function addObservation() {
    const text = obs.trim();
    if (!text) return;
    const next = [...(interest.observations ?? []), { at: todayStr(), text }];
    updateItem(uid, "annieInterests", interest.id, { observations: next });
    setObs("");
  }

  function addIdea() {
    const text = idea.trim();
    if (!text) return;
    const next = [...(interest.facilitation ?? []), { at: todayStr(), text, done: false }];
    updateItem(uid, "annieInterests", interest.id, { facilitation: next });
    setIdea("");
  }

  function toggleIdea(i: number) {
    const next = (interest.facilitation ?? []).map((f, idx) =>
      idx === i ? { ...f, done: !f.done } : f,
    );
    updateItem(uid, "annieInterests", interest.id, { facilitation: next });
  }

  function removeIdea(i: number) {
    const next = (interest.facilitation ?? []).filter((_, idx) => idx !== i);
    updateItem(uid, "annieInterests", interest.id, { facilitation: next });
  }

  function removeObservation(i: number) {
    const next = (interest.observations ?? []).filter((_, idx) => idx !== i);
    updateItem(uid, "annieInterests", interest.id, { observations: next });
  }

  function archive() {
    updateItem(uid, "annieInterests", interest.id, {
      status: "archived",
      endedAt: todayStr(),
    });
  }

  const observations = interest.observations ?? [];
  const facilitation = interest.facilitation ?? [];

  return (
    <article className="rounded-xl border border-pink/30 bg-pink/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">{interest.title}</h3>
          <p className="text-xs text-muted">Since {prettyDate(interest.startedAt)}</p>
        </div>
        <button
          onClick={archive}
          className="shrink-0 rounded-md border border-line bg-card px-2 py-1 text-xs font-semibold text-muted hover:text-ink"
          title="She's moved on — archive this into her history"
        >
          Archive
        </button>
      </div>

      {/* Observations — what I noticed */}
      <div className="mt-3">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          What I&apos;ve noticed
        </h4>
        {observations.length > 0 && (
          <ul className="mb-2 space-y-1">
            {observations.map((o, i) => (
              <li key={i} className="group flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-pink">•</span>
                <span className="flex-1">{o.text}</span>
                <span className="shrink-0 text-[10px] text-muted">{prettyDate(o.at)}</span>
                <button
                  onClick={() => removeObservation(i)}
                  className="shrink-0 text-xs text-muted opacity-0 transition hover:text-coral group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Noticed something…"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addObservation()}
          />
          <button onClick={addObservation} className="btn-ghost px-3 py-2 text-xs">
            Add
          </button>
        </div>
      </div>

      {/* Facilitation — ways I'm feeding it */}
      <div className="mt-4">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          Ways I&apos;m feeding it
        </h4>
        {facilitation.length > 0 && (
          <ul className="mb-2 space-y-1">
            {facilitation.map((f, i) => (
              <li key={i} className="group flex items-center gap-2 text-sm">
                <button
                  onClick={() => toggleIdea(i)}
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${
                    f.done ? "border-teal bg-teal text-white" : "border-line bg-card text-transparent"
                  }`}
                >
                  ✓
                </button>
                <span className={`flex-1 ${f.done ? "text-muted line-through" : ""}`}>{f.text}</span>
                <button
                  onClick={() => removeIdea(i)}
                  className="shrink-0 text-xs text-muted opacity-0 transition hover:text-coral group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Something to try…"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addIdea()}
          />
          <button onClick={addIdea} className="btn-ghost px-3 py-2 text-xs">
            Add
          </button>
        </div>
      </div>
    </article>
  );
}

export default function AnnieInterests() {
  const { data: interests, uid } = useCollection<AnnieInterest>("annieInterests");

  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAllArchived, setShowAllArchived] = useState(false);

  const active = useMemo(
    () =>
      interests
        .filter((i) => i.status === "active")
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [interests],
  );
  const archived = useMemo(
    () =>
      interests
        .filter((i) => i.status === "archived")
        .sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? "")),
    [interests],
  );
  const visibleArchived = showAllArchived ? archived : archived.slice(0, 4);

  async function addInterest() {
    const t = title.trim();
    if (!t || !uid) return;
    const maxOrder = active.reduce((m, i) => Math.max(m, i.sortOrder ?? 0), 0);
    await addItem(uid, "annieInterests", {
      title: t,
      status: "active",
      startedAt: todayStr(),
      endedAt: null,
      observations: [],
      facilitation: [],
      sortOrder: maxOrder + 1,
    });
    setTitle("");
    setAdding(false);
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="section-title">What she&apos;s into right now</h2>
          <p className="text-xs text-muted">Know it deeply, then feed it.</p>
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="btn-primary shrink-0 px-3 py-1.5 text-xs"
        >
          {adding ? "Close" : "+ Interest"}
        </button>
      </div>

      {adding && (
        <div className="mb-4 flex gap-2 rounded-lg border border-line bg-bg/50 p-3">
          <input
            className="input"
            placeholder="What's she fixated on? e.g. opening cabinet doors"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addInterest()}
            autoFocus
          />
          <button onClick={addInterest} className="btn-primary px-4 py-2 text-sm">
            Add
          </button>
        </div>
      )}

      {active.length > 0 ? (
        <div className="space-y-3">
          {active.map((i) => (
            <InterestCard key={i.id} interest={i} uid={uid!} />
          ))}
        </div>
      ) : (
        !adding && (
          <p className="py-2 text-sm text-muted">
            Nothing tracked yet — tap &ldquo;+ Interest&rdquo; to capture what she&apos;s drawn to.
          </p>
        )
      )}

      {archived.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            How her curiosity has grown
          </h3>
          <ul className="space-y-1.5">
            {visibleArchived.map((i) => (
              <li key={i.id} className="group flex items-baseline gap-2 text-sm">
                <span className="font-medium text-ink">{i.title}</span>
                <span className="text-xs text-muted">
                  {prettyDate(i.startedAt)}
                  {i.endedAt ? ` – ${prettyDate(i.endedAt)}` : ""}
                </span>
                <button
                  onClick={() => uid && deleteItem(uid, "annieInterests", i.id)}
                  className="ml-auto text-xs text-muted opacity-0 transition hover:text-coral group-hover:opacity-100"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          {archived.length > 4 && (
            <button
              onClick={() => setShowAllArchived((s) => !s)}
              className="mt-2 w-full text-center text-xs font-semibold text-indigo"
            >
              {showAllArchived ? "Show less" : `Show all ${archived.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
