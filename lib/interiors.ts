// Pure helpers for the Sarah Beach Interiors tab. Earnings come from the flat
// design fee plus billable (purchase/install management) hours; design hours are
// tracked for time spent only and never roll into money.
import type { DesignClient, DesignHoursEntry } from "@/lib/types";

export interface HourTotals {
  design: number; // hours covered by the flat fee
  billable: number; // hours billed at the client's hourlyRate
}

/** Sum each client's hours into design vs billable buckets, keyed by clientId. */
export function hoursByClient(entries: DesignHoursEntry[]): Record<string, HourTotals> {
  const out: Record<string, HourTotals> = {};
  for (const e of entries) {
    const t = (out[e.clientId] ??= { design: 0, billable: 0 });
    if (e.kind === "billable") t.billable += e.hours;
    else t.design += e.hours;
  }
  return out;
}

/** Total earnings for a client: flat fee + billable hours × rate. */
export function clientEarnings(client: DesignClient, billableHours: number): number {
  return client.designFee + billableHours * (client.hourlyRate ?? 0);
}

/** Round hours to at most 2 decimals and drop trailing zeros (3.50 → "3.5"). */
export function formatHours(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** US dollars, no cents when whole ($2,950), cents otherwise ($1,562.50). */
export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Today's local date as YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Fuzzy-match a free-text project reference (from an email) to a client. Scores
 * by full name, first name, address, and room words; returns the best match or
 * null when nothing meaningfully overlaps. Used server-side by the email route.
 */
export function matchClient(clients: DesignClient[], text: string): DesignClient | null {
  const hay = text.toLowerCase();
  let best: DesignClient | null = null;
  let bestScore = 0;

  for (const c of clients) {
    let score = 0;
    const name = c.clientName.toLowerCase();
    if (name && hay.includes(name)) score += 5;
    const first = name.split(/\s+/)[0];
    if (first && first.length >= 3 && hay.includes(first)) score += 3;
    if (c.address && hay.includes(c.address.toLowerCase())) score += 4;
    for (const room of c.rooms) {
      const r = room.toLowerCase();
      if (r.length >= 3 && hay.includes(r)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return bestScore > 0 ? best : null;
}
