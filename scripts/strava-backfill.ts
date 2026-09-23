// One-time (re-runnable) Strava backfill: every run since 2000 into Exercise + Cardio.
// Run from a checkout with serviceAccount.json:  npx tsx scripts/strava-backfill.ts
import { adminAuth } from "@/lib/firebase/admin";
import { syncStrava } from "@/lib/stravaSync";

async function main() {
  const uid = (await adminAuth().listUsers(1)).users[0].uid;
  const result = await syncStrava(uid, { sinceEpoch: Date.UTC(2000, 0, 1) / 1000 });
  console.log(`runs: ${result.runs}, new Exercise days: ${result.added.length}`);
}

main();
