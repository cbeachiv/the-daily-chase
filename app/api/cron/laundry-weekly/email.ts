// "The Laundry Report": Sunday-morning recap of the 3720 Center St washer and
// dryer for Chase + Sarah. Same inline-style, table-based conventions as the
// other cron emails so it renders in Gmail and Apple Mail alike.

import {
  BLOCK_NAMES,
  DAY_NAMES,
  clock,
  duration,
  etParts,
  monthDay,
  slotLabel,
  windowLabel,
  type LaundryWeek,
  type Load,
  type MachineWeek,
} from "@/lib/laundryStats";

export interface LaundryEmailData {
  week: LaundryWeek;
  intro: string;
  siteUrl: string; // https://www.3720centerstreet.com
}

const PAGE = "#e9f2f4";
const INK = "#10212b";
const CARD_BG = "#f6fafb";
const CARD_BORDER = "#d8e7eb";
const MUTED = "#5b6b73";
const FAINT = "#8c9ba2";
const TEAL = "#0f766e";
const SKY = "#0284c7";
const CORAL = "#e1574c";
const NAVY = "#12344d";
const FONT = "Helvetica,Arial,sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const dayTime = (ts: number) => `${DAY_NAMES[etParts(ts).dow].slice(0, 3)} ${clock(ts)}`;

function section(title: string, body: string): string {
  return `<tr><td style="padding:20px 26px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:8px">${title}</div>
      <div style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:12px;padding:12px 16px">${body}</div>
    </td></tr>`;
}

function para(html: string): string {
  return `<p style="font:400 14px/1.55 ${FONT};color:${INK};margin:0 0 6px">${html}</p>`;
}

function rows(items: { label: string; value: string; note?: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items
    .map(
      (r) => `<tr>
        <td valign="top" style="font:700 13px ${FONT};color:${INK};padding:5px 10px 5px 0;white-space:nowrap">${r.label}</td>
        <td valign="top" align="right" style="font:400 13px/1.45 ${FONT};color:${MUTED};padding:5px 0">${r.value}${
          r.note ? `<div style="font:400 11px ${FONT};color:${FAINT}">${r.note}</div>` : ""
        }</td>
      </tr>`
    )
    .join("")}</table>`;
}

function statCard(emoji: string, name: string, m: MachineWeek, accent: string): string {
  const sub = m.avgMs !== null ? `avg ${duration(m.avgMs)}` : "no loads";
  const range =
    m.loads > 1 && m.shortestMs !== null && m.longestMs !== null
      ? `${duration(m.shortestMs)} to ${duration(m.longestMs)}`
      : "&nbsp;";
  return `
  <td width="50%" align="center" valign="top" style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:12px;padding:16px 8px">
    <div style="font:700 11px ${FONT};color:${FAINT};text-transform:uppercase;letter-spacing:1px">${emoji} ${name}</div>
    <div style="font:900 34px ${FONT};color:${accent};line-height:1.1;margin-top:6px">${m.loads}</div>
    <div style="font:700 12px ${FONT};color:${INK};margin-top:2px">${m.loads === 1 ? "load" : "loads"} &middot; ${sub}</div>
    <div style="font:400 11px ${FONT};color:${FAINT};margin-top:4px">${range}</div>
  </td>`;
}

/** Mix white-ish -> teal by t in [0, 1]. */
function shade(t: number): string {
  const a = [238, 246, 247];
  const b = [15, 118, 110];
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

function heatmap(w: LaundryWeek): string {
  const max = Math.max(1, ...w.heat.flat());
  const head = `<tr><td></td>${BLOCK_NAMES.map(
    (b) => `<td align="center" style="font:700 10px ${FONT};color:${FAINT};letter-spacing:.5px;padding:0 0 4px">${b.toUpperCase()}</td>`
  ).join("")}</tr>`;
  const body = w.heat
    .map((row, dow) => {
      const cells = row
        .map((m) => {
          const t = m / max;
          const label = m > 0 ? duration(m * 60_000).replace(" min", "m").replace(" h ", "h ").replace(" h", "h") : "";
          return `<td align="center" style="background:${shade(t)};border:2px solid ${CARD_BG};border-radius:6px;height:26px;font:700 11px ${FONT};color:${t > 0.55 ? "#ffffff" : MUTED}">${label}</td>`;
        })
        .join("");
      return `<tr><td style="font:700 12px ${FONT};color:${INK};padding-right:8px;width:34px">${DAY_NAMES[dow].slice(0, 3)}</td>${cells}</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${head}${body}</table>`;
}

function trendValue(m: MachineWeek): string {
  if (m.priorAvg === null) return `${m.loads} this week`;
  const diff = m.loads - m.priorAvg;
  const arrow = Math.abs(diff) < 0.5 ? "&rarr;" : diff > 0 ? "&uarr;" : "&darr;";
  return `${m.loads} vs. ${m.priorAvg.toFixed(1)} avg ${arrow}`;
}

function loadLine(l: Load | null, what: (l: Load) => string): string {
  return l ? what(l) : "None yet";
}

