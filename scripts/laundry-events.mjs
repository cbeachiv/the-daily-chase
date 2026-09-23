// Read-only: print the laundry event log so plug thresholds can be tuned.
// Each stop shows the watts the plug saw and how long until the next start;
// a stop that "resumed" within minutes is a mid-cycle flap, not a real end.
// Run with:  node --env-file=.env.local scripts/laundry-events.mjs [--days 3]
import { existsSync, readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
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

const daysArg = process.argv.indexOf("--days");
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 7;
if (!Number.isFinite(days) || days <= 0) {
  console.error("Usage: node scripts/laundry-events.mjs [--days N]");
  process.exit(1);
}

if (!getApps().length) initializeApp({ credential: cert(credential()) });
const db = getFirestore();

const RESUME_WINDOW_MS = 20 * 60_000;
const fmt = (t) =>
  new Date(t).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const since = Date.now() - days * 86_400_000;
const snap = await db.collection("laundryEvents").where("at", ">=", since).orderBy("at").get();
const events = snap.docs.map((d) => d.data());
// Older events have no `kind`; derive it from `running`.
const kindOf = (e) => e.kind ?? (e.running ? "start" : "stop");

for (const machine of ["washer", "dryer"]) {
  const es = events.filter((e) => e.machine === machine);
  console.log(`\n== ${machine} (last ${days} days, ${es.length} events)`);
  let startedAt = null;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    const kind = kindOf(e);
    let note = "";
    if (kind === "start") startedAt = e.at;
    if (kind === "stop") {
      const ran = startedAt !== null ? `ran ${Math.round((e.at - startedAt) / 60_000)}m` : "";
      const next = es.slice(i + 1).find((x) => kindOf(x) === "start");
      const gap = next ? next.at - e.at : null;
      const tail = gap !== null && gap < RESUME_WINDOW_MS ? `resumed after ${Math.round(gap / 1000)}s` : "END";
      note = [ran, tail].filter(Boolean).join(", ");
      startedAt = null;
    }
    if (e.source) note = `source=${e.source}`;
    console.log(`${fmt(e.at).padEnd(18)} ${kind.padEnd(14)} ${String(e.watts).padStart(6)} W  ${note}`);
  }
}

const status = (await db.doc("laundry/status").get()).data() ?? {};
console.log("\n== laundry/status");
for (const machine of ["washer", "dryer"]) {
  const m = status[machine] ?? {};
  const row = Object.entries(m).map(([k, v]) => `${k}=${typeof v === "number" && v > 1e12 ? fmt(v) : v}`);
  console.log(`${machine}: ${row.join("  ")}`);
}
process.exit(0);
