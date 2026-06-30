"use client";

import { useMemo, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem } from "@/lib/data";
import type { DesignClient, DesignHoursEntry, DesignFile } from "@/lib/types";
import {
  hoursByClient,
  clientEarnings,
  formatHours,
  formatMoney,
  todayISO,
  type HourTotals,
} from "@/lib/interiors";
import { uploadDesignFile, deleteDesignFile } from "@/lib/storage";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  if (n >= 1024) return Math.round(n / 1024) + " KB";
  return n + " B";
}

const EMPTY: HourTotals = { design: 0, billable: 0 };

// ── Add / edit client form ──────────────────────────────────────────────────
function ClientForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: DesignClient;
  onSave: (data: Omit<DesignClient, "id" | "createdAt" | "sortOrder">) => void;
  onCancel: () => void;
}) {
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [rooms, setRooms] = useState(initial?.rooms.join(", ") ?? "");
  const [designFee, setDesignFee] = useState(initial ? String(initial.designFee) : "");
  const [hourlyRate, setHourlyRate] = useState(
    initial?.hourlyRate != null ? String(initial.hourlyRate) : ""
  );
  const [status, setStatus] = useState<DesignClient["status"]>(initial?.status ?? "active");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayISO());
  const [completedDate, setCompletedDate] = useState(initial?.completedDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = clientName.trim();
    if (!name) return;
    const roomList = rooms
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const rate = hourlyRate.trim() ? Number(hourlyRate) : undefined;
    // Stamp a completed date when finishing without one entered.
    const finishedOn =
      status === "completed" ? completedDate || initial?.completedDate || todayISO() : undefined;
    onSave({
      clientName: name,
      address: address.trim() || undefined,
      rooms: roomList,
      designFee: Number(designFee) || 0,
      hourlyRate: rate != null && !Number.isNaN(rate) ? rate : undefined,
      status,
      startDate: startDate || undefined,
      completedDate: finishedOn,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4 sm:p-5">
      <h2 className="section-title">{initial ? "Edit client" : "New client"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Client name</span>
          <input
            className="input"
            placeholder="Julie Griswold"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Address</span>
          <input
            className="input"
            placeholder="1 Albert Place"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted">
          Rooms / spaces (comma-separated)
        </span>
        <input
          className="input"
          placeholder="Living room, Master bedroom, Guest bedroom"
          value={rooms}
          onChange={(e) => setRooms(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Design fee ($)</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder="2700"
            value={designFee}
            onChange={(e) => setDesignFee(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">
            Hourly rate ($/hr, optional)
          </span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder="125"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Status</span>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as DesignClient["status"])}
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Start date</span>
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Completed date</span>
          <input
            className="input"
            type="date"
            value={completedDate}
            onChange={(e) => setCompletedDate(e.target.value)}
            disabled={status !== "completed"}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted">Notes (optional)</span>
        <textarea
          className="input min-h-[60px] resize-y"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary">
          {initial ? "Save changes" : "Add client"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Inline "log hours" form ─────────────────────────────────────────────────
function LogHoursForm({ onLog }: { onLog: (e: Omit<DesignHoursEntry, "id" | "clientId" | "createdAt" | "source">) => void }) {
  const [date, setDate] = useState(todayISO());
  const [hours, setHours] = useState("");
  const [kind, setKind] = useState<DesignHoursEntry["kind"]>("design");
  const [description, setDescription] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = Number(hours);
    if (!h || h <= 0) return;
    onLog({ date, hours: h, kind, description: description.trim() });
    setHours("");
    setDescription("");
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-lg border border-line bg-bg p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-muted">Date</span>
          <input
            className="input w-auto"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-muted">Hours</span>
          <input
            className="input w-24"
            type="number"
            inputMode="decimal"
            step="0.25"
            placeholder="3.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </label>
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {(["design", "billable"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-3 py-2 text-xs font-semibold capitalize ${
                kind === k ? "bg-indigo text-white" : "bg-card text-muted hover:text-ink"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <input
        className="input"
        placeholder="What did you work on? (e.g. sourced sofa options for the living room)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button type="submit" className="btn-primary">
        Log hours
      </button>
    </form>
  );
}

// ── One client card ─────────────────────────────────────────────────────────
function ClientCard({
  client,
  totals,
  entries,
  files,
  uid,
  onEdit,
}: {
  client: DesignClient;
  totals: HourTotals;
  entries: DesignHoursEntry[];
  files: DesignFile[];
  uid: string;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileErr, setFileErr] = useState("");
  const earnings = clientEarnings(client, totals.billable);
  const billablePay = totals.billable * (client.hourlyRate ?? 0);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after an error
    if (!file) return;
    setFileErr("");
    setUploading(true);
    try {
      const meta = await uploadDesignFile(uid, client.id, file);
      await addItem(uid, "designFiles", { clientId: client.id, ...meta });
    } catch (err) {
      setFileErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold">{client.clientName}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                client.status === "active" ? "bg-teal/15 text-teal" : "bg-line text-muted"
              }`}
            >
              {client.status}
            </span>
          </div>
          {client.address && <p className="text-sm text-muted">{client.address}</p>}
          <p className="mt-1 text-xs text-muted">
            {client.startDate && `Started ${fmtDate(client.startDate)}`}
            {client.status === "completed" && client.completedDate && (
              <> · Completed {fmtDate(client.completedDate)}</>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-extrabold tracking-tight">{formatMoney(earnings)}</div>
          <div className="text-[11px] text-muted">earned</div>
        </div>
      </div>

      {client.rooms.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {client.rooms.map((r) => (
            <span key={r} className="rounded-full bg-bg px-2.5 py-1 text-xs text-ink">
              {r}
            </span>
          ))}
          <span className="rounded-full px-2 py-1 text-xs text-muted">
            {client.rooms.length} {client.rooms.length === 1 ? "space" : "spaces"}
          </span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg bg-bg p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted">Design fee</div>
          <div className="font-bold">{formatMoney(client.designFee)}</div>
        </div>
        <div className="rounded-lg bg-bg p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted">Design hrs</div>
          <div className="font-bold">{formatHours(totals.design)}</div>
        </div>
        <div className="rounded-lg bg-bg p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted">Billable hrs</div>
          <div className="font-bold">
            {formatHours(totals.billable)}
            {client.hourlyRate ? (
              <span className="ml-1 text-xs font-medium text-muted">
                · {formatMoney(billablePay)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {client.notes && <p className="mt-3 text-sm text-muted">{client.notes}</p>}

      <div className="mt-3 flex gap-3 text-xs font-semibold">
        <button className="text-indigo" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Hours · designs"}
        </button>
        <button className="text-muted hover:text-ink" onClick={onEdit}>
          Edit
        </button>
      </div>

      {open && (
        <>
          <LogHoursForm
            onLog={(e) =>
              addItem(uid, "designHours", { ...e, clientId: client.id, source: "manual" })
            }
          />
          <div className="mt-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Work log
            </div>
            <ul className="space-y-1">
              {entries.length === 0 && (
                <li className="text-sm text-muted">No hours logged yet.</li>
              )}
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="group flex items-start gap-2 rounded-lg px-1 py-1.5 hover:bg-bg"
                >
                  <span className="w-16 shrink-0 text-xs text-muted">{fmtDate(e.date)}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      e.kind === "billable" ? "bg-coral/15 text-coral" : "bg-indigo/15 text-indigo"
                    }`}
                  >
                    {e.kind}
                  </span>
                  <span className="w-12 shrink-0 text-xs font-semibold">{formatHours(e.hours)}h</span>
                  <span className="flex-1 text-sm">
                    {e.description || <span className="text-muted">—</span>}
                    {e.source === "email" && <span className="ml-1 text-[10px] text-muted">✉</span>}
                  </span>
                  <button
                    onClick={() => deleteItem(uid, "designHours", e.id)}
                    className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100 hover:text-coral"
                    aria-label="Delete entry"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Designs &amp; proposals
              </span>
              <label
                className={`cursor-pointer text-xs font-semibold ${
                  uploading ? "text-muted" : "text-indigo"
                }`}
              >
                {uploading ? "Uploading…" : "+ Upload"}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={onPickFile}
                  disabled={uploading}
                />
              </label>
            </div>
            {fileErr && <p className="mb-1 text-xs text-coral">{fileErr}</p>}
            <ul className="space-y-1">
              {files.length === 0 && (
                <li className="text-sm text-muted">No designs or proposals uploaded yet.</li>
              )}
              {files.map((f) => (
                <li
                  key={f.id}
                  className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-bg"
                >
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 truncate text-sm text-indigo hover:underline"
                  >
                    {f.name}
                  </a>
                  <span className="shrink-0 text-xs text-muted">{fmtBytes(f.size)}</span>
                  <button
                    onClick={async () => {
                      await deleteDesignFile(f.path);
                      await deleteItem(uid, "designFiles", f.id);
                    }}
                    className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100 hover:text-coral"
                    aria-label="Delete file"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function InteriorsPage() {
  const { data: clients, uid } = useCollection<DesignClient>("designClients");
  const { data: hours } = useCollection<DesignHoursEntry>("designHours");
  const { data: filesData } = useCollection<DesignFile>("designFiles");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const totalsByClient = useMemo(() => hoursByClient(hours), [hours]);
  const entriesByClient = useMemo(() => {
    const map: Record<string, DesignHoursEntry[]> = {};
    for (const e of hours) (map[e.clientId] ??= []).push(e);
    for (const list of Object.values(map)) list.sort((a, b) => b.date.localeCompare(a.date));
    return map;
  }, [hours]);
  const filesByClient = useMemo(() => {
    const map: Record<string, DesignFile[]> = {};
    for (const f of filesData) (map[f.clientId] ??= []).push(f);
    for (const list of Object.values(map)) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return map;
  }, [filesData]);

  const sorted = useMemo(
    () =>
      [...clients].sort((a, b) => {
        // Active first, then by start date (newest first), then sortOrder.
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        const ad = a.startDate ?? "";
        const bd = b.startDate ?? "";
        if (ad !== bd) return bd.localeCompare(ad);
        return a.sortOrder - b.sortOrder;
      }),
    [clients]
  );

  const summary = useMemo(() => {
    let earned = 0;
    let design = 0;
    let billable = 0;
    for (const c of clients) {
      const t = totalsByClient[c.id] ?? EMPTY;
      earned += clientEarnings(c, t.billable);
      design += t.design;
      billable += t.billable;
    }
    const active = clients.filter((c) => c.status === "active").length;
    return { earned, design, billable, active };
  }, [clients, totalsByClient]);

  async function saveNew(data: Omit<DesignClient, "id" | "createdAt" | "sortOrder">) {
    if (!uid) return;
    await addItem(uid, "designClients", { ...data, sortOrder: clients.length });
    setAdding(false);
  }

  async function saveEdit(id: string, data: Omit<DesignClient, "id" | "createdAt" | "sortOrder">) {
    if (!uid) return;
    await updateItem(uid, "designClients", id, { ...data });
    setEditingId(null);
  }

  const editing = editingId ? clients.find((c) => c.id === editingId) : undefined;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Sarah Beach Interiors</h1>
          <p className="text-sm text-muted">Clients, projects, and logged hours.</p>
        </div>
        {!adding && !editing && (
          <button className="btn-primary shrink-0" onClick={() => setAdding(true)}>
            + Client
          </button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total earned" value={formatMoney(summary.earned)} />
        <Stat label="Active" value={String(summary.active)} />
        <Stat label="Design hrs" value={formatHours(summary.design)} />
        <Stat label="Billable hrs" value={formatHours(summary.billable)} />
      </div>

      {adding && <ClientForm onSave={saveNew} onCancel={() => setAdding(false)} />}
      {editing && (
        <ClientForm
          initial={editing}
          onSave={(data) => saveEdit(editing.id, data)}
          onCancel={() => setEditingId(null)}
        />
      )}

      <div className="space-y-4">
        {sorted.length === 0 && !adding && (
          <p className="text-sm text-muted">No clients yet. Add Sarah&apos;s first project above.</p>
        )}
        {uid &&
          sorted.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              totals={totalsByClient[c.id] ?? EMPTY}
              entries={entriesByClient[c.id] ?? []}
              files={filesByClient[c.id] ?? []}
              uid={uid}
              onEdit={() => {
                setAdding(false);
                setEditingId(c.id);
              }}
            />
          ))}
      </div>
    </div>
  );
}
