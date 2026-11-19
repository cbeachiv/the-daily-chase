// Builds the morning weather report: NWS data + calendar + plan/travel context,
// then one Claude call that writes the personal prose (headline, paragraph,
// chips, and a line of advice for each event). Server-only.

import { adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { CUT, CUT_END, planDayFor } from "@/lib/cutPlan";
import type { Travel } from "@/lib/types";
import { fetchCalendarEvents, type CalEvent } from "./ics";
import { easternDate, fetchNws, HOME, sunTimes, type Day, type Hour, type Now, type WxKind } from "./nws";

export interface ReportEvent extends CalEvent {
  wx?: { tempF: number; feelsF: number; short: string; kind: WxKind; windMph: number; windDir: string; pop: number };
  note?: string;
}

export interface WeatherReport {
  generatedAt: string;
  date: string; // Eastern YYYY-MM-DD
  location: string;
  now: Now;
  today: Day | null;
  sun: { sunrise: string; sunset: string };
  hours: Hour[];
  days: Day[];
  events: ReportEvent[];
  calendarConnected: boolean;
  travelLine: string; // "no travel on your calendar till nov 23"
  issued: string;
  writeup: {
    headline: string; // "62° & sunny,"
    accent: string; // "another clean blue day"
    summary: string; // paragraph; *asterisks* mark the italic accents
    umbrella: string;
    wear: string;
    bestWindow: string;
  };
  plan: { title: string; detail: string } | null;
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: HOME.tz, hour: "numeric", minute: "2-digit" })
    .format(new Date(iso))
    .replace(":00", "")
    .replace(" AM", "am")
    .replace(" PM", "pm");

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: HOME.tz, weekday: "short", month: "short", day: "numeric" })
    .format(new Date(iso))
    .toLowerCase();

function calendarUrls(): string[] {
  return (process.env.WEATHER_CALENDAR_ICS_URLS ?? "")
    // Separate on commas/whitespace only before a new URL (URLs may contain commas).
    .split(/[\s,]+(?=(?:https?|webcal|data):)/)
    .map((s) => s.trim().replace(/,$/, ""))
    .filter(Boolean);
}

/** The forecast hour an event starts in (or the nearest one). */
function hourFor(hours: Hour[], iso: string): Hour | undefined {
  const t = new Date(iso).getTime();
  let best: Hour | undefined;
  let bestGap = Infinity;
  for (const h of hours) {
    const gap = Math.abs(new Date(h.time).getTime() - t);
    if (gap < bestGap) {
      best = h;
      bestGap = gap;
    }
  }
  return bestGap <= 90 * 60000 ? best : undefined;
}

const FLY = /\b(flight|fly|flies|airport|cvg|depart|boarding|[A-Z]{2}\s?\d{2,4})\b/i;

async function loadTravel(uid: string): Promise<Travel[]> {
  try {
    const snap = await adminDb().collection(`users/${uid}/travel`).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Travel);
  } catch {
    return [];
  }
}

