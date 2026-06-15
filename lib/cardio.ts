// Cardio logging — outdoor run, treadmill run, or any other activity
// (pickleball, tennis, …). Stored in Firestore users/{uid}/cardio.

export type CardioKind = "outdoor" | "treadmill" | "other";

export const CARDIO_KIND_LABEL: Record<CardioKind, string> = {
  outdoor: "Outdoor run",
  treadmill: "Treadmill",
  other: "Other",
};

export interface CardioLog {
  id: string;
  date: string; // YYYY-MM-DD
  dateTime: string; // YYYY-MM-DD HH:mm:ss (sortable, local)
  kind: CardioKind;
  durationMin: number; // how long, in minutes (all kinds)
  // treadmill
  inclinePct?: number; // incline grade %
  speedMph?: number; // speed in mph
  // outdoor
  pace?: string; // "MM:SS" per mile
  // other
  activity?: string; // e.g. "Pickleball", "Tennis"
  notes?: string; // free-text notes (used for "other" activities)
  createdAt: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Accept "30", "30:00", or "1:05:30" → minutes (float). */
export function parseDurationToMin(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  if (t.includes(":")) {
    const parts = t.split(":").map((p) => parseFloat(p) || 0);
    if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
    if (parts.length === 2) return parts[0] + parts[1] / 60;
  }
  return parseFloat(t) || 0;
}

/** "8:30" → 8.5 minutes. */
export function paceToMin(pace: string): number {
  return parseDurationToMin(pace);
}

/** minutes (float) → "M:SS" or "H:MM:SS". */
export function fmtClock(min: number): string {
  const total = Math.round(min * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** minutes-per-mile (float) → "M:SS". */
export function fmtPace(minPerMile: number): string {
  if (!isFinite(minPerMile) || minPerMile <= 0) return "—";
  let m = Math.floor(minPerMile);
  let s = Math.round((minPerMile - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${pad(s)}`;
}

/** Distance in miles, derived from the logged fields (null if not derivable). */
export function cardioDistanceMi(c: CardioLog): number | null {
  if (c.kind === "treadmill" && c.speedMph && c.durationMin) {
    return c.speedMph * (c.durationMin / 60);
  }
  if (c.kind === "outdoor" && c.pace) {
    const pm = paceToMin(c.pace);
    if (pm > 0 && c.durationMin) return c.durationMin / pm;
  }
  return null;
}

/** Pace in min/mile (treadmill derived from speed); null for "other". */
export function cardioPaceMin(c: CardioLog): number | null {
  if (c.kind === "treadmill" && c.speedMph) return 60 / c.speedMph;
  if (c.kind === "outdoor" && c.pace) {
    const pm = paceToMin(c.pace);
    return pm > 0 ? pm : null;
  }
  return null;
}

/** Newest-first. */
export function cardioDesc(items: CardioLog[]): CardioLog[] {
  return [...items].sort((a, b) => b.dateTime.localeCompare(a.dateTime));
}
