// Renders a faithful "Weekly Review" email preview using the SAME builder the
// cron route uses, with sample data. Run: node scripts/preview-weekly.mjs
// Writes preview-weekly.html next to it. (Node 24 strips the .ts types on import.)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildEmailHtml } from "../app/api/cron/weekly-email/email.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const data = {
  weekEnding: "June 20, 2026",
  intro:
    "Three PRs and a shipped product in one week — that's momentum, not luck. You stayed in motion even while waiting on the surveyors and the Donaldson follow-up, and your reflections show it: the building days were your best days. The one soft spot was the back half of the week, where the energy dipped and a couple of personal loops slid. Worth a look below.",
  huggaTasks: [
    "Shipped first version of the Pickle Lodge cleaning app",
    "Coordinated Exline surveyors for the ALTA survey",
    "Pushed Donaldson Health follow-up forward",
  ],
  personalTasks: [
    "Locked in the San Diego trip",
    "Family bike ride Saturday morning",
    "Booked Annie's checkup",
  ],
  weekGoals: [
    { title: "Ship Pickle Lodge v1", done: true },
    { title: "Work out every day — no zero days", done: true },
    { title: "Call parents twice", done: false },
  ],
  monthGoals: [
    { title: "Close the ALTA survey loop", done: false },
    { title: "Hit 3 lifts/week all month", done: true },
    { title: "Plan the San Diego trip", done: true },
  ],
  weekGoalsDone: 2,
  weekGoalsTotal: 3,
  monthGoalsDone: 2,
  monthGoalsTotal: 3,
  lifts: 3,
  liftVolume: "62,555 lb",
  liftPRs: 3,
  cardioSessions: 5,
  cardioMinutes: 170,
  cardioMiles: "4.5 mi",
  weightChange: "-1.7 lb",
  avgMood: "8.5",
  avgEnergy: "8.3",
  daysReflected: 5,
  productiveDays: 4,
  avgScore: 4.2,
  dayScores: [
    { label: "Mon", score: 5 },
    { label: "Tue", score: 4 },
    { label: "Wed", score: 5 },
    { label: "Thu", score: 3 },
    { label: "Fri", score: null },
    { label: "Sat", score: 4 },
  ],
  reflectionHighlights: [
    "“The days I build something are the days I feel like myself.”",
    "Learned to stop refreshing email while waiting on others — it just drains the day.",
  ],
  aiQuestion:
    "You noticed you do best when you're shipping — what's the one thing you could put in motion Monday so next week starts in build mode?",
  reviewUrl: "https://thedailychase.com/weekly-review?week=2026-06-20",
};

const html = buildEmailHtml(data);
const out = join(__dirname, "preview-weekly.html");
writeFileSync(out, html);
console.log(out);
