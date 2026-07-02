// "The Monthly Money Recap" — written by Daniela Reyes, the household's financial
// advisor. Sent at the start of each month for the month just closed: first as a
// DRAFT to Chase (with an "Approve & send to Sarah" button), then — once approved —
// as the FINAL to Chase + Sarah. Same bulletproof-email conventions as the other
// crons (600px outer table, all inline styles, web-safe fonts, no flex/grid).

export const ADVISOR_NAME = "Daniela Reyes";

export interface FinanceMonthlyEmailData {
  mode: "draft" | "final"; // draft = preview to Chase only; final = sent to both
  approveUrl?: string; // draft only: link that sends the final to Sarah
  monthLabel: string; // e.g. "May 2026"
  intro: string; // short AI narrative (may contain newlines)
  income: string; // formatted, e.g. "$12,159"
  spend: string;
  net: string;
  incomeMxn: string; // peso equivalents, e.g. "≈ $208,900 MXN"
  spendMxn: string;
  netMxn: string;
  savingsPct: string; // e.g. "21%" or "—"
  savingsGoalPct: number; // the target, 50
  savingsBarPct: number; // 0–100 fill toward the goal (rate / goal, capped)
  savingsGoalNote: string; // e.g. "28 pts to your 50% goal" or "Goal hit 🎉"
  goalReached: boolean;
  avgSavings6mo: string; // rolling 6-month average savings rate, e.g. "34%" or "—"
  avgSavings6moCount: number; // how many of the last 6 months had income
  netPositive: boolean;
  spendDelta: string | null; // e.g. "+$1,300 vs Apr" or null
  incomeSources: { label: string; amount: string; amountMxn: string }[]; // where money came in
  topCategories: { label: string; amount: string; pct: number }[];
  ytdAverages: { label: string; amount: string; amountMxn: string }[]; // avg/month this year
  ytdYear: string; // e.g. "2026"
  largeTransactions: { date: string; description: string; amount: string }[];
  netWorth: string; // total
  netWorthMxn: string;
  netWorthDelta: string | null; // e.g. "+$4,900"
  bitcoin: string;
  ira: string;
  savings: string;
  hugga: string;
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
const GREEN = "#15803d";
const AMBER = "#b45309";
const TRACK = "#ece5d8";
const FONT = "Helvetica,Arial,sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statCard(value: string, label: string, accent: string, width = "33%"): string {
  const len = value.length;
  const fs = len > 9 ? 18 : len > 6 ? 22 : 26;
  return `
  <td width="${width}" align="center" valign="middle" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:12px;padding:16px 8px">
    <div style="font:800 ${fs}px ${FONT};color:${accent};line-height:1.15">${value}</div>
    <div style="font:700 10px ${FONT};color:${FAINT};text-transform:uppercase;letter-spacing:1px;margin-top:6px">${label}</div>
  </td>`;
}

function cardsRow(cards: string[]): string {
  const spacer = `<td width="10" style="font-size:0;line-height:0">&nbsp;</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cards.join(spacer)}</tr></table>`;
}

