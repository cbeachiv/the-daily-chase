"use client";

import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { useCollection } from "@/lib/data";
import type { HouseOutreach as Row } from "@/lib/types";

// Status pill colors, matching the report's g/o/b/n/r codes.
const PILL: Record<Row["color"], string> = {
  g: "bg-teal/15 text-teal",
  o: "bg-amber/15 text-amber",
  b: "bg-sky/15 text-sky",
  n: "bg-line text-muted",
  r: "bg-coral/15 text-coral",
};

// Houses we've reached out to, plus the full Mariemont Land Survey PDF.
// Data comes from `npm run sync:mariemont` (the report lives outside the repo).
export default function HouseOutreach() {
  const { data, uid, loading } = useCollection<Row>("houseOutreach");
  const rows = [...data].sort((a, b) => a.sortOrder - b.sortOrder);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    getDownloadURL(ref(storage, `users/${uid}/mariemont/Mariemont-Land-Survey.pdf`))
      .then(setPdfUrl)
      .catch(() => setPdfUrl(null));
  }, [uid]);

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Houses we&apos;ve contacted</h2>
          <p className="text-sm text-muted">
            {rows.length} {rows.length === 1 ? "house" : "houses"}
          </p>
        </div>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost shrink-0">
            Full report (PDF)
          </a>
        )}
      </header>

      {!loading && rows.length === 0 && (
        <p className="card p-4 text-sm text-muted">
          Nothing synced yet. Run <code>npm run sync:mariemont</code>.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <article key={r.id} className="card space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold leading-tight">{r.property}</h3>
                <p className="text-sm text-muted">{r.owner}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[r.color] ?? PILL.n}`}
              >
                {r.status}
              </span>
            </div>
            <p className="text-xs text-muted">
              {r.contacted} · {r.method}
            </p>
            <p className="text-sm leading-relaxed">{r.notes}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
