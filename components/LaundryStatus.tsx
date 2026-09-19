"use client";

import { useCallback, useEffect, useState } from "react";
import { MACHINES, machineLabel, type LaundryStatus as Status, type MachineStatus } from "@/lib/laundry";

const POLL_MS = 20_000;
const TICK_MS = 10_000;

function plural(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** "just now", "3 min ago", "2 h ago", "yesterday" */
function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${plural(d, "day")} ago`;
}

/** "4 min", "1 h 05 min" */
function duration(fromTs: number, now: number): string {
  const m = Math.max(0, Math.floor((now - fromTs) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")} min`;
}

function secondsAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return ago(ts, now);
}

function MachineCard({ id, m, now }: { id: "washer" | "dryer"; m: MachineStatus; now: number }) {
  const label = machineLabel(id);
  const icon = id === "washer" ? "🫧" : "🔥";
  const tone = m.inUse ? "text-coral" : "text-teal";
  const accent = m.inUse ? "border-l-coral" : "border-l-teal";
  const badge = m.inUse ? "bg-coral/10 text-coral" : "bg-teal/10 text-teal";

  let detail: string;
  if (m.inUse) {
    detail = m.since ? `Running for ${duration(m.since, now)}` : "Running";
  } else if (m.finishedAt) {
    detail = `Finished ${ago(m.finishedAt, now)}`;
  } else {
    detail = "No recent cycles";
  }

  return (
    <section
      aria-label={`${label}: ${m.inUse ? "in use" : "free"}`}
      className={`card border-l-4 ${accent} p-5`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">
            <span aria-hidden="true" className="mr-1.5">
              {icon}
            </span>
            {label}
          </p>
          <p className={`mt-1 text-3xl font-extrabold tracking-tight ${tone}`}>
            {m.inUse ? "In use" : "Free"}
          </p>
          <p className="mt-1 text-sm text-muted">{detail}</p>
        </div>
        <span className={`mt-1 shrink-0 rounded-full px-3 py-1 text-xs font-bold ${badge}`}>
          {m.watts !== null ? `${Math.round(m.watts)} W` : "—"}
        </span>
      </div>
      {!m.online && (
        <p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-xs font-medium text-amber">
          Plug offline{m.lastActivityAt ? ` · last seen ${ago(m.lastActivityAt, now)}` : ""}. Status may be
          stale.
        </p>
      )}
    </section>
  );
}

export default function LaundryStatus({ initial }: { initial: Status }) {
  const [status, setStatus] = useState<Status>(initial);
  const [fetchedAt, setFetchedAt] = useState<number>(initial.updatedAt);
  const [now, setNow] = useState<number>(initial.updatedAt);
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/laundry/status", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Status;
      setStatus(data);
      setFetchedAt(Date.now());
      setNow(Date.now());
      setStale(false);
    } catch {
      setStale(true);
    }
  }, []);

  useEffect(() => {
    setNow(Date.now());
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [refresh]);

  const anyOffline = MACHINES.some((id) => !status[id].online);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-10 pb-safe">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">3720 Center St</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Laundry</h1>
      </header>

      <div className="mt-6 space-y-4">
        {MACHINES.map((id) => (
          <MachineCard key={id} id={id} m={status[id]} now={now} />
        ))}
      </div>

      <footer className="mt-auto pt-10 text-center text-xs text-muted">
        <p>
          Updated {secondsAgo(fetchedAt, now)}
          {stale && " · couldn't refresh"}
        </p>
        {anyOffline && (
          <p className="mt-1">A plug hasn't reported in a while — someone may need to check the basement.</p>
        )}
      </footer>
    </main>
  );
}
