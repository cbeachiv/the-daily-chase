// "Weekly Money Pulse" — a short Sunday-evening check-in to Chase + Sarah on the
// week's spending so far. Compact single-card layout; same inline-style, table-
// based bulletproof conventions as the other crons.

export interface FinanceWeeklyEmailData {
  weekLabel: string; // e.g. "Week of Jun 16"
  spend: string; // week-to-date spend
  income: string; // week-to-date income
  txnCount: number;
  topCategories: { label: string; amount: string }[];
  largeTransactions: { date: string; description: string; amount: string }[];
  monthLabel: string; // e.g. "June"
  monthSpend: string; // month-to-date spend
  appUrl: string;
}

const PAGE = "#efe9dd";
const INK = "#16140f";
const SLATE = "#33312b";
const CARD_BG = "#faf8f4";
const CARD_BORDER = "#ece5d8";
const MUTED = "#6b7280";
const FAINT = "#9aa0a6";
const TEAL = "#0d9488";
const CORAL = "#e1574c";
const INDIGO = "#4f46e5";
const FONT = "Helvetica,Arial,sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statCard(value: string, label: string, accent: string): string {
  return `
  <td width="50%" align="center" valign="middle" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:12px;padding:16px 8px">
    <div style="font:800 24px ${FONT};color:${accent};line-height:1.15">${value}</div>
    <div style="font:700 10px ${FONT};color:${FAINT};text-transform:uppercase;letter-spacing:1px;margin-top:6px">${label}</div>
  </td>`;
}

export function buildEmailHtml(d: FinanceWeeklyEmailData): string {
  const cats = d.topCategories
    .map(
      (c) =>
        `<tr><td style="font:500 13px ${FONT};color:${INK};padding:3px 0">${escapeHtml(c.label)}</td><td align="right" style="font:600 13px ${FONT};color:${MUTED};padding:3px 0">${c.amount}</td></tr>`
    )
    .join("");

  const large = d.largeTransactions
    .map(
      (t) =>
        `<tr><td style="font:400 12px ${FONT};color:${FAINT};padding:3px 0;white-space:nowrap">${escapeHtml(t.date)}</td><td style="font:500 13px ${FONT};color:${INK};padding:3px 10px">${escapeHtml(t.description)}</td><td align="right" style="font:700 13px ${FONT};color:${INK};padding:3px 0;white-space:nowrap">${t.amount}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/><title>Weekly Money Pulse</title></head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4dccc">

    <tr><td style="background:${SLATE};padding:26px 26px 22px">
      <div style="font:900 26px ${FONT};color:#ffffff;letter-spacing:-.5px;line-height:1.05">Weekly Money Pulse</div>
      <div style="font:700 12px ${FONT};color:${TEAL};margin-top:8px;letter-spacing:1.5px">&#128178; ${escapeHtml(d.weekLabel.toUpperCase())}</div>
    </td></tr>
    <tr><td style="height:4px;background:${TEAL};font-size:0;line-height:0">&nbsp;</td></tr>

    <tr><td style="padding:20px 26px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${statCard(d.spend, "Spent this week", CORAL)}
        <td width="10" style="font-size:0;line-height:0">&nbsp;</td>
        ${statCard(d.income, "In this week", TEAL)}
      </tr></table>
    </td></tr>

    <tr><td style="padding:6px 26px 2px">
      <div style="font:600 13px ${FONT};color:${MUTED};text-align:center">${d.txnCount} transaction${d.txnCount === 1 ? "" : "s"} &middot; ${escapeHtml(d.monthLabel)} so far: <strong style="color:${INK}">${d.monthSpend}</strong></div>
    </td></tr>

    ${
      cats
        ? `<tr><td style="padding:22px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:8px">TOP CATEGORIES</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:10px;padding:8px 14px">${cats}</table>
    </td></tr>`
        : ""
    }

    ${
      large
        ? `<tr><td style="padding:18px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:8px">BIGGEST CHARGES</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:10px;padding:6px 14px">${large}</table>
    </td></tr>`
        : ""
    }

    <tr><td align="center" style="padding:22px 26px 6px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" style="background:${INDIGO};border-radius:12px">
          <a href="${d.appUrl}/finance" style="display:inline-block;font:800 14px ${FONT};color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:12px">See the details &rarr;</a>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:16px 26px 26px">
      <p style="font:400 12px/1.6 ${FONT};color:${FAINT};margin:0;border-top:1px solid ${CARD_BORDER};padding-top:14px">A quick gut-check on the week. Card charges import when you upload the monthly export — this covers what's flowed through so far.</p>
    </td></tr>

  </table>
  <div style="font:400 11px ${FONT};color:#ada28c;margin-top:14px">The Daily Chase &middot; Weekly money pulse</div>
</td></tr>
</table>
</body></html>`;
}