function travelLineFor(today: string, trips: Travel[], events: CalEvent[]): { line: string; context: string } {
  const upcoming = trips
    .filter((t) => (t.endDate || t.startDate) >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const onTrip = upcoming.find((t) => t.startDate <= today);
  const flightEvent = events.find((e) => FLY.test(e.title));
  const next = upcoming.find((t) => t.startDate > today);

  const md = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();

  if (onTrip) {
    return {
      line: `traveling: ${onTrip.destination.toLowerCase()} through ${md(onTrip.endDate || onTrip.startDate)}`,
      context: `He is currently on a trip to ${onTrip.destination} (${onTrip.startDate} to ${onTrip.endDate}). The forecast below is for home in Mariemont, so say so briefly.`,
    };
  }
  if (flightEvent) {
    return {
      line: `you fly ${fmtDay(flightEvent.start)}`,
      context: `Calendar shows travel: "${flightEvent.title}" on ${fmtDay(flightEvent.start)} at ${fmtTime(flightEvent.start)}.`,
    };
  }
  if (next) {
    return {
      line: `no travel till ${md(next.startDate)}`,
      context: `Next trip: ${next.destination}, ${next.startDate} to ${next.endDate}. Mention it only if it falls inside the 7-day forecast.`,
    };
  }
  return { line: "no travel on the books", context: "No upcoming travel." };
}

interface Writeup extends Omit<WeatherReport["writeup"], never> {
  eventNotes?: Record<string, string>;
}

function fallbackWriteup(now: Now, today: Day | null, hours: Hour[]): Writeup {
  const todays = hours.slice(0, 16);
  const maxPop = Math.max(0, ...todays.map((h) => h.pop));
  const warmest = [...todays].sort((a, b) => b.tempF - a.tempF)[0];
  return {
    headline: `${today?.highF ?? now.tempF}° & ${(today?.short ?? now.short).toLowerCase()},`,
    accent: "here's your day",
    summary: `about ${now.tempF} now, feels ${now.feelsF}. ${today?.detail ?? ""}`.trim(),
    umbrella: maxPop >= 40 ? `yes, up to ${maxPop}% today` : maxPop >= 20 ? `maybe, ${maxPop}% at worst` : `no, ${maxPop}% all day`,
    wear: now.feelsF < 35 ? "a real coat" : now.feelsF < 50 ? "a sweater or light jacket" : now.feelsF < 65 ? "long sleeves" : "a t-shirt",
    bestWindow: warmest ? `around ${fmtTime(warmest.time)}, ${warmest.tempF}°` : "",
  };
}

async function writeWithClaude(input: {
  nowLine: string;
  today: Day | null;
  days: Day[];
  hours: Hour[];
  sun: { sunrise: string; sunset: string };
  events: ReportEvent[];
  plan: { title: string; detail: string } | null;
  travelContext: string;
  localNow: string;
}): Promise<Writeup> {
  const hourLines = input.hours
    .slice(0, 30)
    .map((h) => `${fmtDay(h.time)} ${fmtTime(h.time)}: ${h.tempF}° (feels ${h.feelsF}), ${h.short}, ${h.pop}% rain, wind ${h.windDir} ${h.windMph} mph`)
    .join("\n");
  const dayLines = input.days
    .map((d) => `${d.name} ${d.date}: high ${d.highF ?? "?"} / low ${d.lowF ?? "?"}, ${d.short}, ${d.pop}% precip. ${d.detail}`)
    .join("\n");
  const eventLines = input.events.length
    ? input.events
        .map(
          (e) =>
            `[${e.id}] ${fmtDay(e.start)} ${e.allDay ? "all day" : fmtTime(e.start) + " to " + fmtTime(e.end)}: ${e.title}${e.location ? ` @ ${e.location}` : ""}${
              e.wx ? ` | weather then: ${e.wx.tempF}° feels ${e.wx.feelsF}, ${e.wx.short}, ${e.wx.pop}% rain, wind ${e.wx.windDir} ${e.wx.windMph}` : ""
            }`,
        )
        .join("\n")
    : "(no calendar connected or nothing scheduled)";

  const prompt = `You write Chase's personal morning weather report. He lives in Mariemont, Ohio (a walkable village east of Cincinnati) and walks most places in the village. It is ${input.localNow} Eastern.

Voice: all lowercase, warm, specific, confident, like a friend who checked everything for him. Short clauses. Use real numbers. NEVER use em dashes or en dashes; use commas, periods, or colons instead. No emoji.

NOW: ${input.nowLine}
SUN: rises ${fmtTime(input.sun.sunrise)}, sets ${fmtTime(input.sun.sunset)}
TRAVEL: ${input.travelContext}
TODAY'S TRAINING PLAN: ${input.plan ? `${input.plan.title}. ${input.plan.detail}` : "none"}

HOURLY (NWS):
${hourLines}

NEXT DAYS (NWS):
${dayLines}

CALENDAR, NEXT 7 DAYS:
${eventLines}

Return ONLY a JSON object, no markdown fence:
{
  "headline": "the day's high and sky, e.g. \\"62° & sunny,\\" (keep the trailing comma)",
  "accent": "3 to 5 word poetic tail that completes the headline, e.g. \\"another clean blue day\\"",
  "summary": "one paragraph, 60 to 90 words: conditions now, the arc of the day with times and temps, wind, sundown, tonight's low, then the next few days and anything coming that matters to his plans (rain on a day he has something outside, travel, a cold snap). Wrap 1 to 3 short phrases in *asterisks* for italic emphasis, e.g. *63 thu, 66 fri*.",
  "umbrella": "e.g. \\"no, 0% all day\\" or \\"yes, after 3pm, 70%\\"",
  "wear": "what to wear tied to his actual first outing, e.g. \\"sweater for the 9am gym walk, a shirt by noon\\"",
  "bestWindow": "best time to be outside today, e.g. \\"12 to 4pm, 59 to 62°\\"",
  "eventNotes": { "<event id exactly as given in brackets>": "one short line of advice for that event, using the \"weather then\" numbers when given (otherwise that day's forecast), e.g. \\"a sweater on the walk over, you'll shed it after.\\" Use an empty string for indoor/virtual/all-day events where weather does not matter." }
}`;

  const msg = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = textOf(msg);
  const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Writeup;
  const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s*[—–]\s*/g, ", ").trim() : "");
  return {
    headline: clean(json.headline),
    accent: clean(json.accent),
    summary: clean(json.summary),
    umbrella: clean(json.umbrella),
    wear: clean(json.wear),
    bestWindow: clean(json.bestWindow),
    eventNotes: Object.fromEntries(Object.entries(json.eventNotes ?? {}).map(([k, v]) => [k, clean(v)])),
  };
}

