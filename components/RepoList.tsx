"use client";

import { useMemo } from "react";
import { useCollection } from "@/lib/data";
import type { Repo } from "@/lib/types";

function timeAgo(iso: string): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function RepoList() {
  const { data: repos } = useCollection<Repo>("repos");
  const sorted = useMemo(
    () => [...repos].sort((a, b) => b.totalLines - a.totalLines),
    [repos]
  );

  if (sorted.length === 0) return null;

  return (
    <section>
      <h2 className="section-title mb-3">
        Repositories <span className="text-sm font-normal text-muted">({sorted.length})</span>
      </h2>
      <div className="card divide-y divide-line">
        {sorted.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener"
                  className="truncate text-sm font-semibold hover:text-indigo"
                >
                  {r.displayName}
                </a>
                {r.isPrivate && (
                  <span className="shrink-0 rounded-full bg-bg px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted">
                    Private
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                {r.language ? `${r.language} · ` : ""}updated {timeAgo(r.pushedAt)}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">
              {r.totalLines >= 1000
                ? `${(r.totalLines / 1000).toFixed(1)}k`
                : r.totalLines.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-muted">
        Lines added in the last {20} weeks. Tap a name to open it on GitHub.
      </p>
    </section>
  );
}
