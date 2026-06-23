// "The Monthly Money Recap" — sent a few days into each month for the month just
// closed, to Chase + Sarah. Same bulletproof-email conventions as the other crons
// (600px outer table, all inline styles, web-safe fonts, no flex/grid).

export interface FinanceMonthlyEmailData {
  monthLabel: string; // e.g. "May 2026"
  intro: string; // short AI narrative (may contain newlines)
  income: string; // formatted, e.g. "$12,159"
  spend: string;
  net: string;
  savingsPct: string; // e.g. "21%" or "—"
  netPositive: boolean;
  spendDelta: string | null; // e.g. "+$1,300 vs Apr" or null
  topCategories: { label: string; amount: string; pct: number }[];
  largeTransactions: { date: string; description: string; amount: string }[];
  netWorth: string; // total
  netWorthDelta: string | null; // e.g. "+$4,900"
  bitcoin: string;
  ira: string;
  savings: string;
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
const TRACK = "#ece5d8";
const FONT = "Helvetica,Arial,sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

function catBar(label: string, amount: string, pct: number): string {
  const fill = Math.max(pct, 3);
  return `
  <tr><td style="padding:6px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font:600 13px ${FONT};color:${INK}">${escapeHtml(label)}</td>
        <td align="right" style="font:600 13px ${FONT};color:${MUTED}">${amount}</td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TRACK};border-radius:999px;margin-top:5px">
      <tr><td style="height:8px;width:${fill}%;background:${INDIGO};border-radius:999px;font-size:0;line-height:0">&nbsp;</td>
      ${fill < 100 ? `<td style="font-size:0;line-height:0">&nbsp;</td>` : ""}</tr>
    </table>
  </td></tr>`;
}

function txnRow(t: { date: string; description: string; amount: string }): string {
  return `<tr>
    <td style="font:400 12px ${FONT};color:${FAINT};padding:4px 0;white-space:nowrap">${escapeHtml(t.date)}</td>
    <td style="font:500 13px ${FONT};color:${INK};padding:4px 10px">${escapeHtml(t.description)}</td>
    <td align="right" style="font:700 13px ${FONT};color:${INK};padding:4px 0;white-space:nowrap">${t.amount}</td>
  </tr>`;
}

export function buildEmailHtml(d: FinanceMonthlyEmailData): string {
  const scoreboard = cardsRow([
    statCard(d.income, "Income", TEAL),
    statCard(d.spend, "Spend", CORAL),
    statCard(d.net, "Net saved", d.netPositive ? TEAL : CORAL),
  ]);

  const worthCards = cardsRow([
    statCard(d.bitcoin, "Bitcoin", INK),
    statCard(d.ira, "IRA", INK),
    statCard(d.savings, "Savings", INK),
  ]);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/><title>Monthly Money Recap</title></head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4dccc">

    <tr><td style="background:${SLATE};padding:30px 26px 26px">
      <div style="font:900 30px ${FONT};color:#ffffff;letter-spacing:-.6px;line-height:1.05">Monthly Money Recap</div>
      <div style="font:700 12px ${FONT};color:${TEAL};margin-top:9px;letter-spacing:1.5px">&#128176; ${escapeHtml(d.monthLabel.toUpperCase())}</div>
    </td></tr>
    <tr><td style="height:4px;background:${TEAL};font-size:0;line-height:0">&nbsp;</td></tr>

    <tr><td style="padding:24px 26px 4px">
      ${d.intro
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<p style="font:400 15px/1.6 ${FONT};color:${SLATE};margin:0 0 10px">${escapeHtml(l)}</p>`)
        .join("")}
    </td></tr>

    <tr><td style="padding:14px 26px 4px">${scoreboard}</td></tr>

    <tr><td style="padding:10px 26px 2px">
      <div style="font:600 13px ${FONT};color:${MUTED};text-align:center">
        Savings rate <strong style="color:${INDIGO}">${d.savingsPct}</strong>${d.spendDelta ? ` &middot; spend ${escapeHtml(d.spendDelta)}` : ""}
      </div>
    </td></tr>

    ${
      d.topCategories.length
        ? `<tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">WHERE IT WENT</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${d.topCategories.map((c) => catBar(c.label, c.amount, c.pct)).join("")}</table>
    </td></tr>`
        : ""
    }

    ${
      d.largeTransactions.length
        ? `<tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">BIGGEST CHARGES</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:10px;padding:6px 14px">${d.largeTransactions.map(txnRow).join("")}</table>
    </td></tr>`
        : ""
    }

    <tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">NET WORTH${d.netWorthDelta ? ` &middot; ${escapeHtml(d.netWorthDelta)} THIS MONTH` : ""}</div>
      <div style="font:800 26px ${FONT};color:${INK};margin-bottom:12px">${d.netWorth}</div>
      ${worthCards}
    </td></tr>

    <tr><td align="center" style="padding:24px 26px 6px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" style="background:${INDIGO};border-radius:12px">
          <a href="${d.appUrl}/finance" style="display:inline-block;font:800 15px ${FONT};color:#ffffff;text-decoration:none;padding:15px 34px;border-radius:12px">Open the finance tab &rarr;</a>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:18px 26px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="border-top:1px solid ${CARD_BORDER};padding-top:16px">
          <p style="font:400 12px/1.6 ${FONT};color:${FAINT};margin:0">Reflects whatever's been imported so far — upload last month's Capital One &amp; Chase exports to fill it in.</p>
        </td></tr>
      </table>
    </td></tr>

  </table>
  <div style="font:400 11px ${FONT};color:#ada28c;margin-top:14px">The Daily Chase &middot; Monthly money recap</div>
</td></tr>
</table>
</body></html>`;
}