export function buildEmailHtml(d: LaundryEmailData): string {
  const w = d.week;
  const weekLabel = `${monthDay(w.from)} to ${monthDay(w.to)}`;
  const limited = w.historyDays < 14;

  const busiestBody = w.busiest
    ? para(
        `Busiest slot: <strong>${slotLabel(w.busiest.dow, w.busiest.block)}</strong>. Minutes the machines ran, past ${plural(
          w.lookbackDays,
          "day"
        )}:`
      ) + heatmap(w)
    : para("The machines sat still all week. Nothing to map yet.");

  const recBody =
    rows(
      w.quietest.map((q) => ({
        label: windowLabel(q),
        value: q.usedMin === 0 ? "wide open so far" : `${q.usedMin} min of use seen`,
      }))
    ) +
    `<p style="font:400 12px/1.5 ${FONT};color:${FAINT};margin:8px 0 0">Quietest 2-hour windows between 8 AM and 9 PM, enough for a wash and the start of a dry.${
      w.busiest ? ` Skip ${slotLabel(w.busiest.dow, w.busiest.block)} if you can.` : ""
    }${limited ? ` Based on only ${plural(w.historyDays, "day")} of data so far, so it gets smarter each week.` : ""}</p>`;

  const h = w.handoff;
  const handoffBody =
    h.matched === 0
      ? para(w.washer.loads ? "No washer load went straight into the dryer this week. Air-dry heroes." : "No washer loads, no wet clothes. Easy week.")
      : para(
          `Wet clothes waited <strong>${duration(h.avgWaitMs ?? 0)}</strong> on average between the washer finishing and the dryer starting (${plural(
            h.matched,
            "handoff"
          )}).`
        ) +
        (h.longest && h.longest.waitMs >= 10 * 60_000
          ? para(
              `&#127942; <strong>Forgotten Load award:</strong> the washer finished ${dayTime(h.longest.washerEnd)} and the dryer didn't start until ${clock(
                h.longest.dryerStart
              )}, ${duration(h.longest.waitMs)} later.`
            )
          : para("No forgotten loads. Everything moved to the dryer within 10 minutes. Impressive."));

  const r = w.records;
  const recordsBody = rows([
    { label: "&#128038; Early bird", value: loadLine(r.earlyBird, (l) => `${l.machine === "washer" ? "Washer" : "Dryer"} started ${dayTime(l.start)}`) },
    { label: "&#129417; Night owl", value: loadLine(r.nightOwl, (l) => `${l.machine === "washer" ? "Washer" : "Dryer"} finished ${dayTime(l.end)}`) },
    {
      label: "&#127939; Marathon load",
      value: loadLine(r.marathon, (l) => `${duration(l.end - l.start)} ${l.machine === "washer" ? "wash" : "dry"}, ${dayTime(l.start)}`),
    },
    {
      label: "&#129309; Tag team",
      value: r.overlapMs > 0 ? `Both machines ran together for ${duration(r.overlapMs)}` : "Never both at once",
    },
  ]);

  const airDryRate = w.washer.loads ? Math.round((h.airDry / w.washer.loads) * 100) : null;
  const trendsBody = rows([
    { label: "&#129530; Washer", value: trendValue(w.washer), note: w.washer.priorAvg === null ? "4-week average starts once there's a full prior week" : undefined },
    { label: "&#128293; Dryer", value: trendValue(w.dryer) },
    {
      label: "&#127774; Air-dry rate",
      value: airDryRate === null ? "None yet" : `${airDryRate}% of washer loads skipped the dryer`,
    },
    {
      label: "&#127796; Laundry-free days",
      value: `${w.laundryFreeDays} of ${w.trackedDays}${w.freeStreak >= 2 ? ` &middot; ${w.freeStreak}-day streak going` : ""}`,
    },
  ]);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/><title>The Laundry Report</title></head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${CARD_BORDER}">

    <tr><td style="background:${NAVY};padding:22px 26px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle" style="padding-right:14px"><img src="${d.siteUrl}/laundry-icon-192.png" width="52" height="52" alt="" style="display:block;border-radius:12px"/></td>
        <td valign="middle">
          <div style="font:900 26px ${FONT};color:#ffffff;letter-spacing:-.5px;line-height:1.05">The Laundry Report</div>
          <div style="font:700 12px ${FONT};color:#7dd3fc;margin-top:6px;letter-spacing:1.5px">${escapeHtml(weekLabel.toUpperCase())} &middot; 3720 CENTER ST</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="height:4px;background:${SKY};font-size:0;line-height:0">&nbsp;</td></tr>

    <tr><td style="padding:20px 26px 4px">
      <p style="font:400 15px/1.6 ${FONT};color:${INK};margin:0">${escapeHtml(d.intro)}</p>
    </td></tr>

    <tr><td style="padding:16px 26px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${statCard("&#129530;", "Washer", w.washer, SKY)}
        <td width="10" style="font-size:0;line-height:0">&nbsp;</td>
        ${statCard("&#128293;", "Dryer", w.dryer, CORAL)}
      </tr></table>
    </td></tr>
    <tr><td style="padding:6px 26px 0">
      <div style="font:600 13px ${FONT};color:${MUTED};text-align:center">${plural(w.totalLoads, "load")} &middot; ${w.machineHours.toFixed(1)} machine-hours</div>
    </td></tr>

    ${section("&#128197; BUSIEST TIMES", busiestBody)}
    ${section("&#9989; BEST TIMES THIS WEEK", recBody)}
    ${section("&#128167; THE WET-CLOTHES WAIT", handoffBody)}
    ${section("&#127941; RECORDS &amp; AWARDS", recordsBody)}
    ${section("&#128200; TRENDS", trendsBody)}

    <tr><td align="center" style="padding:24px 26px 6px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" style="background:${TEAL};border-radius:12px">
          <a href="${d.siteUrl}" style="display:inline-block;font:800 14px ${FONT};color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:12px">Is it free right now? &rarr;</a>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:16px 26px 26px">
      <p style="font:400 12px/1.6 ${FONT};color:${FAINT};margin:0;border-top:1px solid ${CARD_BORDER};padding-top:14px">Counted from the smart plugs on the washer and dryer. A load is any run of 5 minutes or more; times are Eastern.</p>
    </td></tr>

  </table>
  <div style="font:400 11px ${FONT};color:${FAINT};margin-top:14px">3720 Center St &middot; The Laundry Report, every Sunday</div>
</td></tr>
</table>
</body></html>`;
}
