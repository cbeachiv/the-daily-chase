// "The Weekly Review" — the Saturday 5am recap + written-reflection nudge email.
//
// Same bulletproof-email conventions as daily-review/email.ts (600px-max outer
// <table>, all styling inline, web-safe fonts, no flex/grid) and the matching
// warm, light palette. Graphics are QuickChart.io PNGs (email clients block JS).
// The body recaps the week — what got done (Hugga vs Personal), goal progress,
// training, mood, and a digest of the week's daily reflections — then ends in a
// big button to the /weekly-review page to write the weekly reflection.

export interface WeeklyEmailData {
  weekEnding: string; // pretty, e.g. "June 20, 2026"
  intro: string; // short AI recap (may contain newlines)
  // tasks, split by Claude
  huggaTasks: string[];
  personalTasks: string[];
  // goals
  weekGoals: { title: string; done: boolean }[];
  monthGoals: { title: string; done: boolean }[];
  weekGoalsDone: number;
  weekGoalsTotal: number;
  monthGoalsDone: number;
  monthGoalsTotal: number;
  // active projects (priority order) with milestone progress + to-dos done this week
  projects: {
    name: string;
    category: "hugga" | "personal";
    milestoneDone: number;
    milestoneTotal: number;
    todosThisWeek: number;
  }[];
  // 5am club (weekday-only) + total workout count
  wakeups5am: number; // weekday 5am wake-ups this week, out of 5 possible
  wakeupStreak: number; // current weekday-only 5am streak (days)
  workouts: number; // lifts + cardio sessions this week
  // training & body
  lifts: number;
  liftVolume: string; // e.g. "62,555 lb" or "no data"
  liftPRs: number;
  cardioSessions: number;
  cardioMinutes: number;
  cardioMiles: string; // e.g. "4.5 mi" or "no data"
  weightChange: string; // e.g. "-1.7 lb" or "no data"
  // mood
  avgMood: string; // e.g. "8.5" or "no data"
  avgEnergy: string; // e.g. "8.3" or "no data"
  // daily-reflection digest
  daysReflected: number;
  productiveDays: number;
  avgScore: number | null; // 1–5
  dayScores: { label: string; score: number | null }[]; // per-day productivity for the chart
  reflectionHighlights: string[]; // 1–2 lines Claude surfaced from the dailies
  // the tailored weekly follow-up + CTA
  aiQuestion: string;
  reviewUrl: string;
}

// --- palette (light/warm) — shared with daily-review/stay-hard --------------
const PAGE = "#efe9dd";
const INK = "#16140f";
const SLATE = "#33312b";
const CARD_BG = "#faf8f4";
const CARD_BORDER = "#ece5d8";
const MUTED = "#6b7280";
const FAINT = "#9aa0a6";
const AMBER = "#f59e0b";
const INDIGO = "#4f46e5";
const GO = "#047857";
const TEAL = "#0d9488";
const TRACK = "#ece5d8";
const FONT = "Helvetica,Arial,sans-serif";
const CHART_FONT = "Helvetica, Arial, sans-serif";

// --- QuickChart -------------------------------------------------------------
function quickChart(config: object, w: number, h: number): string {
  return `https://quickchart.io/chart?bkg=white&w=${w}&h=${h}&c=${encodeURIComponent(JSON.stringify(config))}`;
}

// Hugga vs Personal completed-task counts as a horizontal bar.
function taskSplitChartUrl(hugga: number, personal: number): string | null {
  if (hugga + personal === 0) return null;
  return quickChart(
    {
      type: "horizontalBar",
      data: {
        labels: ["Hugga", "Personal"],
        datasets: [{ data: [hugga, personal], backgroundColor: [INDIGO, TEAL], borderWidth: 0 }],
      },
      options: {
        legend: { display: false },
        title: { display: true, text: "To-dos done by area", fontFamily: CHART_FONT, fontSize: 15, fontColor: INK },
        scales: {
          xAxes: [{ ticks: { beginAtZero: true, precision: 0, fontFamily: CHART_FONT, fontColor: MUTED }, gridLines: { color: "#f0f0f0" } }],
          yAxes: [{ ticks: { fontFamily: CHART_FONT, fontColor: INK, fontStyle: "bold" }, gridLines: { display: false } }],
        },
        plugins: { datalabels: { display: false } },
      },
    },
    552,
    150,
  );
}

