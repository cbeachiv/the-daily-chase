// National Weather Service data for home (Mariemont, OH). Free, no key; NWS
// only asks for a descriptive User-Agent.

export const HOME = {
  label: "home, mariemont",
  lat: 39.1453,
  lon: -84.3744,
  tz: "America/New_York",
  grid: "ILN/40,40", // api.weather.gov/points/39.1453,-84.3744
  station: "KLUK", // Lunken Airport, ~4 mi west
  stationName: "lunken",
};

const UA = { "User-Agent": "the-daily-chase weather page", Accept: "application/geo+json" };

export type WxKind = "clear" | "partly" | "cloudy" | "rain" | "storm" | "snow" | "fog" | "wind";

export interface Hour {
  time: string; // ISO
  tempF: number;
  feelsF: number;
  pop: number; // % chance of precipitation
  humidity: number;
  windMph: number;
  windDir: string;
  short: string;
  kind: WxKind;
  isDay: boolean;
}

export interface Day {
  date: string; // YYYY-MM-DD (Eastern)
  name: string; // "Thursday"
  highF: number | null;
  lowF: number | null;
  pop: number;
  short: string;
  detail: string;
  kind: WxKind;
}

export interface Now {
  tempF: number;
  feelsF: number;
  short: string;
  kind: WxKind;
  observedAt: string;
  windMph: number;
}

export interface NwsBundle {
  now: Now;
  hours: Hour[];
  days: Day[];
  issued: string; // hourly forecast update time
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`NWS ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

/** Map an NWS icon URL (…/land/day/tsra,40?size=small) or text to our icon set. */
export function kindOf(icon: string | null | undefined, text = ""): WxKind {
  const code = (icon ?? "").split("/").pop()?.split("?")[0]?.split(",")[0] ?? "";
  const t = text.toLowerCase();
  if (/tsra|tornado|hurricane|tropical/.test(code) || t.includes("thunder")) return "storm";
  if (/snow|sleet|fzra|blizzard|ice/.test(code) || /snow|sleet|flurr|freezing/.test(t)) return "snow";
  if (/rain|shra|drizzle/.test(code) || /rain|shower|drizzle/.test(t)) return "rain";
  if (/fog|haze|smoke|dust/.test(code) || /fog|haze|smoke/.test(t)) return "fog";
  if (/^(sunny|clear)$/.test(t.trim())) return "clear";
  if (/^wind_/.test(code) && !/skc|few/.test(code)) return "wind";
  if (/ovc|bkn/.test(code) || /cloudy|overcast/.test(t) && !/partly|mostly sunny|mostly clear/.test(t)) return "cloudy";
  if (/sct|few/.test(code) || /partly|mostly sunny|mostly clear/.test(t)) return "partly";
  return "clear";
}

/** NWS wind chill (≤50°F, wind ≥3 mph) or Rothfusz heat index (≥80°F). */
export function feelsLike(tempF: number, windMph: number, rh: number): number {
  if (tempF <= 50 && windMph >= 3) {
    const v = Math.pow(windMph, 0.16);
    return Math.round(35.74 + 0.6215 * tempF - 35.75 * v + 0.4275 * tempF * v);
  }
  if (tempF >= 80) {
    const T = tempF, R = rh;
    const hi =
      -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 0.00683783 * T * T -
      0.05481717 * R * R + 0.00122874 * T * T * R + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
    return Math.round(hi);
  }
  return Math.round(tempF);
}

function mph(s: string | null | undefined): number {
  // "6 mph" or "5 to 10 mph" → take the top of the range
  const nums = (s ?? "").match(/\d+/g)?.map(Number) ?? [0];
  return Math.max(...nums);
}

export function easternDate(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HOME.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

interface Period {
  name: string;
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  probabilityOfPrecipitation?: { value: number | null };
  relativeHumidity?: { value: number | null };
  windSpeed?: string;
  windDirection?: string;
  icon?: string;
  shortForecast: string;
  detailedForecast?: string;
}

export async function fetchNws(): Promise<NwsBundle> {
  const base = `https://api.weather.gov/gridpoints/${HOME.grid}`;
  const [hourlyRes, dailyRes, obsRes] = await Promise.all([
    getJson<{ properties: { updateTime: string; periods: Period[] } }>(`${base}/forecast/hourly`),
    getJson<{ properties: { periods: Period[] } }>(`${base}/forecast`),
    getJson<{
      properties: {
        timestamp: string;
        textDescription: string;
        icon: string | null;
        temperature: { value: number | null };
        windSpeed: { value: number | null };
        relativeHumidity: { value: number | null };
      };
    }>(`https://api.weather.gov/stations/${HOME.station}/observations/latest`).catch(() => null),
  ]);

