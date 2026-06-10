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

export function prettyDateLong(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
