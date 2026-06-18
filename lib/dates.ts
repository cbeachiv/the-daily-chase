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