// Daily productivity scores (1–5) across the week as a small bar chart.
function scoreChartUrl(days: WeeklyEmailData["dayScores"]): string | null {
  if (!days.some((d) => d.score !== null)) return null;
  return quickChart(
    {
      type: "bar",
      data: {
        labels: days.map((d) => d.label),
        datasets: [
          {
            data: days.map((d) => d.score ?? 0),
            backgroundColor: days.map((d) => (d.score === null ? "#e6ddcc" : INDIGO)),
            borderWidth: 0,
          },
        ],
      },
      options: {
        legend: { display: false },
        title: { display: true, text: "Daily productivity (1–5)", fontFamily: CHART_FONT, fontSize: 15, fontColor: INK },
        scales: {
          xAxes: [{ ticks: { fontFamily: CHART_FONT, fontColor: MUTED }, gridLines: { display: false } }],
          yAxes: [{ ticks: { beginAtZero: true, max: 5, stepSize: 1, fontFamily: CHART_FONT, fontColor: MUTED }, gridLines: { color: "#f0f0f0" } }],
        },
        plugins: { datalabels: { display: false } },
      },
    },
    552,
    200,
  );
}

// --- pieces -----------------------------------------------------------------
function statCard(value: string, label: string, accent: string): string {
  const len = value.length;
  const fs = len > 9 ? 18 : len > 6 ? 22 : 26;
  return `
  <td width="33%" align="center" valign="middle" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:12px;padding:16px 8px">
    <div style="font:800 ${fs}px ${FONT};color:${accent};line-height:1.15">${value}</div>
    <div style="font:700 10px ${FONT};color:${FAINT};text-transform:uppercase;letter-spacing:1px;margin-top:6px">${label}</div>
  </td>`;
}

function cardsRow(cards: string[]): string {
  const spacer = `<td width="10" style="font-size:0;line-height:0">&nbsp;</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cards.join(spacer)}</tr></table>`;
}

function progressBar(done: number, total: number, accent: string): string {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill = total > 0 ? Math.max(pct, 6) : 0;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TRACK};border-radius:999px;margin-top:7px">
    <tr><td style="height:8px;${fill > 0 ? `width:${fill}%;` : ""}background:${fill > 0 ? accent : TRACK};border-radius:999px;font-size:0;line-height:0">&nbsp;</td>${
      fill < 100 ? `<td style="font-size:0;line-height:0">&nbsp;</td>` : ""
    }</tr>
  </table>`;
}

function chartImg(url: string | null, alt: string): string {
  if (!url) return "";
  return `<img src="${url}" width="552" alt="${alt}" style="display:block;width:100%;max-width:552px;height:auto;margin:14px auto 0;border:1px solid ${CARD_BORDER};border-radius:12px"/>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A labeled list of task titles (checked), or nothing if empty.
function taskList(titles: string[]): string {
  if (titles.length === 0) {
    return `<tr><td style="font:400 13px/1.5 ${FONT};color:${FAINT};padding:3px 0">— nothing here this week —</td></tr>`;
  }
  return titles
    .map(
      (t) =>
        `<tr><td style="font:500 14px/1.5 ${FONT};color:${INK};padding:4px 0"><span style="color:${GO};font-weight:800;margin-right:9px">&#10003;</span>${escapeHtml(t)}</td></tr>`,
    )
    .join("");
}

function goalList(goals: { title: string; done: boolean }[]): string {
  if (goals.length === 0) return "";
  return goals
    .map(
      (g) =>
        `<tr><td style="font:500 13px/1.5 ${FONT};color:${g.done ? INK : MUTED};padding:3px 0"><span style="color:${g.done ? GO : FAINT};font-weight:800;margin-right:9px">${g.done ? "&#10003;" : "&#9675;"}</span>${escapeHtml(g.title)}</td></tr>`,
    )
    .join("");
}

// Active projects as stacked rows: name + area tag, milestone progress bar, and
// a green "+N to-dos this week" movement note when any were completed.
function projectList(projects: WeeklyEmailData["projects"]): string {
  return projects
    .map((p, i) => {
      const tagColor = p.category === "hugga" ? INDIGO : TEAL;
      const tag = p.category === "hugga" ? "Hugga" : "Personal";
      const accent = p.category === "hugga" ? INDIGO : TEAL;
      const ms =
        p.milestoneTotal > 0 ? `${p.milestoneDone}/${p.milestoneTotal} milestones` : "no milestones yet";
      const movement =
        p.todosThisWeek > 0
          ? `<span style="font:700 12px ${FONT};color:${GO};margin-left:8px">+${p.todosThisWeek} to-do${p.todosThisWeek === 1 ? "" : "s"} this week</span>`
          : "";
      return `<div style="margin-top:${i === 0 ? 0 : 14}px">
        <div style="font:600 14px ${FONT};color:${INK}">${escapeHtml(p.name)}<span style="font:700 10px ${FONT};color:${tagColor};text-transform:uppercase;letter-spacing:.5px;margin-left:8px">${tag}</span></div>
        <div style="font:400 12px ${FONT};color:${MUTED};margin-top:2px">${ms}${movement}</div>
        ${progressBar(p.milestoneDone, p.milestoneTotal, accent)}
      </div>`;
    })
    .join("");
}

