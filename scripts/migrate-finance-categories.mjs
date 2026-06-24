// One-time migration: remap existing financeTransactions from the original
// category set to the new one. Idempotent (already-new values are left as-is).
//
//   Dining        -> Eating Out
//   Transportation-> Travel
//   Utilities     -> Subscription
//   Entertainment -> Subscription
//   Housing       -> Rent
//   Shopping      -> Chase Discretionary   (no Shopping bucket; discretionary catch-all)
//   Health        -> Chase Discretionary
//   Other         -> Chase Discretionary
//   (Groceries / Travel / Income / Transfer unchanged)
//
// Usage:  npm run migrate:finance-cats
import { existsSync, readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function credential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
  if (existsSync("serviceAccount.json")) {
    const j = JSON.parse(readFileSync("serviceAccount.json", "utf8"));
    return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
  }
  console.error("No credentials.");
  process.exit(1);
}
if (!getApps().length) initializeApp({ credential: cert(credential()) });
const db = getFirestore();
const auth = getAuth();

const MAP = {
  Dining: "Eating Out",
  Transportation: "Travel",
  Utilities: "Subscription",
  Entertainment: "Subscription",
  Housing: "Rent",
  Shopping: "Chase Discretionary",
  Health: "Chase Discretionary",
  Other: "Chase Discretionary",
};

async function main() {
  const u = (await auth.listUsers(1)).users[0];
  if (!u) { console.error("No user."); process.exit(1); }
  const col = db.collection(`users/${u.uid}/financeTransactions`);
  const snap = await col.get();
  let batch = db.batch();
  let ops = 0;
  let changed = 0;
  const flush = async () => { if (ops) { await batch.commit(); batch = db.batch(); ops = 0; } };
  for (const d of snap.docs) {
    const cur = d.data().category;
    const next = MAP[cur];
    if (next && next !== cur) {
      batch.update(d.ref, { category: next });
      changed++;
      if (++ops >= 400) await flush();
    }
  }
  await flush();
  console.log(`Remapped ${changed} of ${snap.size} transactions for ${u.email}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
