// Seeds Sarah Beach Interiors with the three known clients. Idempotent: keyed on
// deterministic slug doc IDs, so re-running overwrites rather than duplicates.
//
// Run with:  npm run seed:interiors
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

const CLIENTS = [
  {
    clientName: "Julie Griswold",
    address: "1 Albert Place",
    rooms: ["Living room", "Master bedroom", "Guest bedroom"],
    designFee: 2700,
    hourlyRate: 125,
    status: "active",
    startDate: "2026-06-29",
  },
  {
    clientName: "Miss Sally",
    address: "7011 Bramble Ave",
    rooms: ["Living room", "Kitchen", "Bathroom"],
    designFee: 2100,
    status: "completed",
  },
  {
    clientName: "Hugga",
    rooms: ["Cabin 1", "Cabin 2", "Cabin 3", "Cabin 4"],
    designFee: 3600,
    status: "completed",
    notes: "Four cabins — added couches and other decor.",
  },
];

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  const list = await auth.listUsers(2);
  if (list.users.length === 0) {
    console.error("No Firebase Auth user found. Create your login user first.");
    process.exit(1);
  }
  const uid = list.users[0].uid;
  console.log("Seeding interiors for uid:", uid, list.users[0].email ?? "");

  const now = new Date().toISOString();
  const batch = db.batch();
  CLIENTS.forEach((c, i) => {
    batch.set(db.doc(`users/${uid}/designClients/${slug(c.clientName)}`), {
      ...c,
      sortOrder: i,
      createdAt: now,
    });
  });
  await batch.commit();
  console.log(`Seeded ${CLIENTS.length} clients.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
