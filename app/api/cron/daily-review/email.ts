// "The Daily Review" — the 4:30pm end-of-day recap + reflection nudge email.
//
// Same bulletproof-email conventions as stay-hard/email.ts (600px-max outer
// <table>, all styling inline, web-safe fonts, no flex/grid) and the matching
// warm, light palette. The body is a focused summary (tasks done, still open,
// weekly/monthly goal progress) ending in a big button to the /review page.

export interface ReviewEmailData {
  prettyDate: string; // e.g. "Monday, June 15"
  completedTasks: string[]; // titles of to-dos finished today
  openTasks: string[]; // titles of still-open to-dos
  weekGoalsDone: number;
  weekGoalsTotal: number;
  monthGoalsDone: number;
  monthGoalsTotal: number;
  aiQuestion: string; // the tailored follow-up to preview
  reviewUrl: string; // deep link to /review?date=YYYY-MM-DD
}

// --- palette (light/warm) — shared with stay-hard/reps-and-repos -----------
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
const TRACK = "#ece5d8";
const FONT = "Helvetica,Arial,sans-serif";

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

// A simple inline progress bar (table-based so it renders everywhere).
function progressBar(done: number, total: number, accent: string): string {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill = total > 0 ? Math.max(pct, 6) : 0; // keep a sliver visible when >0
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TRACK};border-radius:999px;margin-top:7px">
    <tr><td style="height:8px;${fill > 0 ? `width:${fill}%;` : ""}background:${fill > 0 ? accent : TRACK};border-radius:999px;font-size:0;line-height:0">&nbsp;</td>${
      fill < 100 ? `<td style="font-size:0;line-height:0">&nbsp;</td>` : ""
    }</tr>
  </table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildEmailHtml(d: ReviewEmailData): string {
  const taskCount = d.completedTasks.length;

  const scoreboard = cardsRow([
    statCard(String(taskCount), taskCount === 1 ? "To-do done" : "To-dos done", taskCount > 0 ? GO : MUTED),
    statCard(`${d.weekGoalsDone}/${d.weekGoalsTotal}`, "Week goals", INK),
    statCard(`${d.monthGoalsDone}/${d.monthGoalsTotal}`, "Month goals", INK),
  ]);

  const winsBlock = taskCount
    ? d.completedTasks
        .map(
          (t) =>
            `<tr><td style="font:500 14px/1.5 ${FONT};color:${INK};padding:5px 0"><span style="color:${GO};font-weight:800;margin-right:10px">&#10003;</span>${escapeHtml(t)}</td></tr>`,
        )
        .join("")
    : `<tr><td style="font:400 14px/1.5 ${FONT};color:${MUTED};padding:4px 0">Nothing checked off yet — there's still time before the day's done.</td></tr>`;

  const OPEN_CAP = 5;
  const openShown = d.openTasks.slice(0, OPEN_CAP);
  const openExtra = d.openTasks.length - openShown.length;
  const openBlock = d.openTasks.length
    ? openShown
        .map(
          (t) =>
            `<tr><td style="font:400 14px/1.5 ${FONT};color:${MUTED};padding:5px 0"><span style="color:${FAINT};font-weight:800;margin-right:10px">&#9675;</span>${escapeHtml(t)}</td></tr>`,
        )
        .join("") +
      (openExtra > 0
        ? `<tr><td style="font:600 12px ${FONT};color:${FAINT};padding:6px 0 0 26px">+${openExtra} more open</td></tr>`
        : "")
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<title>The Daily Review</title></head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4dccc">

    <!-- HEADER -->
    <tr><td style="background:${SLATE};padding:30px 26px 26px">
      <div style="font:900 30px ${FONT};color:#ffffff;letter-spacing:-.6px;line-height:1.05">The Daily Review</div>
      <div style="font:700 12px ${FONT};color:${AMBER};margin-top:9px;letter-spacing:1.5px">&#127777; 4:30PM &middot; HOW DID TODAY GO?</div>
      <div style="font:400 12px ${FONT};color:#c9c3b6;margin-top:4px">${d.prettyDate}</div>
    </td></tr>

    <!-- indigo rule -->
    <tr><td style="height:4px;background:${INDIGO};font-size:0;line-height:0">&nbsp;</td></tr>

    <!-- SCOREBOARD -->
    <tr><td style="padding:24px 26px 4px">
      ${scoreboard}
    </td></tr>

    <!-- TODAY'S WINS -->
    <tr><td style="padding:22px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:8px">TODAY'S WINS</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${winsBlock}</table>
    </td></tr>

    ${
      openBlock
        ? `<!-- STILL OPEN -->
    <tr><td style="padding:18px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:8px">STILL OPEN</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${openBlock}</table>
    </td></tr>`
        : ""
    }

    <!-- GOALS PROGRESS -->
    <tr><td style="padding:22px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">GOALS PROGRESS</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:10px;padding:14px 16px">
          <div style="font:600 13px ${FONT};color:${INK}">This week &mdash; ${d.weekGoalsDone}/${d.weekGoalsTotal} done</div>
          ${progressBar(d.weekGoalsDone, d.weekGoalsTotal, INDIGO)}
          <div style="font:600 13px ${FONT};color:${INK};margin-top:14px">This month &mdash; ${d.monthGoalsDone}/${d.monthGoalsTotal} done</div>
          ${progressBar(d.monthGoalsDone, d.monthGoalsTotal, GO)}
        </td></tr>
      </table>
    </td></tr>

    <!-- REFLECT -->
    <tr><td style="padding:24px 26px 2px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:#f4f3ff;border:1px solid #ddd9fb;border-left:4px solid ${INDIGO};border-radius:10px;padding:18px 20px">
          <div style="font:800 11px ${FONT};color:${INDIGO};letter-spacing:1.5px;margin-bottom:10px">2 MINUTES TO CLOSE THE DAY</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font:500 14px/1.5 ${FONT};color:#2a2620;padding:3px 0"><span style="color:${INDIGO};margin-right:8px">&bull;</span>Was today productive?</td></tr>
            <tr><td style="font:500 14px/1.5 ${FONT};color:#2a2620;padding:3px 0"><span style="color:${INDIGO};margin-right:8px">&bull;</span>What made it productive (or not)?</td></tr>
            <tr><td style="font:500 14px/1.5 ${FONT};color:#2a2620;padding:3px 0"><span style="color:${INDIGO};margin-right:8px">&bull;</span>What did you learn today?</td></tr>
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
          <a href="${d.reviewUrl}" style="display:inline-block;font:800 15px ${FONT};color:#ffffff;text-decoration:none;padding:15px 34px;border-radius:12px">Reflect on today &rarr;</a>
        </td>
      </tr></table>
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="padding:18px 26px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="border-top:1px solid ${CARD_BORDER};padding-top:16px">
          <p style="font:400 12px/1.6 ${FONT};color:${FAINT};margin:0">
            A couple honest minutes now compounds. Every answer teaches me a little more about how you work.
          </p>
        </td></tr>
      </table>
    </td></tr>

  </table>

  <div style="font:400 11px ${FONT};color:#ada28c;margin-top:14px">The Daily Chase &middot; daily 4:30pm review</div>

</td></tr>
</table>
</body></html>`;
}
