// One-off: set a tracked project's startDate by name.
// Run with:  node --env-file=.env.local scripts/set-project-start.mjs "Clean Kitchens App" 2026-06-10
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

const [, , projectName, startDate] = process.argv;
if (!projectName || !/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "")) {
  console.error('Usage: node scripts/set-project-start.mjs "<Project Name>" YYYY-MM-DD');
  process.exit(1);
}

if (!getApps().length) initializeApp({ credential: cert(credential()) });
const db = getFirestore();
const auth = getAuth();

const list = await auth.listUsers(2);
if (list.users.length !== 1) {
  console.error(`Expected exactly one user, found ${list.users.length}.`);
  process.exit(1);
}
const uid = list.users[0].uid;

const snap = await db.collection(`users/${uid}/trackedProjects`).where("name", "==", projectName).get();
if (snap.empty) {
  console.error(`No tracked project named "${projectName}".`);
  process.exit(1);
}
if (snap.size > 1) {
  console.error(`Found ${snap.size} projects named "${projectName}" — be more specific.`);
  process.exit(1);
}

await snap.docs[0].ref.update({ startDate });
console.log(`Set startDate of "${projectName}" to ${startDate}.`);
process.exit(0);
