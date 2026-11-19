"use client";

import { Fragment } from "react";
import { EB_Garamond } from "next/font/google";
import WxIcon from "@/components/weather/WxIcon";
import type { WeatherReport, ReportEvent } from "@/lib/weather/report";
import type { Hour, Day } from "@/lib/weather/nws";

const serif = EB_Garamond({ subsets: ["latin"], style: ["normal", "italic"] });

const TZ = "America/New_York";
export const C = {
  bg: "#1c1916",
  ink: "#efe7dc",
  soft: "#c9c0b4",
  muted: "#8a8279",
  faint: "#5c564f",
  chip: "#2a2622",
  line: "#3a342e",
  accent: "#e39a72",
  rain: "#7fb2e5",
};

function t(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts }).format(new Date(iso));
}
const clock = (iso: string) =>
  t(iso, { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" AM", "am").replace(" PM", "pm");
const hourLabel = (iso: string) => t(iso, { hour: "numeric" }).replace(" AM", "a").replace(" PM", "p");

/** Render *asterisk* spans as the accent italic. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <em key={i} className="italic" style={{ color: C.ink }}>
            {p}
          </em>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function Skeleton() {
  return (
    <div className="animate-pulse space-y-6 py-4">
      <div className="h-4 w-64 rounded" style={{ background: C.chip }} />
      <div className="h-28 w-48 rounded" style={{ background: C.chip }} />
      <div className="h-10 w-80 rounded" style={{ background: C.chip }} />
      <div className="h-32 w-full rounded" style={{ background: C.chip }} />
      <p className="text-sm tracking-wide" style={{ color: C.muted }}>
        checking the sky, your calendar, and the week ahead…
      </p>
    </div>
  );
}

export default function WeatherReportView({ r, onRefresh, refreshing }: { r: WeatherReport; onRefresh: () => void; refreshing: boolean }) {
  const dateLine = t(r.generatedAt, { weekday: "long", month: "short", day: "numeric" }).toLowerCase();
  const today = r.today;
  const isDayNow = new Date() > new Date(r.sun.sunrise) && new Date() < new Date(r.sun.sunset);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 text-[15px] tracking-[0.14em] sm:text-lg" style={{ color: C.soft }}>
        <span style={{ color: C.accent }}>
          <WxIcon kind={r.now.kind} isDay={isDayNow} size={22} />
        </span>
        <span>
          {dateLine} <span style={{ color: C.faint }}>·</span> {r.location}
        </span>
      </div>
      <p className="mt-2 text-[15px] tracking-[0.14em] sm:text-lg" style={{ color: C.muted }}>
        {r.travelLine}
      </p>

      {/* Big temperature */}
      <div className={`${serif.className} mt-4 flex items-start leading-none`}>
        <span className="text-[128px] font-normal tracking-tight sm:text-[176px]">{r.now.tempF}</span>
        <span className="mt-4 text-4xl sm:mt-6 sm:text-6xl" style={{ color: C.soft }}>
          °F
        </span>
      </div>

      {/* Condition */}
      <div className="mt-6 flex items-center gap-5">
        <span style={{ color: C.accent }}>
          <WxIcon kind={r.now.kind} isDay={isDayNow} size={64} strokeWidth={1.4} />
        </span>
        <div>
          <p className={`${serif.className} text-3xl sm:text-4xl`}>{r.now.short.toLowerCase()}</p>
          <p className="mt-1 text-lg tracking-wide" style={{ color: C.soft }}>
            feels {r.now.feelsF}°{today?.highF != null && <> · high {today.highF}°</>}
            {today?.lowF != null && <> · low {today.lowF}°</>}
          </p>
        </div>
      </div>

      {/* Headline + paragraph */}
      <h1 className={`${serif.className} mt-12 text-5xl leading-[1.08] sm:text-6xl`}>
        {r.writeup.headline}{" "}
        <em className="italic" style={{ color: C.accent }}>
          {r.writeup.accent}
        </em>
      </h1>
      <p className={`${serif.className} mt-8 text-[22px] leading-[1.6] sm:text-[26px]`} style={{ color: C.soft }}>
        <Rich text={r.writeup.summary} />
      </p>

      {/* Chips */}
      <div className="mt-10 flex flex-col items-start gap-3">
        <Chip icon={<UmbrellaIcon />} label="umbrella" text={r.writeup.umbrella} />
        <Chip icon={<ShirtIcon />} label="wear" text={r.writeup.wear} />
        {r.writeup.bestWindow && (
          <Chip icon={<WxIcon kind="clear" size={20} />} text={`best window ${r.writeup.bestWindow}`} accent />
        )}
      </div>

      <HourByHour hours={r.hours} issued={r.issued} sun={r.sun} />
      <YourDay events={r.events} connected={r.calendarConnected} plan={r.plan} />
      <TheWeek days={r.days} />

      {/* Footer */}
      <div
        className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm tracking-wide"
        style={{ borderColor: C.line, color: C.muted }}
      >
        <span>
          sunrise {clock(r.sun.sunrise)} · sunset {clock(r.sun.sunset)} · written {clock(r.generatedAt)}
        </span>
        <button onClick={onRefresh} disabled={refreshing} style={{ color: C.accent }} className="disabled:opacity-50">
          {refreshing ? "rewriting…" : "refresh"}
        </button>
      </div>
    </div>
  );
}

