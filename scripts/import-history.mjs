// Imports historical weight + calorie data from a CSV export of Chase's
// weekly tracking sheet into Firestore (weightLogs + foodEntries).
//
// Expected CSV layout (one export of the sheet tab), two rows per week:
//   27-Oct-25,Weight,167.7,167.7,167.7,167.7,166.6,164.6,164.6,166.66
//   ,Calories,1800,1600,1970,1899,1953,2016,2128,"1,909"
// Col A = week's Monday date (blank on the Calories row), col B = Weight|Calories,
// cols C–I = Mon..Sun, last col = weekly average (ignored).
//
// Idempotent: one doc per day (id keyed by date), so re-running overwrites.
// Usage:  npm run import:history -- path/to/history.csv     (default: scripts/history.csv)
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

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Handles "27-Oct-25", "27 Oct 2025", "10/27/2025", "10/27/25", "2025-10-27".
function parseWeekDate(s) {
  const t = (s || "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/); // 27-Oct-25
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon === undefined) return null;
    let yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    return new Date(Date.UTC(yr, mon, Number(m[1])));
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // 2025-10-27
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // 10/27/2025 (M/D/Y)
  if (m) {
    let yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    return new Date(Date.UTC(yr, +m[1] - 1, +m[2]));
  }
  return null;
}

function isoPlus(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Minimal CSV line parser (handles quoted fields containing commas).
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
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

async function main() {
  const path = process.argv[2] || "scripts/history.csv";
  if (!existsSync(path)) {
    console.error(`CSV not found at ${path}. Export your sheet tab as CSV and save it there.`);
    process.exit(1);
  }
  const list = await auth.listUsers(1);
  const uid = list.users[0]?.uid;
  if (!uid) { console.error("No user."); process.exit(1); }

  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  let currentMonday = null;
  let batch = db.batch();
  let ops = 0;
  let weights = 0;
  let cals = 0;
  let minDate = "9999", maxDate = "0000";

  const flush = async () => { if (ops) { await batch.commit(); batch = db.batch(); ops = 0; } };
  const add = async (ref, data) => { batch.set(ref, data); if (++ops >= 400) await flush(); };

  for (const line of lines) {
    const cells = parseLine(line);
    const kind = (cells[1] || "").trim().toLowerCase();
    if (cells[0]?.trim()) {
      const d = parseWeekDate(cells[0]);
      if (d) currentMonday = d;
    }
    if (!currentMonday || (kind !== "weight" && kind !== "calories")) continue;

    for (let day = 0; day < 7; day++) {
      const raw = cells[2 + day];
      const v = num(raw);
      if (v === null || v === 0) continue;
      const date = isoPlus(currentMonday, day);
      if (date < minDate) minDate = date;
      if (date > maxDate) maxDate = date;
      const createdAt = `${date}T12:00:00.000Z`;
      if (kind === "weight") {
        await add(db.doc(`users/${uid}/weightLogs/w_${date}`), { date, weightLbs: v, createdAt });
        weights++;
      } else {
        await add(db.doc(`users/${uid}/foodEntries/f_${date}_import`), {
          date, calories: Math.round(v), label: "Imported", createdAt,
        });
        cals++;
      }
    }
  }
  await flush();
  console.log(`Imported ${weights} weight + ${cals} calorie days (${minDate} → ${maxDate}) for ${list.users[0].email}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
