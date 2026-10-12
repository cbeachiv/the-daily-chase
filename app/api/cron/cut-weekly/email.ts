// "The Cut Weekly": Monday-morning recap of last week against the fall cut
// targets. Same inline-style, table-based conventions as the other cron emails
// so it renders in Gmail and Apple Mail alike. Colors follow the dashboard.

import { CUT, DAILY_STEPS } from "@/lib/cutPlan";
import { MIN_LOGGED_DAYS, MIN_WEIGH_INS, type CutWeek, type DayLine, type LiftLine, type Status } from "@/lib/cutWeekly";

export interface CutEmailData {
  week: CutWeek;
  intro: string;
  appUrl: string; // https://thedailychase.com
}

const PAGE = "#fffbf7";
const CARD = "#ffffff";
const LINE = "#f0e6db";
const INK = "#1a1a1a";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const INDIGO = "#6366f1";
const TEAL = "#0f9488";
const CORAL = "#e0564f";
const AMBER = "#c77c02";
const FONT = "Helvetica,Arial,sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const lb = (x: number) => `${x.toFixed(1)} lb`;
const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "&minus;" : ""}${Math.abs(x).toFixed(1)}`;

function md(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
}

const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  ahead: { label: "Ahead of plan", color: TEAL, bg: "#e6f6f4" },
  "on-track": { label: "On track", color: INDIGO, bg: "#eef0fe" },
  behind: { label: "Behind plan", color: CORAL, bg: "#fdeeed" },
  unknown: { label: "Not enough weigh-ins", color: MUTED, bg: "#f1f5f9" },
};

function section(title: string, body: string): string {
  return `<tr><td style="padding:18px 24px 2px">
      <div style="font:800 11px ${FONT};color:${FAINT};letter-spacing:1.5px;margin-bottom:8px">${title}</div>
      <div style="background:${CARD};border:1px solid ${LINE};border-radius:12px;padding:12px 16px">${body}</div>
    </td></tr>`;
}

function bigStat(label: string, value: string, sub: string, color = INK): string {
  return `<td width="33%" align="center" valign="top" style="background:${CARD};border:1px solid ${LINE};border-radius:12px;padding:14px 6px">
    <div style="font:700 10px ${FONT};color:${FAINT};text-transform:uppercase;letter-spacing:1px">${label}</div>
    <div style="font:900 26px ${FONT};color:${color};line-height:1.15;margin-top:6px">${value}</div>
    <div style="font:400 11px ${FONT};color:${MUTED};margin-top:3px">${sub}</div>
  </td>`;
}

function check(ok: boolean | null): string {
  if (ok === null) return `<span style="color:${FAINT}">&ndash;</span>`;
  return ok
    ? `<span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:10px;background:${TEAL};color:#fff;font:700 12px ${FONT};text-align:center">&#10003;</span>`
    : `<span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:10px;background:${CORAL};color:#fff;font:700 12px ${FONT};text-align:center">&times;</span>`;
}

function scoreRow(name: string, result: string, detail: string, ok: boolean | null): string {
  return `<tr>
    <td width="26" valign="top" style="padding:7px 8px 7px 0">${check(ok)}</td>
    <td valign="top" style="font:700 13px ${FONT};color:${INK};padding:8px 8px 8px 0;white-space:nowrap">${name}</td>
    <td valign="top" align="right" style="font:400 13px/1.4 ${FONT};color:${INK};padding:8px 0">${result}
      <div style="font:400 11px ${FONT};color:${FAINT}">${detail}</div></td>
  </tr>`;
}

