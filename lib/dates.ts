// All day-level data uses a local "YYYY-MM-DD" string so carryover and
// daily rollups are timezone-stable and easy to query/sort as strings.

export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

// Monday-based start of the week containing `dateStr`.
export function startOfWeek(dateStr: string = todayStr()): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return todayStr(d);
}

// First day of the month containing `dateStr`.
export function startOfMonth(dateStr: string = todayStr()): string {
  return dateStr.slice(0, 7) + "-01";
}

// Saturday that closes the Monday-based week containing `dateStr`.
export function weekEndingSaturday(dateStr: string = todayStr()): string {
  return addDays(startOfWeek(dateStr), 5);
}

// "2026-06-05" -> "6/5/26"
export function shortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

export function prettyDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ISO timestamp -> "2:15 PM"
export function prettyTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Hours between an "HH:MM" bedtime and wake time, wrapping past midnight.
// e.g. "23:30" -> "07:00" = 7.5
export function sleepHours(bedtime: string, wakeTime: string): number | null {
  const parse = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const bed = parse(bedtime);
  const wake = parse(wakeTime);
  if (bed === null || wake === null) return null;
  let mins = wake - bed;
  if (mins <= 0) mins += 24 * 60; // wrapped past midnight
  return Math.round((mins / 60) * 10) / 10;
}

export function prettyDateLong(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Annie's birthdate — the anchor for her age on the Annie page.
export const ANNIE_BORN = "2025-07-14";

// Human age string, e.g. "11 months, 5 days old" or "1 year, 2 months old".
// Counts whole years/months by walking the calendar so month lengths are honored.
export function ageString(born: string = ANNIE_BORN, today: string = todayStr()): string {
  const b = new Date(born + "T00:00:00");
  const now = new Date(today + "T00:00:00");
  if (now <= b) return "newborn";

  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  let days = now.getDate() - b.getDate();

  if (days < 0) {
    months -= 1;
    // days in the month before `now` — borrow from it
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonth;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (years > 0) parts.push(plural(years, "year"));
  // Below a year, lead with months; above a year, show years + months.
  if (years > 0 || months > 0) parts.push(plural(months, "month"));
  // Only show days when they add meaningful precision (under a year, or as the tail).
  if (years === 0) parts.push(plural(days, "day"));

  return parts.join(", ") + " old";
}

// Whole months old on a given date, rounded to the nearest month — for the
// "Age Update" badge (e.g. a photo taken near her 3-month mark reads "3 months").
export function monthsOld(date: string, born: string = ANNIE_BORN): number {
  const b = new Date(born + "T00:00:00");
  const d = new Date(date + "T00:00:00");
  let months = (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth());
  if (d.getDate() >= b.getDate() + 15) months += 1; // past mid-month rounds up
  else if (d.getDate() < b.getDate() - 15) months -= 1;
  return Math.max(0, months);
}

// "3 months" / "1 month" / "1 year, 2 months" — compact age label for badges.
export function ageLabel(date: string, born: string = ANNIE_BORN): string {
  const m = monthsOld(date, born);
  if (m < 12) return `${m} month${m === 1 ? "" : "s"}`;
  const years = Math.floor(m / 12);
  const rem = m % 12;
  const y = `${years} year${years === 1 ? "" : "s"}`;
  return rem === 0 ? y : `${y}, ${rem} month${rem === 1 ? "" : "s"}`;
}
