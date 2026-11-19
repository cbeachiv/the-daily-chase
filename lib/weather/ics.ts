// Minimal iCalendar (.ics) reader for the weather page's "Your day" section.
// Reads one or more secret iCal feeds (Google Calendar → Settings → "Secret
// address in iCal format") and returns the events inside a time window.
// Handles all-day events, TZID / UTC times, and the common RRULEs
// (DAILY / WEEKLY with BYDAY / MONTHLY / YEARLY, INTERVAL, UNTIL, COUNT,
// EXDATE, and moved instances via RECURRENCE-ID).

export interface CalEvent {
  id: string;
  title: string;
  location?: string;
  start: string; // ISO (UTC)
  end: string; // ISO (UTC)
  allDay: boolean;
}

interface Prop {
  value: string;
  params: Record<string, string>;
}

interface RawEvent {
  props: Record<string, Prop[]>;
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function parseLine(line: string): { name: string; prop: Prop } | null {
  // NAME;PARAM=x;PARAM2="y":value  (the value may itself contain colons)
  let inQuote = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ":" && !inQuote) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of head.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: head[0].toUpperCase(), prop: { value: line.slice(colon + 1), params } };
}

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** UTC offset (minutes) of `tz` at the given instant. */
function tzOffsetMinutes(tz: string, at: Date): number {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(at)
        .map((p) => [p.type, p.value]),
    );
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return (asUtc - at.getTime()) / 60000;
  } catch {
    return 0;
  }
}

/** Wall-clock time in `tz` → UTC Date. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const off1 = tzOffsetMinutes(tz, new Date(guess));
  const first = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(tz, new Date(first));
  return new Date(guess - off2 * 60000);
}

interface ParsedTime {
  date: Date; // UTC instant (for all-day: midnight in the home tz)
  allDay: boolean;
  // wall-clock parts, used to step recurrences without DST drift
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  tz: string;
}

function parseTime(prop: Prop | undefined, homeTz: string): ParsedTime | null {
  if (!prop) return null;
  const v = prop.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S, Z] = m;
  const y = +Y, mo = +Mo, d = +D;
  if (!H || prop.params.VALUE === "DATE") {
    return { date: zonedToUtc(y, mo, d, 0, 0, 0, homeTz), allDay: true, y, mo, d, h: 0, mi: 0, s: 0, tz: homeTz };
  }
  const h = +H, mi = +Mi, s = +S;
  if (Z) {
    const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    return { date, allDay: false, y, mo, d, h, mi, s, tz: "UTC" };
  }
  const tz = prop.params.TZID || homeTz;
  return { date: zonedToUtc(y, mo, d, h, mi, s, tz), allDay: false, y, mo, d, h, mi, s, tz };
}

function at(pt: ParsedTime, y: number, mo: number, d: number): Date {
  return zonedToUtc(y, mo, d, pt.h, pt.mi, pt.s, pt.tz);
}

function ymdKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Expand one VEVENT into instances that overlap [from, to). */
function expand(ev: RawEvent, from: Date, to: Date, homeTz: string): { start: Date; end: Date; allDay: boolean; recurKey?: string }[] {
  const start = parseTime(ev.props.DTSTART?.[0], homeTz);
  if (!start) return [];
  const endT = parseTime(ev.props.DTEND?.[0], homeTz);
  let durMs: number;
  if (endT) durMs = endT.date.getTime() - start.date.getTime();
  else if (start.allDay) durMs = 86400000;
  else durMs = 0;

  const rrule = ev.props.RRULE?.[0]?.value;
  if (!rrule) {
    const s = start.date, e = new Date(s.getTime() + durMs);
    return e > from && s < to ? [{ start: s, end: e, allDay: start.allDay }] : [];
  }

  const rule: Record<string, string> = {};
  for (const part of rrule.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) rule[k.toUpperCase()] = v;
  }
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const until = rule.UNTIL ? parseTime({ value: rule.UNTIL, params: {} }, homeTz)?.date : undefined;
  const count = rule.COUNT ? Number(rule.COUNT) : undefined;
  const byDay = rule.BYDAY ? rule.BYDAY.split(",").map((s) => s.replace(/^[+-]?\d+/, "")) : null;
  const byMonthDay = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(",").map(Number) : null;

  const exdates = new Set<string>();
  for (const ex of ev.props.EXDATE ?? []) {
    for (const v of ex.value.split(",")) {
      const t = parseTime({ value: v, params: ex.params }, homeTz);
      if (t) exdates.add(t.date.toISOString());
    }
  }

  const out: { start: Date; end: Date; allDay: boolean; recurKey?: string }[] = [];
  let emitted = 0;
  // Walk day-by-day on the wall-clock calendar from DTSTART. Feeds are small and
  // the window is ~a week, so the cap keeps very old daily series cheap.
  const startDayUtc = Date.UTC(start.y, start.mo - 1, start.d);
  const maxDays = 366 * 15;
  for (let i = 0; i < maxDays; i++) {
    const day = new Date(startDayUtc + i * 86400000);
    const y = day.getUTCFullYear(), mo = day.getUTCMonth() + 1, d = day.getUTCDate();
    const dow = day.getUTCDay();
    const daysFromStart = i;
    let match = false;
    if (freq === "DAILY") {
      match = daysFromStart % interval === 0 && (!byDay || byDay.includes(DAY_CODES[dow]));
    } else if (freq === "WEEKLY") {
      const startDow = new Date(startDayUtc).getUTCDay();
      // weeks start on Monday per RFC default WKST=MO
      const startMonday = startDayUtc - ((startDow + 6) % 7) * 86400000;
      const weekIdx = Math.floor((day.getTime() - startMonday) / (7 * 86400000));
      const days = byDay ?? [DAY_CODES[startDow]];
      match = weekIdx % interval === 0 && days.includes(DAY_CODES[dow]);
    } else if (freq === "MONTHLY") {
      const monthIdx = (y - start.y) * 12 + (mo - start.mo);
      const days = byMonthDay ?? [start.d];
      match = monthIdx % interval === 0 && days.includes(d);
    } else if (freq === "YEARLY") {
      match = (y - start.y) % interval === 0 && mo === start.mo && d === start.d;
    } else {
      break;
    }
    if (!match) continue;
    // Far before the window and nothing to count: skip the (slow) tz math.
    if (count === undefined && day.getTime() + 86400000 * 2 + durMs < from.getTime()) continue;
    const s = at(start, y, mo, d);
    if (s < start.date) continue;
    if (until && s > until) break;
    if (count !== undefined && emitted >= count) break;
    emitted++;
    if (s >= to) break;
    if (exdates.has(s.toISOString())) continue;
    const e = new Date(s.getTime() + durMs);
    if (e > from) out.push({ start: s, end: e, allDay: start.allDay, recurKey: s.toISOString() });
  }
  return out;
}