function kv(items: { label: string; value: string; note?: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items
    .map(
      (r) => `<tr>
        <td valign="top" style="font:700 13px ${FONT};color:${INK};padding:5px 10px 5px 0">${r.label}</td>
        <td valign="top" align="right" style="font:400 13px/1.45 ${FONT};color:${MUTED};padding:5px 0">${r.value}${
          r.note ? `<div style="font:400 11px ${FONT};color:${FAINT}">${r.note}</div>` : ""
        }</td>
      </tr>`
    )
    .join("")}</table>`;
}

function scorecard(w: CutWeek): string {
  const r = w.row;
  // Only grade a number when there are enough days behind it.
  const proteinDays = w.days.filter((d) => d.protein !== null).length;
  const kcalOk = r.avgKcal === null || w.caloriesDaysLogged < MIN_LOGGED_DAYS ? null : r.avgKcal <= w.kcalGoal + 50;
  const proteinOk = r.avgProtein === null || proteinDays < MIN_LOGGED_DAYS ? null : r.avgProtein >= CUT.proteinG - 5;
  const stepsOk = r.avgSteps === null || w.stepsDaysLogged < MIN_LOGGED_DAYS ? null : r.avgSteps >= DAILY_STEPS;
  const weightOk = r.avgWeight === null || r.weighIns < MIN_WEIGH_INS ? null : r.avgWeight <= r.target + 0.5;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${scoreRow(
      "Weight",
      r.avgWeight === null ? "No weigh-ins" : `${lb(r.avgWeight)} avg`,
      `target ${lb(r.target)} &middot; ${r.weighIns}/7 weigh-ins${
        r.weighIns < MIN_WEIGH_INS ? ` (need ${MIN_WEIGH_INS}+ to grade)` : r.change !== null ? ` &middot; ${signed(r.change)} vs last week` : ""
      }`,
      weightOk,
    )}
    ${scoreRow(
      "Calories",
      r.avgKcal === null ? "Not logged" : `${n0(r.avgKcal)}/day`,
      `goal ${n0(w.kcalGoal)} &middot; ${w.caloriesDaysOnTarget} of ${w.caloriesDaysLogged} logged days on target`,
      kcalOk,
    )}
    ${scoreRow(
      "Protein",
      r.avgProtein === null ? "Not logged" : `${n0(r.avgProtein)} g/day`,
      `goal ${CUT.proteinG} g &middot; logged ${proteinDays} of 7 days, hit on ${w.proteinDaysHit}`,
      proteinOk,
    )}
    ${scoreRow(
      "Steps",
      r.avgSteps === null ? "Not logged" : `${n0(r.avgSteps)}/day`,
      `goal ${n0(DAILY_STEPS)}+ &middot; ${w.stepsDaysHit} of ${w.stepsDaysLogged} logged days`,
      stepsOk,
    )}
    ${scoreRow("Lifts", `${w.liftsDone} of 3`, `${w.liftMinutes ? `${w.liftMinutes} min lifting` : "Mon A, Wed B, Fri C"}`, w.liftsDone >= 3)}
    ${scoreRow("Cardio", `${w.cardioDone} session${w.cardioDone === 1 ? "" : "s"}`, "goal 2 (Tue + Thu)", w.cardioDone >= 2)}
    ${r.waist !== null ? scoreRow("Waist", `${r.waist} in`, "at the navel", null) : ""}
  </table>`;
}

function track(w: CutWeek): string {
  const items: { label: string; value: string; note?: string }[] = [];
  if (w.vsTarget !== null) {
    items.push({
      label: "Vs. glide path",
      value: w.vsTarget <= 0 ? `${Math.abs(w.vsTarget).toFixed(1)} lb ahead` : `${w.vsTarget.toFixed(1)} lb behind`,
      note: `weekly avg ${lb(w.row.avgWeight!)} vs target ${lb(w.row.target)}`,
    });
  }
  if (w.lostSoFar !== null) items.push({ label: "Lost so far", value: `${w.lostSoFar.toFixed(1)} lb`, note: `from ${CUT.startWeight} on ${md(CUT_START)}` });
  if (w.ratePerWeek !== null) items.push({ label: "Pace", value: `${w.ratePerWeek.toFixed(1)} lb/week`, note: "plan is about 1.1 lb/week" });
  if (w.projectedEnd !== null && w.weeksLeft > 0)
    items.push({
      label: "At this pace",
      value: `${lb(w.projectedEnd)} by Dec 20`,
      note: w.projectedEnd <= CUT.goalWeight ? `beats the ${CUT.goalWeight} goal` : `goal is ${CUT.goalWeight}`,
    });
  if (w.neededPerWeek !== null && w.toGo !== null)
    items.push({ label: "Needed from here", value: `${w.neededPerWeek.toFixed(1)} lb/week`, note: `${w.toGo.toFixed(1)} lb to go in ${w.weeksLeft} week${w.weeksLeft === 1 ? "" : "s"}` });
  let flag = "";
  if (w.row.flag === "cut")
    flag = `<p style="font:700 13px/1.5 ${FONT};color:${CORAL};margin:10px 0 0">Plan rule: two weeks under 0.5 lb lost. Cut 150 cal a day (or add 2,000 steps).</p>`;
  if (w.row.flag === "add")
    flag = `<p style="font:700 13px/1.5 ${FONT};color:${AMBER};margin:10px 0 0">Plan rule: lost more than 2 lb this week. Add 150 cal a day to protect strength.</p>`;
  if (w.n <= 2)
    flag += `<p style="font:400 12px/1.5 ${FONT};color:${FAINT};margin:8px 0 0">Weeks 1 and 2 are mostly water weight, so don't read too much into the pace yet.</p>`;
  const thin =
    w.row.weighIns < MIN_WEIGH_INS
      ? `<p style="font:400 13px/1.5 ${FONT};color:${MUTED};margin:0">Only ${w.row.weighIns} weigh-in${w.row.weighIns === 1 ? "" : "s"} last week, so there's no reliable average to compare with the glide path. Weigh in every morning this week (aim for at least ${MIN_WEIGH_INS}).</p>`
      : "";
  return (thin || (items.length ? kv(items) : "")) + flag;
}