// Muted peso line aligned under the three scoreboard cards.
function mxnRow(values: string[]): string {
  const spacer = `<td width="10" style="font-size:0;line-height:0">&nbsp;</td>`;
  const cells = values
    .map(
      (v) =>
        `<td width="33%" align="center" style="font:600 11px ${FONT};color:${FAINT};padding:5px 2px 0">${escapeHtml(v)}</td>`
    )
    .join(spacer);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

// Row in the YTD-averages table: category, avg/month USD, and peso equivalent.
function avgRow(label: string, amount: string, amountMxn: string): string {
  return `<tr>
    <td style="font:600 13px ${FONT};color:${INK};padding:5px 0">${escapeHtml(label)}</td>
    <td align="right" style="font:700 13px ${FONT};color:${INK};padding:5px 0;white-space:nowrap">${amount}</td>
    <td align="right" style="font:600 11px ${FONT};color:${FAINT};padding:5px 0 5px 12px;white-space:nowrap">${escapeHtml(amountMxn)}</td>
  </tr>`;
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
  const scoreboardMxn = mxnRow([d.incomeMxn, d.spendMxn, d.netMxn]);

  // Four holdings in a 2x2 grid (Bitcoin, IRA, Savings, Hugga).
  const worthCards =
    cardsRow([statCard(d.bitcoin, "Bitcoin", INK, "50%"), statCard(d.ira, "IRA", INK, "50%")]) +
    `<div style="line-height:10px;font-size:0">&nbsp;</div>` +
    cardsRow([statCard(d.savings, "Savings", INK, "50%"), statCard(d.hugga, "Hugga", INK, "50%")]);

  // Draft-only banner + approve button.
  const draftBanner =
    d.mode === "draft"
      ? `<tr><td style="padding:0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-bottom:1px solid #fed7aa">
        <tr><td style="padding:13px 26px;font:700 13px ${FONT};color:${AMBER}">
          &#9998; PREVIEW. Sarah hasn&rsquo;t received this yet. Review the numbers below, then approve to send it to you both.
        </td></tr>
      </table>
    </td></tr>`
      : "";

  const approveButton =
    d.mode === "draft" && d.approveUrl
      ? `<tr><td style="padding:6px 26px 2px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:12px">
        <tr><td align="center" style="padding:20px 18px">
          <div style="font:700 13px ${FONT};color:${SLATE};margin-bottom:14px">Numbers look right? Send the recap to Sarah.</div>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td align="center" style="background:${GREEN};border-radius:12px">
              <a href="${d.approveUrl}" style="display:inline-block;font:800 15px ${FONT};color:#ffffff;text-decoration:none;padding:15px 34px;border-radius:12px">Approve &amp; send to Sarah &rarr;</a>
            </td>
          </tr></table>
          <div style="font:400 11px/1.5 ${FONT};color:${FAINT};margin-top:13px">Something off? Upload last month&rsquo;s Capital One &amp; Chase exports in the finance tab, then click approve. It recomputes fresh before sending.</div>
        </td></tr>
      </table>
    </td></tr>`
      : "";

  const goalColor = d.goalReached ? GREEN : INDIGO;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/><title>Monthly Money Recap</title></head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4dccc">

    ${draftBanner}

    <tr><td style="background:${SLATE};padding:30px 26px 26px">
      <div style="font:900 30px ${FONT};color:#ffffff;letter-spacing:-.6px;line-height:1.05">Monthly Money Recap</div>
      <div style="font:700 12px ${FONT};color:${TEAL};margin-top:9px;letter-spacing:1.5px">&#128176; ${escapeHtml(d.monthLabel.toUpperCase())}</div>
      <div style="font:500 12px ${FONT};color:#c8c3b8;margin-top:8px">From ${escapeHtml(ADVISOR_NAME)}, your financial advisor</div>
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

    <tr><td style="padding:14px 26px 0">${scoreboard}</td></tr>
    <tr><td style="padding:0 26px 4px">${scoreboardMxn}</td></tr>

    <tr><td style="padding:18px 26px 2px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font:700 13px ${FONT};color:${SLATE}">Savings rate <strong style="color:${goalColor}">${d.savingsPct}</strong> <span style="color:${FAINT};font-weight:400">of ${d.savingsGoalPct}% goal</span></td>
          <td align="right" style="font:600 12px ${FONT};color:${d.goalReached ? GREEN : MUTED}">${escapeHtml(d.savingsGoalNote)}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TRACK};border-radius:999px;margin-top:7px">
        <tr><td style="height:10px;width:${Math.max(d.savingsBarPct, 2)}%;background:${goalColor};border-radius:999px;font-size:0;line-height:0">&nbsp;</td>
        ${d.savingsBarPct < 100 ? `<td style="font-size:0;line-height:0">&nbsp;</td>` : ""}</tr>
      </table>
      <div style="font:600 12px ${FONT};color:${MUTED};text-align:center;margin-top:10px">
        Six-month average savings rate <strong style="color:${INDIGO}">${d.avgSavings6mo}</strong>${d.spendDelta ? ` &middot; spend ${escapeHtml(d.spendDelta)}` : ""}
      </div>
    </td></tr>

    ${
      d.incomeSources.length
        ? `<tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:4px">WHERE IT CAME FROM</div>
      <div style="font:400 11px ${FONT};color:${FAINT};margin-bottom:10px">The income that landed this month.</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:10px;padding:8px 14px">${d.incomeSources.map((s) => avgRow(s.label, s.amount, s.amountMxn)).join("")}</table>
    </td></tr>`
        : ""
    }

    ${
      d.topCategories.length
        ? `<tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">WHERE IT WENT</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${d.topCategories.map((c) => catBar(c.label, c.amount, c.pct)).join("")}</table>
    </td></tr>`
        : ""
    }

    ${
      d.ytdAverages.length
        ? `<tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:4px">${escapeHtml(d.ytdYear)} AVERAGE PER MONTH</div>
      <div style="font:400 11px ${FONT};color:${FAINT};margin-bottom:10px">What each category has averaged monthly so far this year.</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:10px;padding:8px 14px">${d.ytdAverages.map((a) => avgRow(a.label, a.amount, a.amountMxn)).join("")}</table>
    </td></tr>`
        : ""
    }

    ${
      d.largeTransactions.length
        ? `<tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">BIGGEST CHARGES OUTSIDE OF RENT</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:10px;padding:6px 14px">${d.largeTransactions.map(txnRow).join("")}</table>
    </td></tr>`
        : ""
    }

    <tr><td style="padding:24px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:10px">NET WORTH${d.netWorthDelta ? ` &middot; ${escapeHtml(d.netWorthDelta)} THIS MONTH` : ""}</div>
      <div style="font:800 26px ${FONT};color:${INK}">${d.netWorth}</div>
      <div style="font:600 12px ${FONT};color:${FAINT};margin:3px 0 12px">${escapeHtml(d.netWorthMxn)}</div>
      ${worthCards}
    </td></tr>

    ${approveButton}

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
          <p style="font:600 13px ${FONT};color:${SLATE};margin:0 0 2px">Warmly, ${escapeHtml(ADVISOR_NAME)}</p>
          <p style="font:400 12px ${FONT};color:${FAINT};margin:0 0 12px">Your financial advisor</p>
          <p style="font:400 12px/1.6 ${FONT};color:${FAINT};margin:0">Reflects whatever&rsquo;s been imported so far. Upload last month&rsquo;s Capital One &amp; Chase exports to fill it in. Peso figures are estimates at the current exchange rate.</p>
        </td></tr>
      </table>
    </td></tr>

  </table>
  <div style="font:400 11px ${FONT};color:#ada28c;margin-top:14px">The Daily Chase &middot; Monthly money recap</div>
</td></tr>
</table>
</body></html>`;
}
