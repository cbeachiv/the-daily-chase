// "Reps & Repositories" — email rendering (shared by the cron route and the
// local preview script so what you preview is exactly what gets sent).
//
// Bulletproof email HTML: 600px-max outer <table>, all styling inline, web-safe
// fonts, CSS bars built from nested tables + background-color (no flex/grid),
// every <img> has literal width + alt. Charts are QuickChart.io PNGs (email
// clients block JS, so the dashboard's Chart.js can't render here).

export interface RenrData {
  weekEnding: string; // pretty, e.g. "June 14, 2026"
  note: string; // Tim's note (may contain newlines)
  lifts: {
    sessions: number;
    improved: number; // # exercises that beat a previous best this week
    tracked: number; // # distinct exercises trained this week
    prs: number; // new all-time PRs
    volume: number; // total lb (faint caption only — not the focus)
    progress: { name: string; set: string; e1rm: number; delta: number | null }[];
    trend: { label: string; points: { label: string; e1rm: number }[] } | null;
  };
  cardio: {
    sessions: number;
    runs: number;
    minutes: number;
    miles: number;
    avgPace: string | null; // "8:30" or null
    rows: { label: string; miles: number | null; min: number; clock: string }[];
  } | null; // null => omit the section entirely (e.g. when cardio can't be verified)
  repos: {
    count: number;
    totalLines: number;
    rows: { name: string; lines: number; color: string }[];
  };
}

// --- palette ---------------------------------------------------------------
const INK = "#16140f";
const AMBER = "#f59e0b";
const AMBER_DEEP = "#b45309";
const MUTED = "#6b7280";
const FAINT = "#9aa0a6";
const CARD_BG = "#faf8f4";
const CARD_BORDER = "#ece5d8";
const TRACK = "#ece4d6";
const PURPLE = "#8b5cf6";
const RUN_GREEN = "#10b981";
const FONT = "Helvetica,Arial,sans-serif";

// --- QuickChart ------------------------------------------------------------
function quickChart(config: object, w: number, h: number): string {
  return `https://quickchart.io/chart?bkg=white&w=${w}&h=${h}&c=${encodeURIComponent(JSON.stringify(config))}`;
}

const CHART_FONT = "Helvetica, Arial, sans-serif";

export function repoChartUrl(rows: RenrData["repos"]["rows"]): string | null {
  if (rows.length === 0) return null;
  return quickChart(
    {
      type: "horizontalBar",
      data: {
        labels: rows.map((r) => r.name),
        datasets: [{ data: rows.map((r) => r.lines), backgroundColor: rows.map((r) => r.color), borderWidth: 0 }],
      },
      options: {
        legend: { display: false },
        title: { display: true, text: "Lines added per repo", fontFamily: CHART_FONT, fontSize: 15, fontColor: "#16140f" },
        scales: {
          xAxes: [{ ticks: { beginAtZero: true, fontFamily: CHART_FONT, fontColor: "#6b7280" }, gridLines: { color: "#f0f0f0" } }],
          yAxes: [{ ticks: { fontFamily: CHART_FONT, fontColor: "#16140f", fontStyle: "bold" }, gridLines: { display: false } }],
        },
        plugins: { datalabels: { display: false } },
      },
    },
    600,
    Math.max(180, rows.length * 46 + 64),
  );
}

