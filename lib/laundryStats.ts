// Weekly laundry stats for the Sunday "Laundry Report" email. Pure functions
// over the raw `laundryEvents` log (see app/api/laundry/report/route.ts); all
// day/time bucketing is in Eastern time so "Sunday evening" means what it says.

import { addDays } from "@/lib/dates";
import { DEFAULT_CONFIG, type MachineId } from "@/lib/laundry";

export interface RawLaundryEvent {
  machine: MachineId;
  /** "start" | "stop" | "power_off" | "power_restored"; missing on the oldest events. */
  kind?: string;
  running?: boolean;
  watts?: number;
  at: number;
}

export interface Load {
  machine: MachineId;
  start: number;
  end: number;
}

const MIN = 60_000;
/** Stops followed by a start within this long are one load (plug flaps, script restarts). */
const MERGE_GAP_MS = 3 * MIN;
/**
 * Washer stops at or above this were mid-load pauses: the washer idles ~2.2 W
 * paused and ~1.4 W when done. Before the plug's OFF_WATTS dropped to 1.7 W on
 * 2026-09-23 those pauses were logged as stops.
 */
const WASHER_PAUSE_WATTS = 1.7;
/** A dryer that starts within this long after the washer finishes is taking its load. */
const HANDOFF_WINDOW_MS = 3 * 60 * MIN;

// ---------- Eastern time helpers ----------

const ET = "America/New_York";
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface EtParts {
  date: string; // YYYY-MM-DD
  dow: number; // 0 = Sunday
  hour: number;
  minute: number;
}

export function etParts(ts: number): EtParts {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    dow: DOW.indexOf(p.weekday),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
  };
}

/** "7:48 PM" */
export function clock(ts: number): string {
  const { hour, minute } = etParts(ts);
  return hourLabel(hour, minute);
}

export function hourLabel(hour: number, minute = 0): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const m = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return `${h}${m} ${hour < 12 || hour === 24 ? "AM" : "PM"}`;
}

/** "1 h 12 min", "47 min" */
export function duration(ms: number): string {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** "Sep 20" */
export function monthDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// ---------- Loads ----------

function kindOf(e: RawLaundryEvent): string {
  return e.kind ?? (e.running ? "start" : "stop");
}

/** Turn the start/stop log into finished loads, oldest first. */
export function buildLoads(events: RawLaundryEvent[]): Load[] {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const loads: Load[] = [];
  for (const machine of ["washer", "dryer"] as MachineId[]) {
    const mine: (Load & { stopWatts: number })[] = [];
    let openAt: number | null = null;
    for (const e of sorted) {
      if (e.machine !== machine) continue;
      const kind = kindOf(e);
      if (kind === "start" && openAt === null) {
        const prev = mine[mine.length - 1];
        const pause = machine === "washer" && prev && prev.stopWatts >= WASHER_PAUSE_WATTS;
        if (prev && (e.at - prev.end < MERGE_GAP_MS || pause)) {
          mine.pop();
          openAt = prev.start;
        } else {
          openAt = e.at;
        }
      } else if (kind === "stop" && openAt !== null) {
        mine.push({ machine, start: openAt, end: e.at, stopWatts: e.watts ?? 0 });
        openAt = null;
      }
    }
    for (const l of mine) {
      if (l.end - l.start >= DEFAULT_CONFIG.minRunMs) loads.push({ machine, start: l.start, end: l.end });
    }
  }
  return loads.sort((a, b) => a.start - b.start);
}

// ---------- Weekly stats ----------

export type Block = 0 | 1 | 2;
export const BLOCK_NAMES = ["Morning", "Afternoon", "Evening"];
/** Overnight folds into the nearest block: before noon = morning, 5 PM on = evening. */
function blockOf(hour: number): Block {
  return hour < 12 ? 0 : hour < 17 ? 1 : 2;
}

export interface MachineWeek {
  loads: number;
  avgMs: number | null;
  shortestMs: number | null;
  longestMs: number | null;
  /** Average loads per week over up to 4 prior weeks; null without a full prior week. */
  priorAvg: number | null;
}

export interface Window {
  dow: number;
  startHour: number;
  /** Minutes of machine use seen in this window over the lookback. */
  usedMin: number;
}

export interface LaundryWeek {
  /** First and last day of the week covered (Eastern dates). */
  from: string;
  to: string;
  washer: MachineWeek;
  dryer: MachineWeek;
  totalLoads: number;
  machineHours: number;
  /** In-use minutes by [dow][block] over the lookback (up to 4 weeks). */
  heat: number[][];
  lookbackDays: number;
  busiest: { dow: number; block: Block } | null;
  quietest: Window[];
  /** Days of history the recommendation is based on (caps at the lookback). */
  historyDays: number;
  handoff: {
    matched: number;
    avgWaitMs: number | null;
    longest: { waitMs: number; washerEnd: number; dryerStart: number } | null;
    airDry: number;
  };
  records: {
    earlyBird: Load | null;
    nightOwl: Load | null;
    marathon: Load | null;
    overlapMs: number;
  };
  laundryFreeDays: number;
  /** Days of this week the plugs were logging (7 once history covers the week). */
  trackedDays: number;
  /** Consecutive days with no loads, ending on `to`. */
  freeStreak: number;
}

function minutesByHour(loads: Load[]): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const l of loads) {
    for (let t = l.start; t < l.end; t += 5 * MIN) {
      const p = etParts(t);
      grid[p.dow][p.hour] += Math.min(5, (l.end - t) / MIN);
    }
  }
  return grid;
}

