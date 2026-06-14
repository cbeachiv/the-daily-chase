// Renders a faithful "Reps & Repositories" email preview using the SAME builder
// the cron route uses, with realistic sample data. Run: node scripts/preview-renr.mjs
// Writes preview-renr.html next to it. (Node 24 strips the .ts types on import.)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildEmailHtml } from "../app/api/cron/reps-and-repos/email.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// REAL data for the Monday–Sunday week of Jun 8–14, 2026:
//   • Lifts  — data/lifts.json (sessions 6/8, 6/10, 6/12), e1RM week-over-week
//   • Repos  — live from GitHub GraphQL (additions Jun 8 00:00Z – Jun 15 00:00Z)
// Cardio is illustrative only (it lives in Firestore, which isn't reachable
// from this workspace) — the live cron send will use the real runs.
const timNote = [
  "Gino — Tim here at the Marathon, mindin' the pumps in Bowersville.",
  "Slow Sunday, so here's the rundown. Chase is chasin' that progressive overload and it's workin' — FIVE different lifts went up from last time, and he banked three new PRs this week.",
  "Nudged his trap bar deadlift to 320 for eight, and that belt squat's still parked at the top of the mountain.",
  "Then he pours sixty-some-thousand lines of code, most of it into that Daily Chase app and the Pickle Lodge kitchen job. Slow and steady, little more every week — that's how you do it. Coffee's free if he swings back through.",
].join("\n");

const data = {
  weekEnding: "June 14, 2026",
  note: timNote,
  // REAL — from data/lifts.json (week-over-week e1RM, Mon–Sun Jun 8–14)
  lifts: {
    sessions: 3,
    improved: 5,
    tracked: 21,
    prs: 3,
    volume: 62555,
    progress: [
      { name: "Iso-Lateral Row (Machine)", set: "260 lb × 10", e1rm: 347, delta: 13.4 },
      { name: "Leg Extension (Machine)", set: "137 lb × 10", e1rm: 183, delta: 9.4 },
      { name: "Trap Bar Deadlift", set: "320 lb × 8", e1rm: 405, delta: 6.3 },
      { name: "Incline Bench Press (Dumbbell)", set: "80 lb × 8", e1rm: 101, delta: 6.3 },
      { name: "Preacher Curl (Dumbbell)", set: "30 lb × 7", e1rm: 37, delta: 3.7 },
      { name: "Belt Squat", set: "360 lb × 8", e1rm: 456, delta: 0 },
    ],
    trend: {
      label: "Belt Squat",
      points: [
        { label: "Feb 18", e1rm: 348 },
        { label: "Feb 25", e1rm: 361 },
        { label: "Mar 4", e1rm: 361 },
        { label: "Mar 11", e1rm: 420 },
        { label: "Mar 18", e1rm: 408 },
        { label: "Apr 1", e1rm: 431 },
        { label: "Apr 15", e1rm: 456 },
        { label: "Apr 29", e1rm: 456 },
        { label: "May 27", e1rm: 456 },
        { label: "Jun 10", e1rm: 456 },
      ],
    },
  },
  // ILLUSTRATIVE — real cardio lives in Firestore (not reachable here).
  // Set OMIT_CARDIO=1 to drop the section entirely (e.g. for a real send where
  // cardio can't be verified) — lifts + repos remain real.
  cardio:
    process.env.OMIT_CARDIO === "1"
      ? null
      : {
          sessions: 2,
          runs: 1,
          minutes: 80,
          miles: 4.0,
          avgPace: "8:55",
          rows: [
            { label: "Outdoor run", miles: 4.0, min: 35, clock: "35:00" },
            { label: "Pickleball", miles: null, min: 45, clock: "45:00" },
          ],
        },
  // REAL — from GitHub GraphQL (additions Jun 7–13), display names + colors via lib/github.ts
  repos: {
    count: 5,
    totalLines: 64377,
    rows: [
      { name: "The Daily Chase", lines: 29560, color: "#8b5cf6" },
      { name: "Picklelodge Clean Kitchens", lines: 19065, color: "#0ea5e9" },
      { name: "Hugga Expansion", lines: 11643, color: "#10b981" },
      { name: "Guests First iOS", lines: 3265, color: "#22c55e" },
      { name: "Hugga Retreats", lines: 844, color: "#14b8a6" },
    ],
  },
};

const html = buildEmailHtml(data);
const out = join(__dirname, "preview-renr.html");
writeFileSync(out, html);
console.log(out);
