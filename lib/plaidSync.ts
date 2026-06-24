// Server-only: pull transactions for connected Plaid items via the cursor-based
// /transactions/sync endpoint and write them into users/{uid}/financeTransactions.
// Shared by the manual sync route, the webhook, and the daily cron backstop.
import { adminDb } from "@/lib/firebase/admin";
import { plaidClient, plaidTxnToDoc } from "@/lib/plaid";
import { detectTransfers, parseSelfNames, type TxnLike } from "@/lib/transfers";

// One stored item in the top-level, client-denied `plaidItems` collection.
interface ItemDoc {
  id: string; // = plaid item_id
  uid: string;
  accessToken: string;
  cursor?: string;
}

function errorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
}

// Sync a single item. Returns counts, or marks the item login_required on auth errors.
export async function syncItem(item: ItemDoc): Promise<{ added: number; modified: number; removed: number }> {
  const client = plaidClient();
  const db = adminDb();
  const itemRef = db.doc(`plaidItems/${item.id}`);
  const txnCol = db.collection(`users/${item.uid}/financeTransactions`);
  const now = new Date().toISOString();

  let cursor = item.cursor;
  let added = 0;
  let modified = 0;
  let removed = 0;

  try {
    let hasMore = true;
    while (hasMore) {
      const resp = await client.transactionsSync({
        access_token: item.accessToken,
        ...(cursor ? { cursor } : {}),
      });
      const data = resp.data;

      let batch = db.batch();
      let ops = 0;
      const flush = async () => {
        if (ops) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      };

      // Added: write the full doc (id = plaid_<transaction_id>).
      for (const t of data.added) {
        const { id, data: d } = plaidTxnToDoc(t, item.id, now);
        batch.set(txnCol.doc(id), d);
        added++;
        if (++ops >= 400) await flush();
      }
      // Modified: update Plaid-derived fields but PRESERVE the stored `category`
      // and `excluded` so a user's recategorization and our transfer reconciliation
      // survive a re-sync (pending→posted, etc.).
      for (const t of data.modified) {
        const { id, data: d } = plaidTxnToDoc(t, item.id, now);
        const { category: _omitCategory, excluded: _omitExcluded, ...rest } = d;
        batch.set(txnCol.doc(id), rest, { merge: true });
        modified++;
        if (++ops >= 400) await flush();
      }
      // Removed: delete (pending rows that got replaced, or reversed txns).
      for (const r of data.removed) {
        if (r.transaction_id) {
          batch.delete(txnCol.doc(`plaid_${r.transaction_id}`));
          removed++;
          if (++ops >= 400) await flush();
        }
      }
      await flush();

      cursor = data.next_cursor;
      hasMore = data.has_more;
    }

    await itemRef.set(
      { cursor, status: "active", lastSyncedAt: now, error: null },
      { merge: true }
    );
    return { added, modified, removed };
  } catch (err) {
    const code = errorCode(err);
    if (code === "ITEM_LOGIN_REQUIRED") {
      await itemRef.set({ status: "login_required", error: code }, { merge: true });
    } else if (code === "PRODUCT_NOT_READY" || code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
      // Transient: transactions not prepared yet (fresh item) — webhook will retry.
      await itemRef.set({ status: "active", error: code }, { merge: true });
    } else {
      console.error(`Plaid sync failed for item ${item.id}:`, code || err);
      await itemRef.set({ status: "error", error: code || "sync_failed" }, { merge: true });
    }
    return { added, modified, removed };
  }
}

// Re-scan a user's recent transactions and mark internal transfers excluded
// (pairing + self-name). Runs after every sync so new transfers are caught.
// `sinceDays` bounds the work to a recent window (transfers older than that were
// reconciled on the sync that first imported them).
export async function reconcileTransfers(uid: string, sinceDays = 75): Promise<number> {
  const db = adminDb();
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const snap = await db.collection(`users/${uid}/financeTransactions`).where("date", ">=", since).get();
  const txns: (TxnLike & { excluded?: boolean })[] = snap.docs.map((d) => {
    const v = d.data();
    return { id: d.id, date: v.date, amount: v.amount, description: v.description || "", excluded: v.excluded };
  });
  const selfNames = parseSelfNames(process.env.FINANCE_SELF_NAMES);
  const hits = detectTransfers(txns, { selfNames }).filter((h) => {
    const t = txns.find((x) => x.id === h.id);
    return t && !t.excluded; // only newly-detected ones need a write
  });
  if (hits.length === 0) return 0;
  let batch = db.batch();
  let ops = 0;
  for (const h of hits) {
    batch.update(db.doc(`users/${uid}/financeTransactions/${h.id}`), { excluded: true, category: "Transfer" });
    if (++ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  await batch.commit();
  return hits.length;
}

export async function syncByItemId(itemId: string): Promise<void> {
  const snap = await adminDb().doc(`plaidItems/${itemId}`).get();
  if (!snap.exists) return;
  const data = snap.data() as Omit<ItemDoc, "id">;
  await syncItem({ id: snap.id, ...data });
  await reconcileTransfers(data.uid);
}

export async function syncAllForUid(uid: string): Promise<{ items: number; added: number; modified: number; removed: number }> {
  const snap = await adminDb().collection("plaidItems").where("uid", "==", uid).get();
  let added = 0,
    modified = 0,
    removed = 0;
  for (const d of snap.docs) {
    const r = await syncItem({ id: d.id, ...(d.data() as Omit<ItemDoc, "id">) });
    added += r.added;
    modified += r.modified;
    removed += r.removed;
  }
  await reconcileTransfers(uid);
  return { items: snap.size, added, modified, removed };
}

export async function syncAllItems(): Promise<{ items: number }> {
  const snap = await adminDb().collection("plaidItems").get();
  const uids = new Set<string>();
  for (const d of snap.docs) {
    const data = d.data() as Omit<ItemDoc, "id">;
    await syncItem({ id: d.id, ...data });
    uids.add(data.uid);
  }
  for (const uid of uids) await reconcileTransfers(uid);
  return { items: snap.size };
}