function arrow(l: LiftLine): string {
  if (l.change === "up") return `<span style="color:${TEAL};font-weight:700">&#9650;</span>`;
  if (l.change === "down") return `<span style="color:${CORAL};font-weight:700">&#9660;</span>`;
  if (l.change === "new") return `<span style="color:${FAINT};font-size:11px">new</span>`;
  return `<span style="color:${FAINT}">=</span>`;
}

function lifts(w: CutWeek): string {
  if (!w.liftLines.length) return `<p style="font:400 13px ${FONT};color:${MUTED};margin:0">No lifts logged last week.</p>`;
  const byWorkout = new Map<string, LiftLine[]>();
  for (const l of w.liftLines) byWorkout.set(l.workout, [...(byWorkout.get(l.workout) ?? []), l]);
  const head = `<tr>
    <td style="font:700 10px ${FONT};color:${FAINT};letter-spacing:1px;padding:0 0 4px">EXERCISE</td>
    <td align="right" style="font:700 10px ${FONT};color:${FAINT};letter-spacing:1px;padding:0 0 4px">LAST TIME</td>
    <td align="right" style="font:700 10px ${FONT};color:${FAINT};letter-spacing:1px;padding:0 0 4px 8px">THIS WEEK</td>
    <td width="18"></td></tr>`;
  const body = [...byWorkout.entries()]
    .map(
      ([workout, ls]) =>
        `<tr><td colspan="4" style="font:800 12px ${FONT};color:${INDIGO};padding:10px 0 2px">${esc(workout)}</td></tr>` +
        ls
          .map(
            (l) => `<tr>
          <td style="font:400 13px ${FONT};color:${INK};padding:4px 6px 4px 0;border-top:1px solid ${LINE}">${esc(l.name)}${
              l.pr ? ` <span style="background:${AMBER};color:#fff;border-radius:8px;padding:1px 6px;font:700 10px ${FONT}">PR</span>` : ""
            }${l.goUp ? ` <span style="background:#e6f6f4;color:${TEAL};border-radius:8px;padding:1px 6px;font:700 10px ${FONT}">&uarr; add weight</span>` : ""}</td>
          <td align="right" style="font:400 12px ${FONT};color:${MUTED};padding:4px 0;border-top:1px solid ${LINE};white-space:nowrap">${l.prev ?? "&ndash;"}</td>
          <td align="right" style="font:700 13px ${FONT};color:${INK};padding:4px 0 4px 8px;border-top:1px solid ${LINE};white-space:nowrap">${l.best}</td>
          <td align="right" style="padding:4px 0 4px 6px;border-top:1px solid ${LINE}">${arrow(l)}</td>
        </tr>`,
          )
          .join(""),
    )
    .join("");
  const up = w.liftLines.filter((l) => l.change === "up").length;
  const prs = w.liftLines.filter((l) => l.pr).length;
  const goUp = w.liftLines.filter((l) => l.goUp).length;
  const summary = `<p style="font:400 13px/1.5 ${FONT};color:${MUTED};margin:0 0 6px"><b style="color:${INK}">${up}</b> of ${w.liftLines.length} lifts went up vs. last time${
    prs ? `, <b style="color:${AMBER}">${prs} all-time PR${prs === 1 ? "" : "s"}</b>` : ""
  }${goUp ? `, and <b style="color:${TEAL}">${goUp}</b> ready for more weight` : ""}.</p>`;
  return `${summary}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${head}${body}</table>`;
}

