// Server-only: pull transactions for connected Plaid items via the cursor-based
// /transactions/sync endpoint and write them into users/{uid}/financeTransactions.
// Shared by the manual sync route, the webhook, and the daily cron backstop.
import { adminDb } from "@/lib/firebase/admin";
import { plaidClient, plaidTxnToDoc } from "@/lib/plaid";

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
      // Modified: update Plaid-derived fields but PRESERVE the stored category so a
      // user's manual recategorization survives a re-sync (pending→posted, etc.).
      for (const t of data.modified) {
        const { id, data: d } = plaidTxnToDoc(t, item.id, now);
        const { category: _omitCategory, ...rest } = d;
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

export async function syncByItemId(itemId: string): Promise<void> {
  const snap = await adminDb().doc(`plaidItems/${itemId}`).get();
  if (!snap.exists) return;
  await syncItem({ id: snap.id, ...(snap.data() as Omit<ItemDoc, "id">) });
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
  return { items: snap.size, added, modified, removed };
}

export async function syncAllItems(): Promise<{ items: number }> {
  const snap = await adminDb().collection("plaidItems").get();
  for (const d of snap.docs) {
    await syncItem({ id: d.id, ...(d.data() as Omit<ItemDoc, "id">) });
  }
  return { items: snap.size };
}
