// Dev-only: render the Sunday laundry email from the REAL laundryEvents log,
// without sending it or calling Claude, to check layout and numbers.
// Run from the main checkout (needs FIREBASE_* env or serviceAccount.json):
//   npx tsx scripts/preview-laundry-email.ts [--today 2026-09-27] [--out /tmp/laundry.html]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { buildEmailHtml } from "../app/api/cron/laundry-weekly/email";
import { buildLoads, etParts, weeklyStats, type RawLaundryEvent } from "../lib/laundryStats";

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

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const today = arg("--today") ?? etParts(Date.now()).date;
const out = arg("--out") ?? join(tmpdir(), "laundry-report-preview.html");

async function main() {
  initializeApp({ credential: cert(credential()) });
  const snap = await getFirestore().collection("laundryEvents").orderBy("at").get();
  const events = snap.docs.map((d) => d.data() as RawLaundryEvent);

  const loads = buildLoads(events);
  const week = weeklyStats(loads, today, events[0]?.at ?? null);
  const html = buildEmailHtml({
    week,
    intro: "(Claude's intro goes here in the real email.)",
    siteUrl: "https://www.3720centerstreet.com",
  });
  writeFileSync(out, html);

  for (const l of loads) {
    const s = etParts(l.start);
    console.log(`${s.date} ${String(s.hour).padStart(2)}:${String(s.minute).padStart(2, "0")}  ${l.machine.padEnd(6)} ${Math.round((l.end - l.start) / 60000)} min`);
  }
  console.log(`\n${week.from} to ${week.to}: washer ${week.washer.loads}, dryer ${week.dryer.loads}`);
  console.log(`Wrote ${out}`);
}

main().then(() => process.exit(0));
