// "Stay Hard" — the daily 4:15pm David Goggins gut-check email.
//
// Same bulletproof-email conventions as reps-and-repos/email.ts (600px-max outer
// <table>, all styling inline, web-safe fonts, no flex/grid) and a matching warm,
// light palette. No charts — this is a short accountability hit, not a recap.

export interface StayHardData {
  prettyDate: string; // e.g. "Monday, June 15"
  message: string; // Goggins' note (may contain newlines)
  trainedToday: boolean;
  caloriesSoFar: number | null; // null => nothing logged yet
  liftsLogged: number; // # lift sessions logged today
  dinner: string; // tonight's locked dinner
  goals: string[]; // the three standing goals
}

// --- palette (light/warm) --------------------------------------------------
const PAGE = "#efe9dd";
const INK = "#16140f";
const SLATE = "#33312b"; // header band — warm charcoal, not black
const CARD_BG = "#faf8f4";
const CARD_BORDER = "#ece5d8";
const MUTED = "#6b7280";
const FAINT = "#9aa0a6";
const AMBER = "#f59e0b";
const AMBER_DEEP = "#b45309";
const GO = "#047857";
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

export function buildEmailHtml(d: StayHardData): string {
  const scoreboard = cardsRow([
    statCard(d.trainedToday ? "YES" : "NO", "Trained today", d.trainedToday ? GO : AMBER_DEEP),
    statCard(d.caloriesSoFar == null ? "—" : d.caloriesSoFar.toLocaleString(), "Calories logged", INK),
    statCard(String(d.liftsLogged), d.liftsLogged === 1 ? "Lift logged" : "Lifts logged", INK),
  ]);

  const messageParas = d.message
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p style="font:400 15px/1.6 'Courier New',Courier,monospace;color:#2a2620;margin:0 0 11px">${l}</p>`)
    .join("");

  const goalItems = d.goals
    .map(
      (g) =>
        `<tr><td style="font:600 13px/1.5 ${FONT};color:${MUTED};padding:5px 0"><span style="color:${AMBER_DEEP};font-weight:800;margin-right:9px">&#9632;</span>${g}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<title>Stay Hard</title></head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4dccc">

    <!-- HEADER -->
    <tr><td style="background:${SLATE};padding:30px 26px 26px">
      <div style="font:900 30px ${FONT};color:#ffffff;letter-spacing:-.6px;line-height:1.05">Stay Hard</div>
      <div style="font:700 12px ${FONT};color:${AMBER};margin-top:9px;letter-spacing:1.5px">&#9889; 4:15PM GUT CHECK &middot; THE DANGER ZONE</div>
      <div style="font:400 12px ${FONT};color:#c9c3b6;margin-top:4px">${d.prettyDate}</div>
    </td></tr>

    <!-- amber rule -->
    <tr><td style="height:4px;background:${AMBER};font-size:0;line-height:0">&nbsp;</td></tr>

    <!-- SCOREBOARD -->
    <tr><td style="padding:24px 26px 4px">
      ${scoreboard}
    </td></tr>

    <!-- GOGGINS MESSAGE -->
    <tr><td style="padding:22px 26px 2px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:#fbf9f5;border:1px solid ${CARD_BORDER};border-left:4px solid ${AMBER};border-radius:10px;padding:18px 20px">
          ${messageParas}
        </td></tr>
      </table>
    </td></tr>

    <!-- DINNER IS DECIDED -->
    <tr><td style="padding:18px 26px 2px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:#eefaf3;border:1px solid #cdeadb;border-radius:10px;padding:16px 20px">
          <div style="font:800 11px ${FONT};color:${GO};letter-spacing:1.5px;margin-bottom:8px">&#10003; TONIGHT'S PLAN IS ALREADY DECIDED</div>
          <div style="font:600 15px/1.5 ${FONT};color:${INK}">${d.dinner}</div>
          <div style="font:400 12px ${FONT};color:${MUTED};margin-top:6px">No negotiation. The hunger is the test, not the trigger.</div>
        </td></tr>
      </table>
    </td></tr>

    <!-- GOALS -->
    <tr><td style="padding:24px 26px 8px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:8px">THE NON-NEGOTIABLES</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${goalItems}</table>
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="padding:18px 26px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="border-top:1px solid ${CARD_BORDER};padding-top:16px">
          <p style="font:400 12px/1.6 ${FONT};color:${FAINT};margin:0">
            You against you. Nobody's coming to save you &mdash; that's the good news.<br/>
            Stay hard. &#9889;
          </p>
        </td></tr>
      </table>
    </td></tr>

  </table>

  <div style="font:400 11px ${FONT};color:#ada28c;margin-top:14px">The Daily Chase &middot; daily 4:15pm accountability</div>

</td></tr>
</table>
</body></html>`;
}
