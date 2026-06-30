// One-off: backfill alcoholic-drink (beer) counts onto the daily mood logs for
// a handful of June days. Idempotent — re-running just re-sets the same values.
//
// For each date: if a moodLog already exists, set its `alcoholDrinks`; if none
// exists, create a minimal drinks-only log (no mood/energy) so the day's entry
// never shows up as a real mood point on the chart.
//
// Run with:  npm run seed:beers
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

if (!getApps().length) {
  initializeApp({ credential: cert(credential()) });
}
const db = getFirestore();
const auth = getAuth();

// [date (YYYY-MM-DD), number of beers]
const BEERS = [
  ["2026-06-01", 3],
  ["2026-06-02", 4],
  ["2026-06-05", 6],
  ["2026-06-06", 5],
];

async function main() {
  const list = await auth.listUsers(2);
  if (list.users.length === 0) {
    console.error("No Firebase Auth user found. Create your login user first.");
    process.exit(1);
  }
  if (list.users.length > 1) {
    console.warn("Multiple users found; seeding the first one:", list.users[0].email);
  }
  const uid = list.users[0].uid;
  console.log("Seeding beers for uid:", uid, list.users[0].email ?? "");

  const col = db.collection(`users/${uid}/moodLogs`);
  const now = new Date().toISOString();

  for (const [date, beers] of BEERS) {
    const snap = await col.where("date", "==", date).get();
    if (!snap.empty) {
      // Apply to every log that day (typically one); preserves mood/energy.
      await Promise.all(snap.docs.map((d) => d.ref.update({ alcoholDrinks: beers })));
      console.log(`  ${date}: set alcoholDrinks=${beers} on ${snap.size} existing log(s)`);
    } else {
      await col.add({
        date,
        loggedAt: `${date}T12:00:00.000Z`,
        alcoholDrinks: beers,
        createdAt: now,
      });
      console.log(`  ${date}: created drinks-only log with alcoholDrinks=${beers}`);
    }
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
