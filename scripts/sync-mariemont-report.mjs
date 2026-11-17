// Push the Mariemont Land Survey into the dashboard's Mariemont House tab:
//   - outreach.json rows  -> Firestore users/{uid}/houseOutreach (replaces all)
//   - the built PDF       -> Storage users/{uid}/mariemont/Mariemont-Land-Survey.pdf
//
// The report lives outside this repo on purpose (the repo is public and the
// outreach notes name neighbors). Re-run after every report rebuild.
//
// Run with:  npm run sync:mariemont
// Override the report folder with MARIEMONT_REPORT_DIR=/path/to/folder.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const REPORT_DIR = process.env.MARIEMONT_REPORT_DIR || join(homedir(), "Documents/Mariemont-Report");
const PDF_NAME = "Mariemont-Land-Survey.pdf";

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
  initializeApp({
    credential: cert(credential()),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// outreach.json holds HTML-ready text (the PDF is built from HTML).
const decode = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  const rows = JSON.parse(readFileSync(join(REPORT_DIR, "outreach.json"), "utf8"));
  const pdfPath = join(REPORT_DIR, PDF_NAME);
  if (!existsSync(pdfPath)) {
    console.error(`No ${PDF_NAME} in ${REPORT_DIR}. Build the report first.`);
    process.exit(1);
  }

  const list = await getAuth().listUsers(2);
  if (list.users.length === 0) {
    console.error("No Firebase Auth user found.");
    process.exit(1);
  }
  const uid = list.users[0].uid;
  console.log("Syncing for uid:", uid, list.users[0].email ?? "");

  // Outreach rows: full replace so removed rows disappear from the page too.
  const db = getFirestore();
  const col = db.collection(`users/${uid}/houseOutreach`);
  const batch = db.batch();
  const keep = new Set();
  rows.forEach((r, i) => {
    const id = slug(decode(r.property));
    keep.add(id);
    batch.set(col.doc(id), {
      property: decode(r.property),
      owner: decode(r.owner),
      contacted: decode(r.contacted),
      method: decode(r.method),
      status: decode(r.status),
      color: r.color || "n",
      notes: decode(r.notes),
      sortOrder: i,
    });
  });
  const existing = await col.get();
  existing.docs.filter((d) => !keep.has(d.id)).forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`  ${rows.length} outreach rows written`);

  // PDF: the page fetches it with the signed-in user's Storage rules.
  await getStorage()
    .bucket()
    .upload(pdfPath, {
      destination: `users/${uid}/mariemont/${PDF_NAME}`,
      metadata: { contentType: "application/pdf", cacheControl: "private, max-age=0" },
    });
  console.log(`  PDF uploaded (${PDF_NAME})`);

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
