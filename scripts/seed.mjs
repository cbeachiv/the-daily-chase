// Seeds the single user's Firestore with code-activity history and portfolio
// projects (migrated from the old static site). Idempotent: re-running
// overwrites the same deterministic doc IDs.
//
// Run with:  npm run seed
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

// ── Code activity (ported from legacy/script.js) ──
const WEEKS = [
  ["Feb 9", "2026-02-09"], ["Feb 16", "2026-02-16"], ["Feb 23", "2026-02-23"], ["Mar 2", "2026-03-02"],
  ["Mar 9", "2026-03-09"], ["Mar 16", "2026-03-16"], ["Mar 23", "2026-03-23"], ["Mar 30", "2026-03-30"],
  ["Apr 6", "2026-04-06"], ["Apr 13", "2026-04-13"], ["Apr 20", "2026-04-20"], ["Apr 27", "2026-04-27"],
  ["May 4", "2026-05-04"], ["May 11", "2026-05-11"], ["May 18", "2026-05-18"], ["May 25", "2026-05-25"],
];

const REPOS = [
  { name: "Guests First iOS", color: "#10b981", data: [20665, 171, 0, 3120, 986, 150, 144, 0, 0, 17427, 28700, 4053, 5214, 596, 0, 522] },
  { name: "Visit Mariemont", color: "#6366f1", data: [0, 8147, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Hugga Retreats Website", color: "#14b8a6", data: [0, 4081, 100, 337, 0, 1917, 1991, 241, 4944, 1946, 1627, 2727, 14875, 15323, 10256, 20956] },
  { name: "Hugga Email Newsletter", color: "#a855f7", data: [0, 0, 2231, 2779, 0, 0, 57, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "NC Agent Core", color: "#0ea5e9", data: [0, 874, 0, 3519, 34, 39, 28, 56, 56, 56, 56, 30, 0, 0, 0, 0] },
  { name: "Viggo Agent", color: "#ff6b6b", data: [0, 2874, 0, 505, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Hugga x Pickle Lodge", color: "#f97316", data: [0, 2566, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Pot of Hugga", color: "#f59e0b", data: [0, 2101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Where Does Leucadia Start?", color: "#06b6d4", data: [0, 1983, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Alfred Agent", color: "#ec4899", data: [0, 1750, 0, 294, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Sarah Beach Interiors", color: "#e11d48", data: [0, 0, 0, 0, 0, 8502, 38, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Left vs Right Brain", color: "#d97706", data: [0, 0, 0, 1322, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "The Daily Chase", color: "#8b5cf6", data: [0, 770, 0, 37, 0, 0, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Hugga Integrations", color: "#22d3ee", data: [0, 0, 0, 0, 0, 0, 1331, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
];

// ── Portfolio projects (migrated from project-config.json + index.html) ──
const BUILDING = [
  { displayName: "Guests First iOS", description: "App for the Hugga team to keep track of cleans, maintenance, and guest feedback.", appUrl: "https://apps.apple.com/us/app/guests-first/id6759132620" },
  { displayName: "Hugga Retreats", description: "42 acres with four cabins in Hocking Hills.", siteUrl: "https://www.huggaretreats.com" },
  { displayName: "Visit Mariemont", description: "An interactive itinerary builder I use to plan personalized visits for friends and family coming to town.", siteUrl: "https://www.visitmariemont.com" },
  { displayName: "Hugga Integrations", description: "Hostfully pre-arrival form to Mailchimp sync for Hugga Retreats guest communications." },
  { displayName: "Hugga Email Newsletter", description: "Email newsletter system for Hugga Retreats — welcome series, seasonal campaigns, and The Slow Post." },
  { displayName: "Sarah Beach Interiors", description: "Custom website for Sarah Beach Interiors, an interior design studio." },
  { displayName: "Left vs Right Brain", description: "Left vs Right Brain — an AI podcast by Greg and Chase." },
  { displayName: "Where Does Leucadia Start?", description: "Curiosity-driven initiative to figure out where Encinitas ends and Leucadia begins.", siteUrl: "https://leucadia.vercel.app" },
  { displayName: "The Daily Chase", description: "My long-running home on the internet — now this private dashboard." },
];

const PREVIOUS = [
  { displayName: "InsurGrid", description: "SaaS tool for insurance agents.", badge: "Acquired", dates: "January 2019 – January 2025", outcome: "Acquired by Helium Ventures" },
  { displayName: "Anadro", description: "Residential Solar + BTC mining.", badge: "Wound Down", dates: "May 2023 – April 2025", outcome: "Concluded our initial thesis was wrong and decided to wind down" },
  { displayName: "Alfred Agent", description: "Personal operations coordinator — daily check-ins, health tracking, and weekly reviews via Telegram.", badge: "Wound Down", dates: "February 2026 – March 2026", outcome: "Moved away from OpenClaw" },
  { displayName: "Viggo Agent", description: "Automated guest messaging agent for Hugga Retreats.", badge: "Wound Down", dates: "February 2026 – March 2026", outcome: "Moved away from OpenClaw" },
  { displayName: "Siding Quote Generator", description: "Quoting tool for a siding contractor.", badge: "Completed", dates: "February 2026", outcome: "Passed off to my friend who owns the siding business" },
  { displayName: "Hugga x Pickle Lodge", description: "Partnership between Hugga and The Pickle Lodge to cross-promote both brands.", badge: "Wound Down", dates: "February 2026", outcome: "Never went anywhere" },
  { displayName: "NC Agent Core", description: "Shared agent engine for NC LLC agents — scheduling, tool routing, and Telegram integration.", badge: "Wound Down", dates: "March 2026", outcome: "Stopped using n8n workflows" },
  { displayName: "Pot of Hugga", description: "St. Patrick's Day scavenger hunt experience at Hugga Retreats.", badge: "Completed", dates: "March 2026", outcome: "St. Patrick's Day over" },
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
  if (list.users.length > 1) {
    console.warn("Multiple users found; seeding the first one:", list.users[0].email);
  }
  const uid = list.users[0].uid;
  console.log("Seeding for uid:", uid, list.users[0].email ?? "");

  const batch = db.batch();

  // Code activity (skip zero weeks; the chart fills gaps).
  for (const repo of REPOS) {
    repo.data.forEach((lines, i) => {
      if (lines <= 0) return;
      const [label, weekStart] = WEEKS[i];
      const id = `${slug(repo.name)}_${weekStart}`;
      batch.set(db.doc(`users/${uid}/codeActivity/${id}`), {
        weekStart,
        label,
        repoName: repo.name,
        color: repo.color,
        lines,
      });
    });
  }

  // Projects.
  BUILDING.forEach((p, i) => {
    batch.set(db.doc(`users/${uid}/projects/${slug(p.displayName)}`), {
      ...p,
      isPrevious: false,
      sortOrder: i,
    });
  });
  PREVIOUS.forEach((p, i) => {
    batch.set(db.doc(`users/${uid}/projects/${slug(p.displayName)}`), {
      ...p,
      isPrevious: true,
      sortOrder: i,
    });
  });

  await batch.commit();
  console.log(`Seeded ${REPOS.length} repos of code activity + ${BUILDING.length + PREVIOUS.length} projects.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
