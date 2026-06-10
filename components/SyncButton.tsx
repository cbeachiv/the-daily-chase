"use client";

import { useState } from "react";
import { useCollection } from "@/lib/data";
import { auth } from "@/lib/firebase/client";
import type { CodeSyncMeta } from "@/lib/types";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const mins = Math.floor(s / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SyncButton() {
  const { data: meta } = useCollection<CodeSyncMeta>("codeMeta");
  const status = meta[0];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sync() {
    setLoading(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/code/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={sync} className="btn-primary" disabled={loading}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={loading ? "animate-spin" : ""}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
        </svg>
        {loading ? "Syncing…" : "Sync"}
      </button>
      {error ? (
        <span className="text-xs text-coral">{error}</span>
      ) : status ? (
        <span className="text-xs text-muted">
          Synced {timeAgo(status.syncedAt)} · {status.repoCount} repos
        </span>
      ) : null}
    </div>
  );
}