  const nowMs = Date.now();
  const hours: Hour[] = hourlyRes.properties.periods
    .filter((p) => new Date(p.startTime).getTime() > nowMs - 3600000)
    .slice(0, 48)
    .map((p) => {
      const wind = mph(p.windSpeed);
      const rh = p.relativeHumidity?.value ?? 50;
      return {
        time: new Date(p.startTime).toISOString(),
        tempF: p.temperature,
        feelsF: feelsLike(p.temperature, wind, rh),
        pop: p.probabilityOfPrecipitation?.value ?? 0,
        humidity: rh,
        windMph: wind,
        windDir: p.windDirection ?? "",
        short: p.shortForecast,
        kind: kindOf(p.icon, p.shortForecast),
        isDay: p.isDaytime,
      };
    });

  // The 12-hour forecast comes as day/night pairs; fold them into one row per date.
  const byDate = new Map<string, Day>();
  for (const p of dailyRes.properties.periods) {
    const date = easternDate(p.startTime);
    const row =
      byDate.get(date) ??
      ({
        date,
        name: new Intl.DateTimeFormat("en-US", { timeZone: HOME.tz, weekday: "long" }).format(new Date(p.startTime)),
        highF: null,
        lowF: null,
        pop: 0,
        short: p.shortForecast,
        detail: "",
        kind: kindOf(p.icon, p.shortForecast),
      } as Day);
    if (p.isDaytime) {
      row.highF = p.temperature;
      row.short = p.shortForecast;
      row.kind = kindOf(p.icon, p.shortForecast);
      row.detail = p.detailedForecast ?? "";
    } else {
      row.lowF = p.temperature;
      if (!row.detail) row.detail = p.detailedForecast ?? "";
    }
    row.pop = Math.max(row.pop, p.probabilityOfPrecipitation?.value ?? 0);
    byDate.set(date, row);
  }
  const days = [...byDate.values()].slice(0, 8);

  // Today's high/low from the hourly series is more honest than the 12-hour
  // period once the day period has already rolled off in the afternoon.
  const today = easternDate(new Date());
  const todayHours = hours.filter((h) => easternDate(h.time) === today);
  if (days[0]?.date === today && todayHours.length) {
    const temps = todayHours.map((h) => h.tempF);
    days[0].highF = Math.max(days[0].highF ?? -999, ...temps);
    days[0].lowF = days[0].lowF ?? Math.min(...temps);
  }

  const first = hours[0];
  const obs = obsRes?.properties;
  const obsFresh = obs && obs.temperature.value !== null && nowMs - new Date(obs.timestamp).getTime() < 2 * 3600000;
  const tempF = obsFresh ? Math.round((obs!.temperature.value! * 9) / 5 + 32) : first.tempF;
  const windMph = obsFresh && obs!.windSpeed.value !== null ? Math.round(obs!.windSpeed.value! / 1.609) : first.windMph;
  const rh = (obsFresh && obs!.relativeHumidity.value) || first.humidity;
  const short = (obsFresh && obs!.textDescription) || first.short;

  return {
    now: {
      tempF,
      feelsF: feelsLike(tempF, windMph, rh),
      short,
      kind: obsFresh && obs!.textDescription ? kindOf(obs!.icon, short) : first.kind,
      observedAt: obsFresh ? obs!.timestamp : first.time,
      windMph,
    },
    hours,
    days,
    issued: hourlyRes.properties.updateTime,
  };
}

/** Sunrise / sunset for a date at home (NOAA solar equations, ~1 min accuracy). */
export function sunTimes(dateStr: string): { sunrise: string; sunset: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const rad = Math.PI / 180;
  const n = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const lngHour = HOME.lon / 15;
  const calc = (rising: boolean): string => {
    const t = n + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634;
    L = (L + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
    RA = (RA + 360) % 360;
    RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
    RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(HOME.lat * rad)) / (cosDec * Math.cos(HOME.lat * rad));
    let H = Math.acos(cosH) / rad;
    if (rising) H = 360 - H;
    H /= 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = (((T - lngHour) % 24) + 24) % 24;
    return new Date(Date.UTC(y, m - 1, d) + UT * 3600000).toISOString();
  };
  return { sunrise: calc(true), sunset: calc(false) };
}