export function liftTrendChartUrl(trend: RenrData["lifts"]["trend"]): string | null {
  if (!trend || trend.points.length < 2) return null;
  return quickChart(
    {
      type: "line",
      data: {
        labels: trend.points.map((p) => p.label),
        datasets: [
          {
            label: trend.label,
            data: trend.points.map((p) => p.e1rm),
            borderColor: PURPLE,
            backgroundColor: "rgba(139,92,246,0.12)",
            fill: true,
            borderWidth: 3,
            lineTension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: PURPLE,
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        legend: { display: false },
        title: {
          display: true,
          text: `${trend.label} — est. 1-rep max trend`,
          fontFamily: CHART_FONT,
          fontSize: 15,
          fontColor: "#16140f",
        },
        scales: {
          xAxes: [{ ticks: { fontFamily: CHART_FONT, fontColor: "#6b7280" }, gridLines: { display: false } }],
          yAxes: [{ ticks: { fontFamily: CHART_FONT, fontColor: "#6b7280" }, gridLines: { color: "#f0f0f0" } }],
        },
        plugins: { datalabels: { display: false } },
      },
    },
    600,
    280,
  );
}

// --- pieces ----------------------------------------------------------------
function bar(color: string, pct: number, label: string, value: string): string {
  const p = Math.max(3, Math.min(100, Math.round(pct)));
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:7px 0">
    <tr><td style="font:600 13px ${FONT};color:${INK};padding-bottom:4px">
      ${label}<span style="float:right;color:${MUTED};font-weight:400">${value}</span>
    </td></tr>
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TRACK};border-radius:7px">
        <tr>
          <td style="background:${color};height:11px;width:${p}%;border-radius:7px;font-size:0;line-height:0">&nbsp;</td>
          <td style="font-size:0;line-height:0">&nbsp;</td>
        </tr>
      </table>
    </td></tr>
  </table>`;
}

/** A lift row: name + best set on the left, e1RM + week-over-week delta chip on the right. */
function progressRow(name: string, set: string, e1rm: number, delta: number | null): string {
  let chip: string;
  if (delta === null) {
    chip = `<span style="font:700 11px ${FONT};color:${AMBER_DEEP};background:#fff4e0;border-radius:20px;padding:3px 9px;white-space:nowrap">NEW</span>`;
  } else if (delta > 0) {
    chip = `<span style="font:700 11px ${FONT};color:#047857;background:#e7f7f0;border-radius:20px;padding:3px 9px;white-space:nowrap">&#9650; +${delta}</span>`;
  } else if (delta < 0) {
    chip = `<span style="font:700 11px ${FONT};color:#9aa0a6;background:#f1f0ec;border-radius:20px;padding:3px 9px;white-space:nowrap">&#9660; ${delta}</span>`;
  } else {
    chip = `<span style="font:700 11px ${FONT};color:${MUTED};background:#f1f0ec;border-radius:20px;padding:3px 9px;white-space:nowrap">&#61; even</span>`;
  }
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:9px 0">
    <tr>
      <td valign="middle" style="font:700 14px ${FONT};color:${INK}">
        ${name}<div style="font:400 12px ${FONT};color:${MUTED};margin-top:2px">${set}</div>
      </td>
      <td valign="middle" align="right" style="white-space:nowrap">
        <span style="font:800 16px ${FONT};color:${INK};margin-right:8px">${e1rm}</span>${chip}
        <div style="font:600 9px ${FONT};color:${FAINT};text-transform:uppercase;letter-spacing:.5px;margin-top:2px">est. 1RM</div>
      </td>
    </tr>
  </table>`;
}

function statCard(value: string, label: string): string {
  // Scale the value font so long text (e.g. a repo name) still fits the narrow card.
  const len = value.length;
  const fs = len > 13 ? 14 : len > 9 ? 17 : len > 6 ? 21 : 26;
  return `
  <td width="33%" align="center" valign="middle" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:12px;padding:16px 8px">
    <div style="font:800 ${fs}px ${FONT};color:${INK};line-height:1.15">${value}</div>
    <div style="font:700 10px ${FONT};color:${FAINT};text-transform:uppercase;letter-spacing:1px;margin-top:6px">${label}</div>
  </td>`;
}

function cardsRow(cards: string[]): string {
  const spacer = `<td width="10" style="font-size:0;line-height:0">&nbsp;</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cards.join(spacer)}</tr></table>`;
}

function chartImg(url: string | null, alt: string): string {
  if (!url) return "";
  return `<img src="${url}" width="552" alt="${alt}" style="display:block;width:100%;max-width:552px;height:auto;margin:16px auto 0;border:1px solid ${CARD_BORDER};border-radius:12px"/>`;
}

function section(emoji: string, title: string, accent: string, cards: string, body: string, chart: string): string {
  return `
  <tr><td style="padding:28px 26px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:800 18px ${FONT};color:${INK}">
        <span style="display:inline-block;width:10px;height:10px;background:${accent};border-radius:3px;margin-right:9px"></span>${emoji} ${title}
      </td>
    </tr></table>
    <div style="height:14px;font-size:0;line-height:0">&nbsp;</div>
    ${cards}
    <div style="height:6px;font-size:0;line-height:0">&nbsp;</div>
    ${body}
    ${chart}
  </td></tr>`;
}

function emptyLine(text: string): string {
  return `<p style="font:400 14px ${FONT};color:${MUTED};margin:8px 0 0;font-style:italic">${text}</p>`;
}

// --- main ------------------------------------------------------------------
export function buildEmailHtml(d: RenrData): string {
  // LIFTS — focus on progressive overload (week-over-week strength), not volume
  const liftCards = cardsRow([
    statCard(String(d.lifts.sessions), d.lifts.sessions === 1 ? "Session" : "Sessions"),
    statCard(d.lifts.tracked ? `${d.lifts.improved}/${d.lifts.tracked}` : "—", "Lifts up"),
    statCard(String(d.lifts.prs), d.lifts.prs === 1 ? "New PR" : "New PRs"),
  ]);
  const liftCaption =
    d.lifts.sessions > 0
      ? `<p style="font:600 12px ${FONT};color:${MUTED};margin:10px 0 2px">${
          d.lifts.improved > 0
            ? `&#9650; ${d.lifts.improved} of ${d.lifts.tracked} lifts beat a previous best`
            : "Holding the line this week — no new bests"
        } &middot; <span style="color:${FAINT}">${d.lifts.volume.toLocaleString()} lb moved</span></p>`
      : "";
  const liftBody =
    d.lifts.sessions > 0
      ? liftCaption + d.lifts.progress.map((p) => progressRow(p.name, p.set, p.e1rm, p.delta)).join("")
      : emptyLine("Rest week on the iron — even Tim takes a day off the pumps.");
  const lifts = section(
    "\u{1F3CB}\u{FE0F}",
    "Lifting",
    PURPLE,
    liftCards,
    liftBody,
    chartImg(d.lifts.sessions > 0 ? liftTrendChartUrl(d.lifts.trend) : null, "Estimated 1-rep max trend"),
  );

  // CARDIO (omitted entirely when d.cardio is null)
  let cardio = "";
  if (d.cardio) {
    const c = d.cardio;
    const cardioCards = cardsRow([
      statCard(String(c.runs), c.runs === 1 ? "Run" : "Runs"),
      statCard(c.miles > 0 ? c.miles.toFixed(1) : "0", "Miles"),
      statCard(c.avgPace ? c.avgPace : "—", "Avg pace"),
    ]);
    const maxMin = Math.max(1, ...c.rows.map((r) => r.min));
    const cardioBars =
      c.sessions > 0
        ? c.rows
            .map((r) => bar(RUN_GREEN, (r.min / maxMin) * 100, r.label, r.miles ? `${r.miles.toFixed(1)} mi · ${r.clock}` : r.clock))
            .join("")
        : emptyLine("Off the pavement this week — boots back on soon, I reckon.");
    cardio = section("\u{1F3C3}", "Cardio & Runs", RUN_GREEN, cardioCards, cardioBars, "");
  }

  // REPOS
  const repoCards = cardsRow([
    statCard(String(d.repos.count), d.repos.count === 1 ? "Repo" : "Repos"),
    statCard(d.repos.totalLines.toLocaleString(), "Lines"),
    statCard(d.repos.rows[0]?.name ?? "—", "Top repo"),
  ]);
  const maxLines = Math.max(1, ...d.repos.rows.map((r) => r.lines));
  const repoBars =
    d.repos.count > 0
      ? d.repos.rows.map((r) => bar(r.color, (r.lines / maxLines) * 100, r.name, `${r.lines.toLocaleString()} lines`)).join("")
      : emptyLine("Quiet in the repositories this week — the keyboard got a breather.");
  const repos = section("\u{1F4BB}", "Repositories", AMBER, repoCards, repoBars, chartImg(repoChartUrl(d.repos.rows), "Lines added per repo"));

  const noteParas = d.note
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p style="font:400 15px/1.6 'Courier New',Courier,monospace;color:#2a2620;margin:0 0 11px">${l}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<title>Reps &amp; Repositories</title></head>
<body style="margin:0;padding:0;background:#efe9dd;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe9dd">
<tr><td align="center" style="padding:24px 12px">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4dccc">

    <!-- HEADER -->
    <tr><td style="background:${INK};padding:30px 26px 26px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <div style="font:800 27px ${FONT};color:#ffffff;letter-spacing:-.6px;line-height:1.05">Reps&nbsp;&amp;&nbsp;Repositories</div>
          <div style="font:700 12px ${FONT};color:${AMBER};margin-top:8px;letter-spacing:.3px">&#9981; FROM TIM AT THE MARATHON &middot; BOWERSVILLE, OH</div>
          <div style="font:400 12px ${FONT};color:${FAINT};margin-top:3px">Week ending ${d.weekEnding}</div>
        </td>
      </tr></table>
    </td></tr>

    <!-- amber rule -->
    <tr><td style="height:4px;background:${AMBER};font-size:0;line-height:0">&nbsp;</td></tr>

    <!-- TIM'S NOTE (receipt) -->
    <tr><td style="padding:24px 26px 2px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:#fff8ec;border:1px solid #f7e4bf;border-left:4px solid ${AMBER};border-radius:10px;padding:18px 20px">
          <div style="font:700 11px ${FONT};color:${AMBER_DEEP};letter-spacing:1.5px;margin-bottom:12px">&#9749; A NOTE FROM THE PUMP</div>
          ${noteParas}
          <p style="font:700 14px ${FONT};color:${AMBER_DEEP};margin:14px 0 0">&mdash; Tim &#9981;</p>
        </td></tr>
      </table>
    </td></tr>

    ${lifts}
    ${cardio}
    ${repos}

    <!-- FOOTER -->
    <tr><td style="padding:30px 26px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="border-top:1px solid ${CARD_BORDER};padding-top:18px">
          <p style="font:400 12px/1.6 ${FONT};color:${FAINT};margin:0">
            Numbers pulled straight from Chase&rsquo;s logs &mdash; no funny business.<br/>
            Coffee&rsquo;s still on the house if you swing back through, Gino. &#9981;
          </p>
        </td></tr>
      </table>
    </td></tr>

  </table>

  <div style="font:400 11px ${FONT};color:#ada28c;margin-top:14px">Reps &amp; Repositories &middot; a weekly dispatch from Bowersville</div>

</td></tr>
</table>
</body></html>`;
}
