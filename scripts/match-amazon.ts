// Match an Amazon privacy-central (DSAR) export against Amazon card charges in
// financeTransactions, writing item names into each matched charge's `note`.
// Covers retail shipments (Order History.csv) and digital purchases
// (Digital Content Orders.csv — Kindle, Audible, Prime Video).
//
// Usage:
//   npm run match:amazon -- "/path/to/Your Orders" [--dry-run] [--since YYYY-MM] [--force]
//
//   --dry-run   print what would be written, write nothing
//   --since     only consider transactions from this month onward
//   --force     overwrite notes that already exist (default: leave them alone)
//
// Monthly ritual:
//   1. (1st of month) amazon.com → Account → Privacy Central → "Request My Data"
//      → select "Your Orders" → submit, then click the confirmation link Amazon
//      emails you.
//   2. Hours–days later "Your Data Request" arrives from dsar-request@amazon.com
//      (download link valid 90 days). Download, unzip, then:
//        npm run match:amazon -- ~/Downloads/"Your Orders" --since <last-month> --dry-run
//   3. Review the preview, re-run without --dry-run.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { matchAmazonOrders, parseAmazonDigitalOrders, parseAmazonOrders } from "../lib/finance.ts";
import type { AmazonOrder } from "../lib/finance.ts";
import type { FinanceTransaction } from "../lib/types.ts";

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

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const sinceIdx = args.indexOf("--since");
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : undefined;
const dir = args.find((a) => !a.startsWith("--") && a !== since);
if (!dir || (since && !/^\d{4}-\d{2}$/.test(since))) {
  console.error('Usage: npm run match:amazon -- "/path/to/Your Orders" [--dry-run] [--since YYYY-MM] [--force]');
  process.exit(1);
}

function loadOrders(exportDir: string): AmazonOrder[] {
  const read = (rel: string, parse: (text: string) => AmazonOrder[], label: string) => {
    const p = join(exportDir, rel);
    if (!existsSync(p)) {
      console.warn(`(${label}: ${rel} not found, skipping)`);
      return [];
    }
    const orders = parse(readFileSync(p, "utf8"));
    console.log(`${label}: ${orders.length} orders from ${rel}`);
    return orders;
  };
  return [
    ...read("Your Amazon Orders/Order History.csv", parseAmazonOrders, "retail"),
    ...read("Your Amazon Orders/Digital Content Orders.csv", parseAmazonDigitalOrders, "digital"),
  ];
}

const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;

async function main() {
  const orders = loadOrders(dir!);
  if (orders.length === 0) {
    console.error("No orders parsed — is that the unzipped DSAR export folder?");
    process.exit(1);
  }
  const orderDates = orders.map((o) => o.date).sort();

  const u = (await auth.listUsers(1)).users[0];
  if (!u) {
    console.error("No user.");
    process.exit(1);
  }
  const colRef = db.collection(`users/${u.uid}/financeTransactions`);
  const snap = since ? await colRef.where("date", ">=", `${since}-01`).get() : await colRef.get();
  const txns = snap.docs.map((d) => ({ ...(d.data() as FinanceTransaction), id: d.id }));
  const txnDates = txns.map((t) => t.date).filter(Boolean).sort();

  console.log(
    `coverage: orders ${orderDates[0]} → ${orderDates[orderDates.length - 1]}, ` +
      `transactions ${txnDates[0] ?? "none"} → ${txnDates[txnDates.length - 1] ?? "none"}` +
      (since ? ` (since ${since})` : "") +
      ` — orders before the first transaction can't match anything`
  );

  const charges = txns.filter(
    (t) => /amazon|amzn/i.test(t.descriptionOverride ?? t.description) && !t.excluded && t.amount < 0
  );
  const updates = matchAmazonOrders(charges, orders);
  const byId = new Map(txns.map((t) => [t.id, t]));

  const toWrite: { id: string; note: string }[] = [];
  let unchanged = 0;
  let kept = 0;
  for (const upd of updates) {
    const existing = byId.get(upd.id)?.note;
    if (existing === upd.note) unchanged++;
    else if (existing && !force) kept++;
    else toWrite.push(upd);
  }

  const matchedIds = new Set(updates.map((u2) => u2.id));
  const unmatched = charges.filter((c) => !matchedIds.has(c.id));

  console.log(
    `\n${charges.length} Amazon charges · ${updates.length} matched · ` +
      `${unchanged} already noted · ${kept} kept existing note (use --force to overwrite) · ` +
      `${unmatched.length} unmatched · ${toWrite.length} to write`
  );

  if (dryRun) {
    if (toWrite.length) {
      console.log("\nWould write:");
      for (const w of toWrite) {
        const t = byId.get(w.id)!;
        console.log(`  ${t.date}  ${money(t.amount)}  ${w.note.slice(0, 100)}`);
      }
    }
    if (unmatched.length) {
      console.log("\nUnmatched charges (gift-card tender, Whole Foods in-store, refunds-adjusted, etc.):");
      for (const t of unmatched) console.log(`  ${t.date}  ${money(t.amount)}  ${t.description.slice(0, 60)}`);
    }
    console.log("\nDry run — nothing written.");
    return;
  }

  let batch = db.batch();
  let ops = 0;
  for (const w of toWrite) {
    batch.update(colRef.doc(w.id), { note: w.note });
    if (++ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops) await batch.commit();
  console.log(`Wrote notes to ${toWrite.length} transactions for ${u.email}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
