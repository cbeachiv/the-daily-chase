"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, deleteItem } from "@/lib/data";
import type { Quote } from "@/lib/types";
import { shortDate, todayStr } from "@/lib/dates";

export default function QuotesPage() {
  const { data: quotes, uid } = useCollection<Quote>("quotes");
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [open, setOpen] = useState(false);

  // Newest first, grouped by datestamp.
  const groups = useMemo(() => {
    const sorted = [...quotes].sort(
      (a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || "")
    );
    const out: { date: string; items: Quote[] }[] = [];
    for (const q of sorted) {
      const last = out[out.length - 1];
      if (last && last.date === q.date) last.items.push(q);
      else out.push({ date: q.date, items: [q] });
    }
    return out;
  }, [quotes]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !uid) return;
    await addItem(uid, "quotes", {
      text: text.trim(),
      author: author.trim(),
      date: todayStr(),
    });
    setText("");
    setAuthor("");
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Quotes</h1>
          <p className="text-sm text-muted">{quotes.length} collected</p>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="btn-primary">
          {open ? "Close" : "+ Quote"}
        </button>
      </header>

      {open && (
        <form onSubmit={add} className="card space-y-3 p-4">
          <textarea
            autoFocus
            className="input min-h-[90px] resize-y"
            placeholder="The quote…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <input
            className="input"
            placeholder="Author (optional)"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Datestamped {shortDate(todayStr())}</span>
            <button type="submit" className="btn-primary">
              Add quote
            </button>
          </div>
        </form>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.date}>
            <h2 className="mb-2 text-sm font-bold text-muted">{shortDate(g.date)}</h2>
            <div className="space-y-3">
              {g.items.map((q) => (
                <article key={q.id} className="card group p-4">
                  <p className="whitespace-pre-line text-[15px] italic leading-snug">
                    &ldquo;{q.text}&rdquo;
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    {q.author ? (
                      <span className="text-sm text-muted">&mdash; {q.author}</span>
                    ) : (
                      <span />
                    )}
                    <button
                      onClick={() => uid && deleteItem(uid, "quotes", q.id)}
                      className="text-xs text-muted opacity-0 transition group-hover:opacity-100 hover:text-coral"
                      aria-label="Delete quote"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
        {quotes.length === 0 && (
          <p className="card p-6 text-center text-sm text-muted">
            No quotes yet. Tap “+ Quote” to add your first.
          </p>
        )}
      </div>
    </div>
  );
}
