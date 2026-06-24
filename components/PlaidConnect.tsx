"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { auth } from "@/lib/firebase/client";
import type { PlaidItemView } from "@/lib/types";

async function authedFetch(url: string, init: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

// "Connected accounts" card: link a bank via Plaid Link, list connected items,
// sync on demand, re-authenticate when a connection drops, and remove items.
// `onItemsLoaded` lets the page know the connected-account count (to soften the
// manual CSV importer once a bank is linked).
export default function PlaidConnect({
  onItemsLoaded,
}: {
  onItemsLoaded?: (items: PlaidItemView[]) => void;
}) {
  const [items, setItems] = useState<PlaidItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string>(""); // status line
  const [updateItemId, setUpdateItemId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const res = await authedFetch("/api/plaid/items");
      if (res.ok) {
        const list: PlaidItemView[] = (await res.json()).items ?? [];
        setItems(list);
        onItemsLoaded?.(list);
      }
    } finally {
      setLoading(false);
    }
  }, [onItemsLoaded]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Fetch a Link token (new connection, or update-mode for re-auth).
  const openLink = useCallback(async (itemId?: string) => {
    setBusy(itemId ? "Preparing reconnect…" : "Preparing…");
    const res = await authedFetch("/api/plaid/link-token", {
      method: "POST",
      body: JSON.stringify(itemId ? { itemId } : {}),
    });
    setBusy("");
    if (!res.ok) {
      setBusy("Could not start Plaid. Check PLAID_CLIENT_ID / PLAID_SECRET.");
      return;
    }
    setUpdateItemId(itemId ?? null);
    setLinkToken((await res.json()).link_token);
  }, []);

  const onSuccess = useCallback(
    async (public_token: string) => {
      setLinkToken(null);
      // Update mode returns no new token to exchange — just re-sync.
      if (updateItemId) {
        setBusy("Reconnected. Syncing…");
        await authedFetch("/api/plaid/sync", { method: "POST" });
      } else {
        setBusy("Linking & importing…");
        await authedFetch("/api/plaid/exchange", { method: "POST", body: JSON.stringify({ public_token }) });
      }
      setBusy("");
      setUpdateItemId(null);
      await loadItems();
    },
    [updateItemId, loadItems]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token) => onSuccess(public_token),
    onExit: () => {
      setLinkToken(null);
      setUpdateItemId(null);
      setBusy("");
    },
  });

  // Auto-open Link once the token is ready.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function syncNow() {
    setBusy("Syncing…");
    const res = await authedFetch("/api/plaid/sync", { method: "POST" });
    const r = res.ok ? await res.json() : null;
    setBusy(r ? `Synced: +${r.added} new, ${r.modified} updated` : "Sync failed");
    await loadItems();
    setTimeout(() => setBusy(""), 4000);
  }

  async function removeItem(itemId: string, name: string) {
    if (!confirm(`Disconnect ${name}? Imported transactions are kept.`)) return;
    setBusy("Removing…");
    await authedFetch(`/api/plaid/items?itemId=${encodeURIComponent(itemId)}`, { method: "DELETE" });
    setBusy("");
    await loadItems();
  }

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Connected accounts</h2>
        <div className="flex gap-2">
          {items.length > 0 && (
            <button className="btn-ghost" onClick={syncNow}>
              Sync now
            </button>
          )}
          <button className="btn-primary" onClick={() => openLink()}>
            + Connect bank
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">
        Link Capital One &amp; Chase to import transactions automatically — no monthly CSV upload needed for connected
        accounts.
      </p>

      {busy && <p className="text-sm font-medium text-indigo">{busy}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-bg px-4 py-6 text-center text-sm text-muted">
          No banks connected yet. Click <strong>Connect bank</strong> to link one.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.itemId} className="rounded-lg border border-line bg-bg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{it.institutionName}</span>
                  {it.status === "login_required" && (
                    <span className="ml-2 rounded-full bg-coral/15 px-2 py-0.5 text-[10px] font-semibold text-coral">
                      Reconnect needed
                    </span>
                  )}
                  {it.status === "error" && (
                    <span className="ml-2 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-amber">
                      Error
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {it.status === "login_required" && (
                    <button className="font-semibold text-indigo hover:underline" onClick={() => openLink(it.itemId)}>
                      Reconnect
                    </button>
                  )}
                  <button className="text-muted hover:text-coral" onClick={() => removeItem(it.itemId, it.institutionName)}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-1 text-xs text-muted">
                {it.accounts.map((a) => `${a.name}${a.mask ? ` ••${a.mask}` : ""}`).join(" · ")}
                {it.lastSyncedAt && ` · synced ${new Date(it.lastSyncedAt).toLocaleDateString()}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