function machineWeek(week: Load[], prior: Load[], priorWeeks: number): MachineWeek {
  const lens = week.map((l) => l.end - l.start);
  return {
    loads: week.length,
    avgMs: lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : null,
    shortestMs: lens.length ? Math.min(...lens) : null,
    longestMs: lens.length ? Math.max(...lens) : null,
    priorAvg: priorWeeks > 0 ? prior.length / priorWeeks : null,
  };
}

/** Minutes after 4 AM, so a 12:30 AM finish counts as later than 11 PM. */
function lateness(ts: number): number {
  const p = etParts(ts);
  return ((p.hour + 20) % 24) * 60 + p.minute;
}

/**
 * Stats for the 7 days ending the day before `today` (Eastern YYYY-MM-DD).
 * `loads` should cover at least the 5 weeks before `today`.
 */
export function weeklyStats(loads: Load[], today: string, firstEventAt: number | null): LaundryWeek {
  const from = addDays(today, -7);
  const to = addDays(today, -1);
  const dateOf = (l: Load) => etParts(l.start).date;
  const inRange = (l: Load, a: string, b: string) => {
    const d = dateOf(l);
    return d >= a && d <= b;
  };

  const week = loads.filter((l) => inRange(l, from, to));
  const firstDate = firstEventAt !== null ? etParts(firstEventAt).date : to;
  const daysBetween = (a: string, b: string) =>
    Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

  // Prior full weeks for the trend line (up to 4, only ones fully covered by the log).
  const priorWeeks = Math.max(0, Math.min(4, Math.floor(daysBetween(firstDate, from) / 7)));
  const prior = priorWeeks ? loads.filter((l) => inRange(l, addDays(from, -7 * priorWeeks), addDays(from, -1))) : [];

  // Busy-ness and recommendations look back up to 4 weeks, including this one.
  const lookStart = addDays(today, -28) > firstDate ? addDays(today, -28) : firstDate;
  const lookback = loads.filter((l) => inRange(l, lookStart, to));
  const lookbackDays = Math.max(1, daysBetween(lookStart, today));
  const byHour = minutesByHour(lookback);

  const heat = byHour.map((hours) => {
    const row = [0, 0, 0];
    hours.forEach((m, h) => (row[blockOf(h)] += m));
    return row.map(Math.round);
  });
  let busiest: LaundryWeek["busiest"] = null;
  heat.forEach((row, dow) =>
    row.forEach((m, b) => {
      if (m > 0 && (!busiest || m > heat[busiest.dow][busiest.block])) busiest = { dow, block: b as Block };
    })
  );

  // Quietest 2-hour windows, 8 AM to 9 PM, at most one per day. Neighboring
  // hours count half so a quiet slot next to a rush doesn't win; ties go to
  // times people are actually free (weekend daytime, weekday evenings).
  const candidates: (Window & { score: number })[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let h = 8; h <= 19; h++) {
      const usedMin = byHour[dow][h] + byHour[dow][h + 1];
      const near = (byHour[dow][h - 1] ?? 0) + (byHour[dow][h + 2] ?? 0);
      const weekend = dow === 0 || dow === 6;
      const convenient = weekend ? h >= 9 && h <= 15 : h >= 17 && h <= 19;
      candidates.push({ dow, startHour: h, usedMin: Math.round(usedMin), score: usedMin + near / 2 - (convenient ? 1 : 0) });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.dow - b.dow || a.startHour - b.startHour);
  const quietest: Window[] = [];
  for (const c of candidates) {
    if (quietest.length === 3) break;
    if (quietest.some((q) => q.dow === c.dow)) continue;
    quietest.push({ dow: c.dow, startHour: c.startHour, usedMin: c.usedMin });
  }
  quietest.sort((a, b) => a.dow - b.dow);

  // Washer -> dryer handoffs this week.
  const washes = week.filter((l) => l.machine === "washer");
  const dries = loads.filter((l) => l.machine === "dryer");
  const used = new Set<Load>();
  const waits: { waitMs: number; washerEnd: number; dryerStart: number }[] = [];
  for (const w of washes) {
    const d = dries.find((x) => !used.has(x) && x.start >= w.end - 2 * MIN && x.start - w.end <= HANDOFF_WINDOW_MS);
    if (!d) continue;
    used.add(d);
    waits.push({ waitMs: Math.max(0, d.start - w.end), washerEnd: w.end, dryerStart: d.start });
  }
  const longestWait = waits.reduce<(typeof waits)[number] | null>((a, b) => (!a || b.waitMs > a.waitMs ? b : a), null);

  // Records.
  const minuteOfDay = (ts: number) => {
    const p = etParts(ts);
    return p.hour * 60 + p.minute;
  };
  const pick = (score: (l: Load) => number) =>
    week.reduce<Load | null>((best, l) => (!best || score(l) > score(best) ? l : best), null);
  const earlyBird = pick((l) => -minuteOfDay(l.start));
  const nightOwl = pick((l) => lateness(l.end));
  const marathon = pick((l) => l.end - l.start);
  let overlapMs = 0;
  for (const w of washes) {
    for (const d of week.filter((l) => l.machine === "dryer")) {
      overlapMs += Math.max(0, Math.min(w.end, d.end) - Math.max(w.start, d.start));
    }
  }

  // Laundry-free days.
  const activeDays = new Set(week.map(dateOf));
  let laundryFreeDays = 0;
  let trackedDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (d < firstDate) continue; // before the plugs were logging
    trackedDays++;
    if (!activeDays.has(d)) laundryFreeDays++;
  }
  const allDays = new Set(loads.map(dateOf));
  let freeStreak = 0;
  for (let d = to; d >= firstDate && !allDays.has(d); d = addDays(d, -1)) freeStreak++;

  return {
    from,
    to,
    washer: machineWeek(washes, prior.filter((l) => l.machine === "washer"), priorWeeks),
    dryer: machineWeek(week.filter((l) => l.machine === "dryer"), prior.filter((l) => l.machine === "dryer"), priorWeeks),
    totalLoads: week.length,
    machineHours: week.reduce((a, l) => a + (l.end - l.start), 0) / (60 * MIN),
    heat,
    lookbackDays,
    busiest,
    quietest,
    historyDays: Math.min(28, daysBetween(firstDate, today)),
    handoff: {
      matched: waits.length,
      avgWaitMs: waits.length ? waits.reduce((a, w) => a + w.waitMs, 0) / waits.length : null,
      longest: longestWait,
      airDry: washes.length - waits.length,
    },
    records: { earlyBird, nightOwl, marathon, overlapMs },
    laundryFreeDays,
    trackedDays,
    freeStreak,
  };
}

/** "Sunday evening" */
export function slotLabel(dow: number, block: Block): string {
  return `${DAY_NAMES[dow]} ${BLOCK_NAMES[block].toLowerCase()}`;
}

/** "Tuesday, 6 to 8 PM" */
export function windowLabel(w: Window): string {
  const a = hourLabel(w.startHour);
  const b = hourLabel(w.startHour + 2);
  const sameHalf = (w.startHour < 12) === (w.startHour + 2 < 12);
  return `${DAY_NAMES[w.dow]}, ${sameHalf ? a.replace(/ [AP]M$/, "") : a} to ${b}`;
}
