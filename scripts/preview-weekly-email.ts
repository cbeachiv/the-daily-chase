// Dev-only: render the weekly email to /tmp with sample data to eyeball the layout.
// Run: npx tsx scripts/preview-weekly-email.ts
import { writeFileSync } from "node:fs";
import { buildEmailHtml, type WeeklyEmailData } from "../app/api/cron/weekly-email/email";

const data: WeeklyEmailData = {
  weekEnding: "June 27, 2026",
  intro:
    "Solid week. You pushed Clean Kitchens App forward — two milestones knocked out and three to-dos closed against it — while keeping goals on track. Hugga work stayed steady; personal admin slipped a touch.",
  huggaTasks: ["Ship onboarding flow", "Review Q3 roadmap"],
  personalTasks: ["Book flights", "Call mom"],
  weekGoals: [
    { title: "Launch projects tab", done: true },
    { title: "5 lifts", done: false },
  ],
  monthGoals: [{ title: "Hit 185 lb", done: false }],
  weekGoalsDone: 1,
  weekGoalsTotal: 2,
  monthGoalsDone: 0,
  monthGoalsTotal: 1,
  projects: [
    { name: "Clean Kitchens App", category: "personal", milestoneDone: 2, milestoneTotal: 5, todosThisWeek: 3 },
    { name: "Hugga Retreats Website", category: "hugga", milestoneDone: 4, milestoneTotal: 4, todosThisWeek: 1 },
    { name: "Viggo Agent", category: "hugga", milestoneDone: 0, milestoneTotal: 0, todosThisWeek: 0 },
  ],
  wakeups5am: 4,
  wakeupStreak: 6,
  workouts: 5,
  lifts: 3,
  liftVolume: "42,300 lb",
  liftPRs: 1,
  cardioSessions: 2,
  cardioMinutes: 55,
  cardioMiles: "4.5 mi",
  weightChange: "-0.8 lb",
  avgMood: "7.8",
  avgEnergy: "7.2",
  daysReflected: 5,
  productiveDays: 4,
  avgScore: 4.1,
  dayScores: [
    { label: "Mon", score: 4 },
    { label: "Tue", score: 5 },
    { label: "Wed", score: null },
    { label: "Thu", score: 4 },
    { label: "Fri", score: 3 },
    { label: "Sat", score: null },
  ],
  reflectionHighlights: ["Mornings before the gym were the most focused blocks."],
  aiQuestion: "What would make Clean Kitchens App feel 'launched' to you?",
  reviewUrl: "https://thedailychase.com/weekly-review?week=2026-06-27",
};

writeFileSync("/tmp/weekly-email-preview.html", buildEmailHtml(data));
console.log("Wrote /tmp/weekly-email-preview.html");
