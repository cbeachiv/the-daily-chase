// One-off: backfill Annie's growth measurements from the "Annie Beach" note.
// Idempotent — skips any date that already has an annieGrowth entry.
// Percentiles are computed by the app (lib/growth.ts), so we store only the raw
// measurements the pediatrician recorded. Weight-only weigh-ins leave length/head null.
//
// Run with:  npm run seed:annie-growth
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

// Pulled from the Annie Beach Apple note (pediatric visits + early weigh-ins).
// { date, weightLb, weightOz, lengthIn, headCm } — omit a field when not recorded.
const MEASUREMENTS = [
  { date: "2025-07-14", weightLb: 5, weightOz: 4, lengthIn: 18.5 }, // birth
  { date: "2025-07-18", weightLb: 4, weightOz: 14.5 }, // weigh-in
  { date: "2025-08-01", weightLb: 5, weightOz: 8.2 }, // weigh-in
  { date: "2025-08-18", weightLb: 7, weightOz: 0, lengthIn: 20.25, headCm: 35 },
  { date: "2025-09-17", weightLb: 9, weightOz: 4, lengthIn: 21, headCm: 36.5 },
  { date: "2025-10-17", weightLb: 10, weightOz: 13, lengthIn: 23, headCm: 37.4 }, // 3 mo
  { date: "2025-11-07", weightLb: 11, weightOz: 15, lengthIn: 23.5, headCm: 38.6 }, // 4 mo
  { date: "2026-01-30", weightLb: 14, weightOz: 11.5, lengthIn: 25.5, headCm: 41 }, // 6 mo
  { date: "2026-04-15", weightLb: 16, weightOz: 12, lengthIn: 27.5, headCm: 42 }, // 9 mo
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
  console.log("Seeding Annie growth for uid:", uid, list.users[0].email ?? "");

  const col = db.collection(`users/${uid}/annieGrowth`);
  const now = new Date().toISOString();

  for (const m of MEASUREMENTS) {
    const snap = await col.where("date", "==", m.date).get();
    if (!snap.empty) {
      console.log(`  ${m.date}: already logged, skipping`);
      continue;
    }
    await col.add({
      date: m.date,
      weightLb: m.weightLb ?? null,
      weightOz: m.weightOz ?? null,
      lengthIn: m.lengthIn ?? null,
      headCm: m.headCm ?? null,
      weightPctManual: null,
      lengthPctManual: null,
      headPctManual: null,
      note: m.note ?? null,
      createdAt: now,
    });
    console.log(`  ${m.date}: added`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