function parseIcs(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  let depth = 0; // skip nested VALARM etc.
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = { props: {} };
      depth = 0;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("BEGIN:")) {
      depth++;
      continue;
    }
    if (line.startsWith("END:")) {
      if (line === "END:VEVENT" && depth === 0) {
        events.push(cur);
        cur = null;
      } else depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    (cur.props[parsed.name] ||= []).push(parsed.prop);
  }
  return events;
}

/** Events from every feed that overlap [from, to), sorted by start. */
export async function fetchCalendarEvents(urls: string[], from: Date, to: Date, homeTz: string): Promise<CalEvent[]> {
  const texts = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url.replace(/^webcal:/, "https:"), { cache: "no-store" });
        return res.ok ? await res.text() : "";
      } catch {
        return "";
      }
    }),
  );

  const out: CalEvent[] = [];
  for (const text of texts) {
    const raw = parseIcs(text);
    // Moved / edited single instances of a series (RECURRENCE-ID) replace the
    // generated instance at that original time.
    const overridden = new Set<string>();
    for (const ev of raw) {
      const rid = parseTime(ev.props["RECURRENCE-ID"]?.[0], homeTz);
      const uid = ev.props.UID?.[0]?.value;
      if (rid && uid) overridden.add(`${uid}|${rid.date.toISOString()}`);
    }
    for (const ev of raw) {
      const status = ev.props.STATUS?.[0]?.value;
      if (status === "CANCELLED") continue;
      const uid = ev.props.UID?.[0]?.value ?? Math.random().toString(36).slice(2);
      const title = unescapeText(ev.props.SUMMARY?.[0]?.value ?? "(busy)");
      const loc = ev.props.LOCATION?.[0]?.value;
      const isOverride = !!ev.props["RECURRENCE-ID"];
      for (const inst of expand(ev, from, to, homeTz)) {
        if (!isOverride && inst.recurKey && overridden.has(`${uid}|${inst.recurKey}`)) continue;
        out.push({
          id: `${uid}|${inst.start.toISOString()}`,
          title,
          location: loc ? unescapeText(loc) : undefined,
          start: inst.start.toISOString(),
          end: inst.end.toISOString(),
          allDay: inst.allDay,
        });
      }
    }
  }

  // De-dupe the same event appearing on two shared calendars.
  const seen = new Set<string>();
  return out
    .filter((e) => {
      const key = `${e.title.toLowerCase()}|${e.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export { ymdKey };
