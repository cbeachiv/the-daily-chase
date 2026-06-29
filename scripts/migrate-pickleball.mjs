// One-off migration: re-categorize existing "Other" cardio entries whose
// activity looks like a racket sport into the first-class kinds
// "pickleball" / "tennis". This also bundles name variants
// (e.g. "Tennis Clinic" + "Wednesday Tennis Clinic" → kind "tennis").
// Idempotent — re-running only touches docs not already on the target kind.
//
// Run with:  npm run migrate:pickleball
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

// Activity text → target kind. First match wins.
const RULES = [
  { re: /pickle/i, kind: "pickleball" },
  { re: /tennis/i, kind: "tennis" },
];

function targetKind(activity) {
  if (typeof activity !== "string") return null;
  for (const r of RULES) if (r.re.test(activity)) return r.kind;
  return null;
}

const DRY_RUN = process.argv.includes("--dry");

async function main() {
  if (DRY_RUN) console.log("DRY RUN — no changes will be written.\n");
  const list = await auth.listUsers(1000);
  if (list.users.length === 0) {
    console.error("No Firebase Auth user found.");
    process.exit(1);
  }

  let changed = 0;
  for (const user of list.users) {
    const uid = user.uid;
    const snap = await db.collection(`users/${uid}/cardio`).get();
    const batch = db.batch();
    let n = 0;
    for (const doc of snap.docs) {
      const d = doc.data();
      const target = targetKind(d.activity);
      if (!target || d.kind === target) continue;
      if (!DRY_RUN) batch.update(doc.ref, { kind: target });
      n++;
      console.log(`  ${uid} · ${doc.id} · "${d.activity}" → ${target}`);
    }
    if (n > 0 && !DRY_RUN) {
      await batch.commit();
      changed += n;
    } else {
      changed += n;
    }
  }

  console.log(
    `\n${DRY_RUN ? "Would re-categorize" : "Done. Re-categorized"} ${changed} cardio ${changed === 1 ? "entry" : "entries"}.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