const WEEKLY_PROMPTS = [
  "How did this week go?",
  "How are you feeling about your goals — this week and this month?",
  "Training — how do you think your lifts & cardio went?",
  "Mood & energy — how were you actually feeling?",
  "Are you giving Sarah and Annie your full attention?",
  "Anything you noticed with Annie this week?",
  "Parents & friends — who do you want to reach out to?",
];

export function buildEmailHtml(d: WeeklyEmailData): string {
  const taskCount = d.huggaTasks.length + d.personalTasks.length;

  const scoreboard = cardsRow([
    statCard(String(taskCount), taskCount === 1 ? "To-do done" : "To-dos done", taskCount > 0 ? GO : MUTED),
    statCard(`${d.weekGoalsDone}/${d.weekGoalsTotal}`, "Week goals", INK),
    statCard(`${d.monthGoalsDone}/${d.monthGoalsTotal}`, "Month goals", INK),
  ]);

  const fiveAmCards = cardsRow([
    statCard(`${d.wakeups5am}/5`, "5am wake-ups", d.wakeups5am ? GO : MUTED),
    statCard(String(d.lifts), d.lifts === 1 ? "Lift" : "Lifts", d.lifts ? INK : MUTED),
    statCard(String(d.cardioSessions), "Cardio", d.cardioSessions ? INK : MUTED),
  ]);

  const trainingCards = cardsRow([
    statCard(d.lifts ? `${d.lifts}${d.liftPRs ? ` · ${d.liftPRs}PR` : ""}` : "0", "Lifts", d.lifts ? INK : MUTED),
    statCard(
      d.cardioSessions ? `${d.cardioSessions} · ${d.cardioMinutes}m` : "0",
      "Cardio",
      d.cardioSessions ? INK : MUTED,
    ),
    statCard(d.weightChange, "Weight Δ", d.weightChange === "no data" ? MUTED : INK),
  ]);

  const hasMood = d.avgMood !== "no data" || d.avgEnergy !== "no data";
  const moodCards = cardsRow([
    statCard(d.avgMood === "no data" ? "—" : `${d.avgMood}`, "Avg mood", d.avgMood === "no data" ? MUTED : AMBER),
    statCard(d.avgEnergy === "no data" ? "—" : `${d.avgEnergy}`, "Avg energy", d.avgEnergy === "no data" ? MUTED : AMBER),
    statCard(
      d.liftVolume === "no data" ? "—" : d.liftVolume.replace(" lb", ""),
      "Volume lb",
      d.liftVolume === "no data" ? MUTED : INK,
    ),
  ]);

  const highlightsBlock = d.reflectionHighlights.length
    ? d.reflectionHighlights
        .map(
          (h) =>
            `<tr><td style="font:400 13px/1.55 ${FONT};color:${SLATE};padding:4px 0"><span style="color:${AMBER};margin-right:8px">&#10022;</span>${escapeHtml(h)}</td></tr>`,
        )
        .join("")
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<title>The Weekly Review</title></head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4dccc">

    <!-- HEADER -->
    <tr><td style="background:${SLATE};padding:30px 26px 26px">
      <div style="font:900 30px ${FONT};color:#ffffff;letter-spacing:-.6px;line-height:1.05">The Weekly Review</div>
      <div style="font:700 12px ${FONT};color:${AMBER};margin-top:9px;letter-spacing:1.5px">&#128197; SATURDAY &middot; YOUR WEEK IN REVIEW</div>
      <div style="font:400 12px ${FONT};color:#c9c3b6;margin-top:4px">Week ending ${d.weekEnding}</div>
    </td></tr>

    <!-- indigo rule -->
    <tr><td style="height:4px;background:${INDIGO};font-size:0;line-height:0">&nbsp;</td></tr>

    <!-- INTRO -->
    <tr><td style="padding:24px 26px 4px">
      ${d.intro
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<p style="font:400 15px/1.6 ${FONT};color:${SLATE};margin:0 0 10px">${escapeHtml(l)}</p>`)
        .join("")}
    </td></tr>

    <!-- SCOREBOARD -->
    <tr><td style="padding:14px 26px 4px">
      ${scoreboard}
    </td></tr>

    <!-- WHAT YOU GOT DONE -->
    <tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">WHAT YOU GOT DONE</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font:800 13px ${FONT};color:${INDIGO};padding:2px 0 4px">&#129521; Hugga</td></tr>
        ${taskList(d.huggaTasks)}
        <tr><td style="font:800 13px ${FONT};color:${TEAL};padding:14px 0 4px">&#127969; Personal</td></tr>
        ${taskList(d.personalTasks)}
      </table>
      ${chartImg(taskSplitChartUrl(d.huggaTasks.length, d.personalTasks.length), "To-dos done by area")}
    </td></tr>

    <!-- GOALS -->
    <tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">GOALS PROGRESS</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:10px;padding:14px 16px">
          <div style="font:600 13px ${FONT};color:${INK}">This week &mdash; ${d.weekGoalsDone}/${d.weekGoalsTotal} done</div>
          ${progressBar(d.weekGoalsDone, d.weekGoalsTotal, INDIGO)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${goalList(d.weekGoals)}</table>
          <div style="font:600 13px ${FONT};color:${INK};margin-top:14px">This month &mdash; ${d.monthGoalsDone}/${d.monthGoalsTotal} done</div>
          ${progressBar(d.monthGoalsDone, d.monthGoalsTotal, GO)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${goalList(d.monthGoals)}</table>
        </td></tr>
      </table>
    </td></tr>

    ${
      d.projects.length
        ? `<!-- PROJECTS -->
    <tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">PROJECTS</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:10px;padding:14px 16px">
          ${projectList(d.projects)}
        </td></tr>
      </table>
    </td></tr>`
        : ""
    }

    <!-- 5AM CLUB -->
    <tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">5AM CLUB &amp; MOVEMENT</div>
      ${fiveAmCards}
      <div style="font:400 12px/1.5 ${FONT};color:${MUTED};margin-top:10px">
        5am tracked Mon&ndash;Fri only${d.wakeupStreak > 0 ? ` &middot; current weekday streak: ${d.wakeupStreak} day${d.wakeupStreak === 1 ? "" : "s"}` : ""}. Workouts = ${d.lifts} lift${d.lifts === 1 ? "" : "s"} + ${d.cardioSessions} cardio.
      </div>
    </td></tr>

    <!-- TRAINING & BODY -->
    <tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">TRAINING &amp; BODY</div>
      ${trainingCards}
    </td></tr>

    ${
      hasMood
        ? `<!-- HOW YOU FELT -->
    <tr><td style="padding:14px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">HOW YOU FELT</div>
      ${moodCards}
    </td></tr>`
        : ""
    }

    <!-- WEEK IN REFLECTIONS -->
    <tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">YOUR WEEK IN REFLECTIONS</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:10px;padding:14px 16px">
          <div style="font:600 13px ${FONT};color:${INK}">
            ${d.daysReflected}/7 days reflected &middot; ${d.productiveDays} productive${d.avgScore !== null ? ` &middot; avg ${d.avgScore}/5` : ""}
          </div>
          ${highlightsBlock ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${highlightsBlock}</table>` : ""}
          ${chartImg(scoreChartUrl(d.dayScores), "Daily productivity this week")}
        </td></tr>
      </table>
    </td></tr>

    <!-- NOW REFLECT -->
    <tr><td style="padding:24px 26px 2px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:#f4f3ff;border:1px solid #ddd9fb;border-left:4px solid ${INDIGO};border-radius:10px;padding:18px 20px">
          <div style="font:800 11px ${FONT};color:${INDIGO};letter-spacing:1.5px;margin-bottom:10px">NOW REFLECT &mdash; WRITE IT DOWN</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${WEEKLY_PROMPTS.map(
              (p) =>
                `<tr><td style="font:500 14px/1.5 ${FONT};color:#2a2620;padding:3px 0"><span style="color:${INDIGO};margin-right:8px">&bull;</span>${escapeHtml(p)}</td></tr>`,
            ).join("")}
            ${
              d.aiQuestion
                ? `<tr><td style="font:500 14px/1.5 ${FONT};color:#2a2620;padding:3px 0"><span style="color:${AMBER};margin-right:8px">&#10022;</span>${escapeHtml(d.aiQuestion)}</td></tr>`
                : ""
            }
          </table>
        </td></tr>
      </table>
    </td></tr>

    <!-- CTA BUTTON -->
    <tr><td align="center" style="padding:20px 26px 6px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" style="background:${INDIGO};border-radius:12px">
          <a href="${d.reviewUrl}" style="display:inline-block;font:800 15px ${FONT};color:#ffffff;text-decoration:none;padding:15px 34px;border-radius:12px">Reflect on your week &rarr;</a>
        </td>
      </tr></table>
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="padding:18px 26px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="border-top:1px solid ${CARD_BORDER};padding-top:16px">
          <p style="font:400 12px/1.6 ${FONT};color:${FAINT};margin:0">
            Review the week, then write. The point isn't the stats — it's what you notice when you sit with them.
          </p>
        </td></tr>
      </table>
    </td></tr>

  </table>

  <div style="font:400 11px ${FONT};color:#ada28c;margin-top:14px">The Daily Chase &middot; Saturday 5am weekly review</div>

</td></tr>
</table>
</body></html>`;
}