export async function buildReport(uid: string): Promise<WeatherReport> {
  const now = new Date();
  const today = easternDate(now);
  const weekOut = new Date(now.getTime() + 7 * 86400000);
  const urls = calendarUrls();

  const [nws, events, trips] = await Promise.all([
    fetchNws(),
    urls.length ? fetchCalendarEvents(urls, now, weekOut, HOME.tz).catch(() => [] as CalEvent[]) : Promise.resolve([] as CalEvent[]),
    loadTravel(uid),
  ]);

  const reportEvents: ReportEvent[] = events.slice(0, 25).map((e) => {
    const h = e.allDay ? undefined : hourFor(nws.hours, e.start);
    return h
      ? { ...e, wx: { tempF: h.tempF, feelsF: h.feelsF, short: h.short, kind: h.kind, windMph: h.windMph, windDir: h.windDir, pop: h.pop } }
      : e;
  });

  const todayRow = nws.days.find((d) => d.date === today) ?? null;
  const sun = sunTimes(today);
  const pd = today >= CUT.start && today <= CUT_END ? planDayFor(today) : null;
  const plan = pd && pd.kind !== "rest" ? { title: pd.title, detail: pd.detail } : null;
  const travel = travelLineFor(today, trips, events);
  const localNow = new Intl.DateTimeFormat("en-US", {
    timeZone: HOME.tz,
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  const nowLine = `${nws.now.tempF}° (feels ${nws.now.feelsF}), ${nws.now.short}, wind ${nws.now.windMph} mph, observed ${fmtTime(nws.now.observedAt)} at Lunken. Today high ${todayRow?.highF ?? "?"}, low ${todayRow?.lowF ?? "?"}.`;

  let writeup: Writeup;
  try {
    writeup = await writeWithClaude({
      nowLine,
      today: todayRow,
      days: nws.days,
      hours: nws.hours,
      sun,
      events: reportEvents,
      plan,
      travelContext: travel.context,
      localNow,
    });
  } catch (err) {
    console.error("weather writeup failed", err);
    writeup = fallbackWriteup(nws.now, todayRow, nws.hours);
  }

  const notes = writeup.eventNotes ?? {};
  delete writeup.eventNotes;

  return {
    generatedAt: now.toISOString(),
    date: today,
    location: HOME.label,
    now: nws.now,
    today: todayRow,
    sun,
    hours: nws.hours.slice(0, 36),
    days: nws.days,
    events: reportEvents.map((e) => (notes[e.id] ? { ...e, note: notes[e.id] } : e)),
    calendarConnected: urls.length > 0,
    travelLine: travel.line,
    issued: nws.issued,
    writeup,
    plan,
  };
}

/** Cached per user per day; regenerated when older than `maxAgeMin`. */
export async function getReport(uid: string, opts: { refresh?: boolean; maxAgeMin?: number } = {}): Promise<WeatherReport> {
  const maxAge = (opts.maxAgeMin ?? 45) * 60000;
  const today = easternDate(new Date());
  const ref = adminDb().doc(`users/${uid}/weatherReports/${today}`);
  if (!opts.refresh) {
    const snap = await ref.get();
    const cached = snap.exists ? (snap.data() as WeatherReport) : null;
    if (cached && Date.now() - new Date(cached.generatedAt).getTime() < maxAge) return cached;
  }
  const report = await buildReport(uid);
  // Firestore rejects `undefined` fields; JSON round-trip strips them.
  await ref.set(JSON.parse(JSON.stringify(report)));
  return report;
}
