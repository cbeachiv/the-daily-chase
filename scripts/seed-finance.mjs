// Backfills users/{uid}/financeSnapshots from a CSV of your monthly budget
// history, so the net-worth and income-vs-spend charts have history from day one
// (no transaction-level import needed for past months — the snapshot's stored
// income/spend totals are used as the fallback in lib/finance aggregation).
//
// Expected CSV (one header row, then one row per month). Column order is flexible
// — columns are matched by header name (case-insensitive). Recognized headers:
//   Month        -> "YYYY-MM" or "Oct 2023" / "October 2023"   (required)
//   Income       -> that month's total income
//   Total Spend  -> total monthly outflow incl. rent (falls back to "Spend")
//   Rent         -> rent paid that month
//   Bitcoin      -> month-end BTC holdings value
//   IRA          -> month-end IRA balance
//   Savings      -> month-end liquid savings balance
//   Hugga        -> Hugga investment balance
//   Notes        -> free-text notable items (optional)
// Dollar signs, commas, and blanks are fine. Idempotent: doc id = the month, so
// re-running overwrites. Build the CSV by exporting your tracking sheet — that's
// far less error-prone than re-keying it, and you can eyeball it before importing.
//
// Usage:  npm run seed:finance                  (default: scripts/finance-history.csv)
//         npm run seed:finance -- path/to.csv
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
  console.error("No credentials: set FIREBASE_* env vars or add serviceAccount.json.");
  process.exit(1);
}
if (!getApps().length) initializeApp({ credential: cert(credential()) });
const db = getFirestore();
const auth = getAuth();

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// "2023-10" | "Oct 2023" | "October 2023" -> "2023-10"
function parseMonth(s) {
  const t = (s || "").trim();
  let m = t.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}`;
  m = t.match(/^([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon === undefined) return null;
    return `${m[2]}-${String(mon + 1).padStart(2, "0")}`;
  }
  return null;
}

function parseLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const num = (s) => {
  if (s == null || String(s).trim() === "") return null;
  const neg = String(s).trim().startsWith("-");
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
};

function colIndex(header, names) {
  const h = header.map((x) => x.toLowerCase().trim());
  for (const n of names) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

async function main() {
  const path = process.argv[2] || "scripts/finance-history.csv";
  if (!existsSync(path)) {
    console.error(`CSV not found at ${path}. Export your budget history there (see header docs at top of this file).`);
    process.exit(1);
  }
  const list = await auth.listUsers(1);
  const uid = list.users[0]?.uid;
  if (!uid) { console.error("No user."); process.exit(1); }

  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const header = parseLine(lines[0]).map((h) => h.trim());
  const idx = {
    month: colIndex(header, ["month"]),
    income: colIndex(header, ["income"]),
    spend: colIndex(header, ["total spend", "spend"]),
    rent: colIndex(header, ["rent"]),
    bitcoin: colIndex(header, ["bitcoin", "btc"]),
    ira: colIndex(header, ["ira"]),
    savings: colIndex(header, ["savings"]),
    hugga: colIndex(header, ["hugga"]),
    notes: colIndex(header, ["notes"]),
  };
  if (idx.month < 0) { console.error('CSV needs a "Month" column.'); process.exit(1); }

  let batch = db.batch();
  let ops = 0;
  let count = 0;
  const flush = async () => { if (ops) { await batch.commit(); batch = db.batch(); ops = 0; } };

  for (const line of lines.slice(1)) {
    const cells = parseLine(line);
    const month = parseMonth(cells[idx.month]);
    if (!month) continue;
    const data = { month, createdAt: `${month}-01T12:00:00.000Z` };
    const put = (key, i) => { if (i >= 0) { const v = key === "notes" ? (cells[i] || "").trim() : num(cells[i]); if (v != null && v !== "") data[key] = v; } };
    put("income", idx.income);
    put("spend", idx.spend);
    put("rent", idx.rent);
    put("bitcoin", idx.bitcoin);
    put("ira", idx.ira);
    put("savings", idx.savings);
    put("hugga", idx.hugga);
    put("notes", idx.notes);
    batch.set(db.doc(`users/${uid}/financeSnapshots/${month}`), data, { merge: true });
    count++;
    if (++ops >= 400) await flush();
  }
  await flush();
  console.log(`Seeded ${count} monthly snapshots for ${list.users[0].email}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