function dayTable(days: DayLine[], kcalGoal: number): string {
  const th = (t: string, align = "right") =>
    `<td align="${align}" style="font:700 10px ${FONT};color:${FAINT};letter-spacing:.5px;padding:0 0 4px">${t}</td>`;
  const cell = (v: string, color = INK, align = "right") =>
    `<td align="${align}" style="font:400 12px ${FONT};color:${color};padding:5px 0;border-top:1px solid ${LINE};white-space:nowrap">${v}</td>`;
  const rows = days
    .map((d) => {
      const kc = d.kcal === null ? "&ndash;" : n0(d.kcal);
      const kcColor = d.kcal === null ? FAINT : d.kcal <= kcalGoal + 50 ? INK : CORAL;
      const st = d.steps === null ? "&ndash;" : `${(d.steps / 1000).toFixed(1)}k`;
      const stColor = d.steps === null ? FAINT : d.steps >= DAILY_STEPS ? TEAL : INK;
      const move = [d.lifted?.replace("Workout ", "Lift "), d.cardio ? "Cardio" : null].filter(Boolean).join(" + ") || "&ndash;";
      return `<tr>${cell(`<b>${d.label}</b>`, INK, "left")}${cell(d.weight === null ? "&ndash;" : d.weight.toFixed(1), d.weight === null ? FAINT : INK)}${cell(kc, kcColor)}${cell(
        d.protein === null ? "&ndash;" : `${n0(d.protein)}g`,
        d.protein === null ? FAINT : d.protein >= CUT.proteinG ? TEAL : INK,
      )}${cell(st, stColor)}${cell(move, MUTED)}</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${th("DAY", "left")}${th("WEIGHT")}${th("CAL")}${th("PROTEIN")}${th("STEPS")}${th(
    "MOVED",
  )}</tr>${rows}</table>`;
}

function extras(w: CutWeek): string {
  const items: { label: string; value: string; note?: string }[] = [];
  if (w.bestStepDay?.steps) items.push({ label: "Best step day", value: `${n0(w.bestStepDay.steps)} on ${w.bestStepDay.label}` });
  if (w.weekdayKcal !== null && w.weekendKcal !== null)
    items.push({
      label: "Weekday vs weekend",
      value: `${n0(w.weekdayKcal)} vs ${n0(w.weekendKcal)} cal`,
      note:
        w.weekendKcal - w.weekdayKcal > 200
          ? `weekends ran ${n0(w.weekendKcal - w.weekdayKcal)} cal higher a day`
          : "steady all week",
    });
  if (w.lowWeight && w.highWeight && w.lowWeight !== w.highWeight)
    items.push({
      label: "Scale range",
      value: `${w.lowWeight.weight!.toFixed(1)} (${w.lowWeight.label}) to ${w.highWeight.weight!.toFixed(1)} (${w.highWeight.label})`,
      note: `a ${(w.highWeight.weight! - w.lowWeight.weight!).toFixed(1)} lb swing, mostly water and salt`,
    });
  if (w.totalVolume > 0)
    items.push({
      label: "Lifting volume",
      value: `${n0(w.totalVolume)} lb`,
      note:
        w.prevVolume !== null && w.prevVolume > 0
          ? `${w.totalVolume >= w.prevVolume ? "up" : "down"} ${Math.abs(Math.round(((w.totalVolume - w.prevVolume) / w.prevVolume) * 100))}% vs the week before`
          : "total weight × reps",
    });
  if (w.drinks !== null) items.push({ label: "Drinks", value: `${w.drinks}`, note: w.drinkDays ? `on ${w.drinkDays} day${w.drinkDays === 1 ? "" : "s"}` : "a dry week" });
  if (w.avgSleep !== null) items.push({ label: "Sleep", value: `${w.avgSleep.toFixed(1)} h/night avg`, note: "from mood logs" });
  if (w.avgMood !== null) items.push({ label: "Mood", value: `${w.avgMood.toFixed(1)} / 10 avg` });
  return items.length ? kv(items) : `<p style="font:400 13px ${FONT};color:${MUTED};margin:0">Log more this week for extra stats here.</p>`;
}

function nextWeek(w: CutWeek): string {
  if (!w.next) return `<p style="font:400 13px/1.5 ${FONT};color:${INK};margin:0">That was the last week of the cut. Time for the DEXA and the slow reverse to about 2,400 cal.</p>`;
  const x = w.next;
  const notes = [
    x.block,
    x.lighter ? "Lighter lifting week: same weights, 2 sets instead of 3" : null,
    x.maintenance ? "Thanksgiving week: eat at maintenance, about 2,400 cal" : null,
  ].filter(Boolean) as string[];
  return kv([
    { label: `Week ${x.n} of ${CUT.weeks}`, value: notes[0], note: notes.slice(1).join(" &middot; ") || undefined },
    { label: "Targets", value: `${n0(x.kcal)} cal &middot; ${CUT.proteinG} g protein &middot; ${n0(DAILY_STEPS)}+ steps` },
    { label: "Weekly avg target", value: lb(x.target) },
  ]);
}

const CUT_START = CUT.start;

export function buildEmailHtml({ week: w, intro, appUrl }: CutEmailData): string {
  const st = STATUS[w.status];
  const avg = w.row.avgWeight;
  return `<!doctype html><html><body style="margin:0;padding:0;background:${PAGE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="padding:8px 24px 4px">
    <div style="font:800 11px ${FONT};color:${INDIGO};letter-spacing:2px">THE CUT WEEKLY</div>
    <div style="font:900 26px ${FONT};color:${INK};margin-top:4px">Week ${w.n} of ${CUT.weeks}</div>
    <div style="font:400 13px ${FONT};color:${MUTED};margin-top:2px">${md(w.start)} to ${md(w.end)} &middot; ${CUT.startWeight} &rarr; ${CUT.goalWeight} by Dec 20</div>
    <div style="margin-top:10px"><span style="display:inline-block;background:${st.bg};color:${st.color};border-radius:14px;padding:5px 12px;font:800 12px ${FONT}">${st.label}</span></div>
  </td></tr>
  <tr><td style="padding:12px 24px 4px"><p style="font:400 15px/1.55 ${FONT};color:${INK};margin:0">${esc(intro)}</p></td></tr>
  <tr><td style="padding:14px 24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
      ${bigStat(
        "Weekly avg",
        avg === null ? "&ndash;" : avg.toFixed(1),
        w.row.weighIns < MIN_WEIGH_INS ? `${w.row.weighIns} weigh-in${w.row.weighIns === 1 ? "" : "s"} only` : `target ${w.row.target.toFixed(1)}`,
        avg === null || w.row.weighIns < MIN_WEIGH_INS ? MUTED : avg <= w.row.target + 0.5 ? TEAL : CORAL,
      )}
      ${bigStat("Lost so far", w.lostSoFar === null ? "&ndash;" : `${w.lostSoFar.toFixed(1)}`, `lb since ${md(CUT_START)}`)}
      ${bigStat("To go", w.toGo === null ? "&ndash;" : w.toGo.toFixed(1), `lb to ${CUT.goalWeight}`)}
    </tr></table>
  </td></tr>
  ${section("SCORECARD", scorecard(w))}
  ${section("ON TRACK?", track(w))}
  ${section("LIFTS", lifts(w))}
  ${section("DAY BY DAY", dayTable(w.days, w.kcalGoal))}
  ${section("WORTH NOTICING", extras(w))}
  ${section("THIS WEEK", nextWeek(w))}
  <tr><td align="center" style="padding:22px 24px 8px">
    <a href="${appUrl}/cut" style="display:inline-block;background:${INDIGO};color:#fff;text-decoration:none;border-radius:10px;padding:11px 22px;font:700 14px ${FONT}">Open the Cut tab</a>
  </td></tr>
  <tr><td align="center" style="padding:6px 24px 20px;font:400 11px ${FONT};color:${FAINT}">Sent every Monday morning by The Daily Chase.</td></tr>
</table></td></tr></table></body></html>`;
}