function Chip({ icon, label, text, accent }: { icon: React.ReactNode; label?: string; text: string; accent?: boolean }) {
  return (
    <div
      className="inline-flex items-center gap-3 rounded-full px-5 py-3 text-lg tracking-wide sm:text-xl"
      style={{
        background: accent ? "rgba(227,154,114,0.16)" : C.chip,
        color: accent ? C.accent : C.soft,
      }}
    >
      <span style={{ color: accent ? C.accent : C.soft }}>{icon}</span>
      <span>
        {label && <span style={{ color: C.ink }}>{label} </span>}
        {text}
      </span>
    </div>
  );
}

function UmbrellaIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 18 0zM12 12v7a2 2 0 0 1-4 0" />
    </svg>
  );
}

function ShirtIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3l-5 3 2 4 2-1v12h8V9l2 1 2-4-5-3a3 3 0 0 1-6 0z" />
    </svg>
  );
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mt-20 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <h2 className={`${serif.className} text-5xl sm:text-6xl`}>{title}</h2>
      <p className="text-base tracking-[0.12em]" style={{ color: C.muted }}>
        {sub}
      </p>
    </div>
  );
}

function HourByHour({ hours, issued, sun }: { hours: Hour[]; issued: string; sun: { sunrise: string; sunset: string } }) {
  const list = hours.slice(0, 24);
  if (!list.length) return null;
  const COL = 76;
  const W = COL * list.length;
  const H = 150;
  const temps = list.map((h) => h.tempF);
  const min = Math.min(...temps), max = Math.max(...temps);
  const span = Math.max(4, max - min);
  const y = (f: number) => 46 + (1 - (f - min) / span) * (H - 76);
  const pts = list.map((h, i) => [i * COL + COL / 2, y(h.tempF)] as const);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px} ${py}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H} Z`;
  const sunsetMs = new Date(sun.sunset).getTime();
  const issuedLabel = `${clock(issued)} ${t(issued, { weekday: "short" }).toLowerCase()}`;

  return (
    <section>
      <SectionHead title="Hour by hour" sub={`nws hourly, mariemont, issued ${issuedLabel}`} />
      <div className="mt-8 border-t" style={{ borderColor: C.soft }} />
      <div className="-mx-2 overflow-x-auto px-2 pb-2 [scrollbar-width:thin]">
        <div style={{ width: W }}>
          <svg width={W} height={H} className="block">
            <defs>
              <linearGradient id="wxArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={C.accent} stopOpacity="0.22" />
                <stop offset="1" stopColor={C.accent} stopOpacity="0.04" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#wxArea)" />
            <path d={line} fill="none" stroke={C.accent} strokeWidth="2" />
            {pts.map(([px, py], i) => (
              <g key={i}>
                <circle cx={px} cy={py} r="5" fill={C.bg} stroke={C.accent} strokeWidth="2" />
                <text x={px} y={py - 14} textAnchor="middle" fill={C.ink} fontSize="19" letterSpacing="0.5">
                  {list[i].tempF}°
                </text>
              </g>
            ))}
          </svg>
          <div className="flex">
            {list.map((h, i) => {
              const ms = new Date(h.time).getTime();
              const isSunset = ms <= sunsetMs && sunsetMs < ms + 3600000;
              return (
                <div key={h.time} className="flex flex-col items-center gap-3 pt-4" style={{ width: COL }}>
                  <span style={{ color: C.accent }}>
                    <WxIcon kind={h.kind} isDay={h.isDay} size={30} strokeWidth={1.5} />
                  </span>
                  <span className="text-lg tracking-wide" style={{ color: h.pop > 0 ? C.rain : C.muted }}>
                    {h.pop}%
                  </span>
                  <span className="text-lg tracking-wide" style={{ color: i === 0 ? C.accent : C.soft }}>
                    {i === 0 ? "now" : hourLabel(h.time)}
                  </span>
                  {isSunset && (
                    <span className="-mt-2 text-[11px] tracking-wider" style={{ color: C.muted }}>
                      sunset
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 border-t" style={{ borderColor: C.line }} />
      <p className="mt-6 text-lg tracking-wide" style={{ color: C.muted }}>
        <span style={{ color: C.rain }}>blue figures</span> are the chance of rain each hour. scroll sideways for more.
      </p>
    </section>
  );
}

function YourDay({
  events,
  connected,
  plan,
}: {
  events: ReportEvent[];
  connected: boolean;
  plan: { title: string; detail: string } | null;
}) {
  return (
    <section>
      <SectionHead title="Your day" sub={connected ? "calendars, next 7 days" : "training plan"} />
      <div className="mt-10">
        {plan && (
          <TimelineRow
            left={<>today</>}
            title={plan.title.toLowerCase()}
            sub="the cut plan"
            note={plan.detail.toLowerCase()}
            first
            last={!events.length}
          />
        )}
        {events.map((e, i) => (
          <TimelineRow
            key={e.id}
            left={
              <>
                {e.allDay ? "all day" : clock(e.start)}
                <br />
                <span style={{ color: C.muted }}>{t(e.start, { weekday: "short" }).toLowerCase()}</span>
              </>
            }
            title={e.title.toLowerCase()}
            sub={e.location?.split(",")[0]?.toLowerCase()}
            wx={e.wx}
            note={e.note}
            first={!plan && i === 0}
            last={i === events.length - 1}
          />
        ))}
        {connected && !events.length && !plan && (
          <p className="text-lg" style={{ color: C.muted }}>
            nothing on the calendar this week.
          </p>
        )}
        {!connected && (
          <p className="mt-6 text-base leading-relaxed tracking-wide" style={{ color: C.muted }}>
            connect your calendar to get weather for each event: in google calendar, settings → your calendar →
            &ldquo;secret address in ical format,&rdquo; then add it to vercel as{" "}
            <code style={{ color: C.soft }}>WEATHER_CALENDAR_ICS_URLS</code> (comma separated for more than one).
          </p>
        )}
      </div>
    </section>
  );
}

function TimelineRow({
  left,
  title,
  sub,
  wx,
  note,
  first,
  last,
}: {
  left: React.ReactNode;
  title: string;
  sub?: string;
  wx?: ReportEvent["wx"];
  note?: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div className="grid grid-cols-[72px_28px_1fr] gap-x-3 sm:grid-cols-[96px_36px_1fr] sm:gap-x-4">
      <div className="pt-1 text-right text-xl leading-snug tracking-wide sm:text-2xl" style={{ color: C.soft }}>
        {left}
      </div>
      <div className="relative flex justify-center">
        {!last && <div className="absolute bottom-0 top-3 w-px" style={{ background: C.line }} />}
        <div
          className="relative mt-2 h-4 w-4 rounded-full"
          style={{ background: first ? C.accent : C.bg, border: `2px solid ${first ? "rgba(227,154,114,.35)" : C.faint}` }}
        />
      </div>
      <div className="pb-10">
        <p className="text-2xl tracking-wide sm:text-[28px]" style={{ color: C.ink }}>
          {title}
        </p>
        {sub && (
          <p className="mt-1 text-xl tracking-wide" style={{ color: C.muted }}>
            {sub}
          </p>
        )}
        {wx && (
          <p className="mt-3 flex items-center gap-3 text-lg tracking-wide sm:text-xl" style={{ color: C.soft }}>
            <span style={{ color: C.accent }}>
              <WxIcon kind={wx.kind} size={26} />
            </span>
            {wx.tempF}°, feels {wx.feelsF}, {wx.short.toLowerCase()}
            {wx.pop >= 20 ? `, ${wx.pop}% rain` : ""}
            {wx.windMph >= 5 ? `, ${dir(wx.windDir)} wind ${wx.windMph} mph` : ""}
          </p>
        )}
        {note && (
          <p className={`${serif.className} mt-2 flex gap-2 text-xl leading-snug sm:text-2xl`} style={{ color: C.soft }}>
            <span style={{ color: C.faint }}>↳</span>
            <span>
              <em className="italic" style={{ color: C.ink }}>
                {note}
              </em>
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

const DIRS: Record<string, string> = { N: "north", S: "south", E: "east", W: "west" };
function dir(d: string) {
  if (DIRS[d]) return DIRS[d];
  return d.toLowerCase();
}

function TheWeek({ days }: { days: Day[] }) {
  const rows = days.filter((d) => d.highF != null || d.lowF != null).slice(0, 7);
  if (!rows.length) return null;
  const lows = rows.map((d) => d.lowF ?? d.highF!);
  const highs = rows.map((d) => d.highF ?? d.lowF!);
  const min = Math.min(...lows), max = Math.max(...highs);
  const span = Math.max(1, max - min);

  return (
    <section>
      <SectionHead title="The week" sub="nws 7-day" />
      <div className="mt-8">
        {rows.map((d, i) => {
          const lo = d.lowF ?? d.highF!, hi = d.highF ?? d.lowF!;
          return (
            <div
              key={d.date}
              className="grid grid-cols-[64px_36px_1fr] items-center gap-x-3 border-t py-4 sm:grid-cols-[110px_40px_44px_1fr_44px_1.2fr] sm:gap-x-4"
              style={{ borderColor: C.line }}
            >
              <span className="text-xl tracking-wide" style={{ color: i === 0 ? C.accent : C.ink }}>
                {i === 0 ? "today" : d.name.slice(0, 3).toLowerCase()}
              </span>
              <span className="flex flex-col items-center" style={{ color: C.accent }}>
                <WxIcon kind={d.kind} size={26} />
                {d.pop >= 20 && (
                  <span className="text-xs" style={{ color: C.rain }}>
                    {d.pop}%
                  </span>
                )}
              </span>
              <div className="flex items-center gap-3 sm:contents">
                <span className="w-9 text-right text-lg sm:w-auto" style={{ color: C.muted }}>
                  {lo}°
                </span>
                <div className="relative h-1.5 flex-1 rounded-full" style={{ background: C.chip }}>
                  <div
                    className="absolute h-full rounded-full"
                    style={{
                      left: `${((lo - min) / span) * 100}%`,
                      width: `${Math.max(4, ((hi - lo) / span) * 100)}%`,
                      background: `linear-gradient(90deg, #c9a27c, ${C.accent})`,
                    }}
                  />
                </div>
                <span className="w-9 text-lg sm:w-auto" style={{ color: C.ink }}>
                  {hi}°
                </span>
              </div>
              <span className="col-span-3 mt-1 text-base tracking-wide sm:col-span-1 sm:mt-0" style={{ color: C.muted }}>
                {d.short.toLowerCase()}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
