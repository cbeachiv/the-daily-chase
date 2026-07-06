// Finance helpers: CSV parsing/format-detection, category normalization,
// deterministic dedupe ids, monthly aggregation, and Amazon order reconciliation.
// Pure functions (no React, no Firestore) so they're easy to test and reuse on
// both the client (the Finance tab) and the server (cron recaps).

import type { FinanceCategory, FinanceSource, FinanceTransaction } from "@/lib/types";

// ── Categories ───────────────────────────────────────────────────────────────
export const FINANCE_CATEGORIES: FinanceCategory[] = [
  "Eating Out",
  "Groceries",
  "Amazon",
  "Health",
  "Travel",
  "Rent",
  "Income",
  "Transfer",
  "Sarah Discretionary",
  "Chase Discretionary",
  "Subscription",
  "Annie",
  "Babysitting",
  "Uncategorized",
];

// Chart/chip colors, one per category (reuse the app's palette where it fits).
export const CATEGORY_COLOR: Record<FinanceCategory, string> = {
  "Eating Out": "#f59e0b",
  Groceries: "#14b8a6",
  Amazon: "#ff9900",
  Health: "#3b82f6",
  Travel: "#0ea5e9",
  Rent: "#e11d48",
  Income: "#047857",
  Transfer: "#9aa0a6",
  "Sarah Discretionary": "#ec4899",
  "Chase Discretionary": "#6366f1",
  Subscription: "#a855f7",
  Annie: "#f97316",
  Babysitting: "#84cc16",
  Uncategorized: "#94a3b8",
};

// The Hugga investment is a fixed holding. Treat it as $5,000 in net worth for any
// month whose snapshot doesn't specify its own value.
export const DEFAULT_HUGGA = 5000;

// The catch-all for an expense that matches no rule — a neutral "I don't know what
// this is yet" bucket, kept separate from Chase Discretionary so real discretionary
// spend isn't inflated by unidentified charges.
const DEFAULT_EXPENSE: FinanceCategory = "Uncategorized";

// Substring → category rules, checked in order against the raw category string
// (card export) first, then the description as a fallback. Lowercased compare.
const RULES: [string, FinanceCategory][] = [
  // Eating out
  ["dining", "Eating Out"],
  ["restaurant", "Eating Out"],
  ["food & drink", "Eating Out"],
  ["bar & ", "Eating Out"],
  ["coffee", "Eating Out"],
  ["cafe", "Eating Out"],
  ["chipotle", "Eating Out"],
  ["doordash", "Eating Out"],
  ["uber eats", "Eating Out"],
  ["grubhub", "Eating Out"],
  // Groceries
  ["grocery", "Groceries"],
  ["groceries", "Groceries"],
  ["supermarket", "Groceries"],
  ["whole foods", "Groceries"],
  ["trader joe", "Groceries"],
  ["safeway", "Groceries"],
  ["kroger", "Groceries"],
  ["costco", "Groceries"],
  // Travel
  ["airfare", "Travel"],
  ["airline", "Travel"],
  ["airlines", "Travel"],
  ["lodging", "Travel"],
  ["hotel", "Travel"],
  ["airbnb", "Travel"],
  ["travel", "Travel"],
  ["uber", "Travel"],
  ["lyft", "Travel"],
  // Rent
  ["rent", "Rent"],
  ["mortgage", "Rent"],
  // Subscriptions (recurring services, utilities, memberships)
  ["subscription", "Subscription"],
  ["membership", "Subscription"],
  ["netflix", "Subscription"],
  ["spotify", "Subscription"],
  ["hulu", "Subscription"],
  ["disney", "Subscription"],
  ["apple.com/bill", "Subscription"],
  ["prime", "Subscription"],
  ["internet", "Subscription"],
  ["phone", "Subscription"],
  ["cable", "Subscription"],
  ["verizon", "Subscription"],
  ["at&t", "Subscription"],
  ["duke energy", "Subscription"],
  ["utility", "Subscription"],
  ["utilities", "Subscription"],
  ["electric", "Subscription"],
  // Annie (kid-related)
  ["childcare", "Annie"],
  ["daycare", "Annie"],
  ["pediatric", "Annie"],
  // Babysitting (its own bucket, separate from daycare/childcare above)
  ["babysit", "Babysitting"],
  ["babysitter", "Babysitting"],
  ["nanny", "Babysitting"],
  ["au pair", "Babysitting"],
  // Health (after Annie's pediatric so kid-medical can still land on Annie above)
  ["pharmacy", "Health"],
  ["cvs", "Health"],
  ["walgreens", "Health"],
  ["medical", "Health"],
  ["health", "Health"],
  ["doctor", "Health"],
  ["dental", "Health"],
  ["dentist", "Health"],
  ["clinic", "Health"],
  ["hospital", "Health"],
  ["optometr", "Health"],
  // Amazon (after the "prime" subscription rule above so Prime stays Subscription)
  ["amazon", "Amazon"],
  ["amzn", "Amazon"],
];

// Raw category strings that mean "this is a card payment / internal transfer" —
// kept on the ledger but excluded from spend/income so the Chase and Capital One
// feeds don't double-count the same dollar.
const TRANSFER_HINTS = [
  "payment/credit",
  "payment / credit",
  "online payment",
  "autopay",
  "auto pay",
  "capital one",
  "credit card payment",
  "online transfer",
  "transfer to",
  "transfer from",
];

export function normalizeCategory(rawCategory: string, description: string, amount: number): FinanceCategory {
  const raw = (rawCategory || "").toLowerCase();
  const desc = (description || "").toLowerCase();
  for (const [needle, cat] of RULES) {
    if (raw.includes(needle) || desc.includes(needle)) return cat;
  }
  // Positive, unmatched, non-transfer → treat as income (e.g. a payroll deposit).
  if (amount > 0) return "Income";
  return DEFAULT_EXPENSE;
}

export function isTransfer(rawCategory: string, description: string): boolean {
  const hay = `${rawCategory} ${description}`.toLowerCase();
  return TRANSFER_HINTS.some((h) => hay.includes(h));
}

// ── CSV parsing ──────────────────────────────────────────────────────────────
// Full-text CSV parser: handles quoted fields containing commas, escaped quotes,
// and embedded newlines (Amazon DSAR exports wrap some product names across
// lines, so line-splitting would corrupt those rows). Strips a leading BOM and
// drops blank lines.
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const src = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  let sawAny = false; // any field content or delimiter on the current record
  const endRow = () => {
    row.push(cur);
    records.push(row);
    row = [];
    cur = "";
    sawAny = false;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
      sawAny = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
      sawAny = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      if (sawAny || cur.trim().length > 0) endRow();
      else cur = "";
    } else {
      cur += c;
      sawAny = true;
    }
  }
  if (sawAny || cur.trim().length > 0) endRow();
  if (records.length === 0) return { header: [], rows: [] };
  return { header: records[0].map((h) => h.trim()), rows: records.slice(1) };
}

export type CsvFormat = "capitalone" | "chase" | "amazon" | "unknown";

export function detectFormat(header: string[]): CsvFormat {
  const h = header.map((x) => x.toLowerCase().trim());
  const has = (name: string) => h.some((x) => x === name || x.includes(name));
  if ((has("product name") || has("title")) && (has("order date") || has("order id"))) return "amazon";
  if (has("debit") && has("credit")) return "capitalone";
  if (has("details") || (has("posting date") && has("amount")) || (has("post date") && has("amount"))) return "chase";
  return "unknown";
}

// Find a column index by trying candidate header names (lowercased substring).
function col(header: string[], candidates: string[]): number {
  const h = header.map((x) => x.toLowerCase().trim());
  for (const cand of candidates) {
    const i = h.findIndex((x) => x === cand);
    if (i >= 0) return i;
  }
  for (const cand of candidates) {
    const i = h.findIndex((x) => x.includes(cand));
    if (i >= 0) return i;
  }
  return -1;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Parse a date cell to "YYYY-MM-DD". Handles M/D/Y, YYYY-MM-DD, "DD Mon YYYY",
// and ISO timestamps (Amazon exports). Returns null if unparseable.
export function parseDate(s: string): string | null {
  const t = (s || "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // 2025-10-27 or ISO
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); // 10/27/2025 (M/D/Y)
  if (m) {
    let yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  m = t.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/); // 27-Oct-25
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon === undefined) return null;
    let yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    return `${yr}-${String(mon + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const toNum = (s: string): number => {
  const neg = /^\s*\(.*\)\s*$/.test(s) || String(s).trim().startsWith("-");
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
};

// A normalized, source-agnostic parsed transaction (pre-dedupe, pre-Firestore).
export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number; // signed: negative = expense, positive = income/credit
  category: FinanceCategory;
  rawCategory?: string;
  source: Exclude<FinanceSource, "manual" | "recurring">;
  excluded: boolean;
}

export interface AmazonOrder {
  date: string; // ship date when known — card charges track shipment, not order
  altDate?: string; // order date, tried as a secondary match window
  title: string; // shipment groups: item titles joined "; "
  amount: number; // positive dollars — sum of item totals (post-discount)
  altAmount?: number; // shipment-level total when it differs (subtotal+tax+shipping−discounts)
  orderId?: string;
}

// Parse a Capital One or Chase export into normalized transactions.
export function parseTransactions(text: string): { format: CsvFormat; txns: ParsedTransaction[] } {
  const { header, rows } = parseCsv(text);
  const format = detectFormat(header);

  if (format === "capitalone") {
    const di = col(header, ["transaction date", "date"]);
    const desc = col(header, ["description"]);
    const cat = col(header, ["category"]);
    const debit = col(header, ["debit"]);
    const credit = col(header, ["credit"]);
    const txns: ParsedTransaction[] = [];
    for (const r of rows) {
      const date = parseDate(r[di] ?? "");
      if (!date) continue;
      const d = toNum(r[debit] ?? "");
      const c = toNum(r[credit] ?? "");
      // Debit = charge (money out, negative); Credit = refund/payment (money in).
      const amount = c ? Math.abs(c) : -Math.abs(d);
      if (amount === 0) continue;
      const rawCategory = (r[cat] ?? "").trim();
      const description = (r[desc] ?? "").trim();
      const excluded = isTransfer(rawCategory, description);
      txns.push({
        date,
        description,
        amount,
        category: excluded ? "Transfer" : normalizeCategory(rawCategory, description, amount),
        rawCategory: rawCategory || undefined,
        source: "capitalone",
        excluded,
      });
    }
    return { format, txns };
  }

  if (format === "chase") {
    const di = col(header, ["posting date", "post date", "transaction date", "date"]);
    const desc = col(header, ["description"]);
    const amt = col(header, ["amount"]);
    const cat = col(header, ["category"]);
    const txns: ParsedTransaction[] = [];
    for (const r of rows) {
      const date = parseDate(r[di] ?? "");
      if (!date) continue;
      const amount = toNum(r[amt] ?? ""); // Chase amounts are already signed
      if (amount === 0) continue;
      const rawCategory = cat >= 0 ? (r[cat] ?? "").trim() : "";
      const description = (r[desc] ?? "").trim();
      const excluded = isTransfer(rawCategory, description);
      txns.push({
        date,
        description,
        amount,
        category: excluded ? "Transfer" : normalizeCategory(rawCategory, description, amount),
        rawCategory: rawCategory || undefined,
        source: "chase",
        excluded,
      });
    }
    return { format, txns };
  }

  return { format, txns: [] };
}

// Cap enriched notes so a 20-item grocery shipment doesn't blow up the ledger UI.
const NOTE_MAX = 500;
export function joinTitles(titles: string[]): string {
  let out = "";
  for (let i = 0; i < titles.length; i++) {
    const next = out ? `${out}; ${titles[i]}` : titles[i];
    if (next.length > NOTE_MAX && out) return `${out} …(+${titles.length - i} more)`;
    out = next;
  }
  return out;
}

// Parse an Amazon order-history export into orders for reconciliation. Handles
// both the legacy retail order report (one order per row) and the privacy-central
// DSAR export (one ITEM per row): DSAR rows are grouped by (Order ID, Ship Date)
// because Amazon charges the card per shipment, on the ship date.
export function parseAmazonOrders(text: string): AmazonOrder[] {
  const { header, rows } = parseCsv(text);
  const di = col(header, ["order date"]);
  const title = col(header, ["product name", "title"]);
  const total = col(header, ["total owed", "total amount", "item total", "total charged", "item subtotal"]);
  if (di < 0 || title < 0 || total < 0) return [];
  const oid = col(header, ["order id"]);
  const ship = col(header, ["ship date"]);
  const status = col(header, ["order status"]);
  const currency = col(header, ["currency"]);

  // DSAR export: item-level rows with Order ID + Ship Date → group into shipments.
  if (oid >= 0 && ship >= 0) {
    const sub = col(header, ["shipment item subtotal"]);
    const subTax = col(header, ["shipment item subtotal tax"]);
    const shipping = col(header, ["shipping charge"]);
    const disc = col(header, ["total discounts"]);
    interface Group {
      date: string;
      altDate?: string;
      orderId: string;
      titles: string[];
      itemCents: number; // Σ per-item "Total Amount" (qty- and discount-inclusive)
      shipCents: number; // shipment-level subtotal+tax+shipping (repeats per row)
      discCents: number; // Σ per-item discounts (Amazon records them negative)
    }
    const groups = new Map<string, Group>();
    for (const r of rows) {
      if (status >= 0 && (r[status] ?? "").trim().toLowerCase() === "cancelled") continue;
      const cur = currency >= 0 ? (r[currency] ?? "").trim().toUpperCase() : "";
      if (cur && cur !== "USD") continue;
      const t = (r[title] ?? "").trim();
      const itemCents = cents(toNum(r[total] ?? ""));
      if (!t || itemCents === 0) continue;
      const orderDate = parseDate(r[di] ?? "");
      const shipDate = parseDate(r[ship] ?? "");
      const date = shipDate ?? orderDate;
      if (!date) continue;
      const orderId = (r[oid] ?? "").trim();
      const key = `${orderId}|${shipDate ?? ""}`;
      let g = groups.get(key);
      if (!g) {
        const shipCents =
          sub >= 0 && subTax >= 0
            ? cents(toNum(r[sub] ?? "")) +
              cents(toNum(r[subTax] ?? "")) +
              (shipping >= 0 ? cents(toNum(r[shipping] ?? "")) : 0)
            : 0;
        g = {
          date,
          ...(orderDate && orderDate !== date ? { altDate: orderDate } : {}),
          orderId,
          titles: [],
          itemCents: 0,
          shipCents,
          discCents: 0,
        };
        groups.set(key, g);
      }
      g.titles.push(t);
      g.itemCents += itemCents;
      if (disc >= 0) g.discCents += cents(toNum(r[disc] ?? ""));
    }
    return [...groups.values()].map((g) => {
      const alt = g.shipCents - g.discCents;
      return {
        date: g.date,
        ...(g.altDate ? { altDate: g.altDate } : {}),
        title: joinTitles(g.titles),
        amount: g.itemCents / 100,
        ...(alt > 0 && alt !== g.itemCents ? { altAmount: alt / 100 } : {}),
        orderId: g.orderId,
      };
    });
  }

  // Legacy retail order report: one order per row.
  const orders: AmazonOrder[] = [];
  for (const r of rows) {
    const date = parseDate(r[di] ?? "");
    const amount = Math.abs(toNum(r[total] ?? ""));
    const t = (r[title] ?? "").trim();
    if (!date || !t || amount === 0) continue;
    orders.push({ date, title: t, amount });
  }
  return orders;
}

// Parse the DSAR "Digital Content Orders.csv" (Kindle, Audible, Prime Video…).
// Each order spans multiple component rows (Price Amount, Tax) whose
// "Transaction Amount" values sum to what the card was charged.
export function parseAmazonDigitalOrders(text: string): AmazonOrder[] {
  const { header, rows } = parseCsv(text);
  const oid = col(header, ["order id"]);
  const title = col(header, ["product name"]);
  const amt = col(header, ["transaction amount"]);
  const di = col(header, ["fulfilled date", "order date"]);
  if (oid < 0 || title < 0 || amt < 0 || di < 0) return [];
  const status = col(header, ["order status"]);
  const currency = col(header, ["base currency code"]);
  interface Group {
    date: string;
    titles: string[];
    amountCents: number;
  }
  const groups = new Map<string, Group>();
  for (const r of rows) {
    if (status >= 0 && !/success/i.test(r[status] ?? "")) continue;
    const cur = currency >= 0 ? (r[currency] ?? "").trim().toUpperCase() : "";
    if (cur && cur !== "USD") continue;
    const date = parseDate(r[di] ?? "");
    const t = (r[title] ?? "").trim();
    if (!date || !t) continue;
    const id = (r[oid] ?? "").trim();
    let g = groups.get(id);
    if (!g) {
      g = { date, titles: [], amountCents: 0 };
      groups.set(id, g);
    }
    if (!g.titles.includes(t)) g.titles.push(t);
    g.amountCents += cents(toNum(r[amt] ?? ""));
  }
  return [...groups.values()]
    .filter((g) => g.amountCents > 0)
    .map((g) => ({ date: g.date, title: joinTitles(g.titles), amount: g.amountCents / 100 }));
}

// ── Dedupe ids ───────────────────────────────────────────────────────────────
// djb2 string hash → base36, for a compact deterministic id component.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const cents = (n: number) => Math.round(Math.abs(n) * 100);

// Build Firestore docs from parsed transactions, computing deterministic dedupe
// ids. Genuinely-identical same-day rows get an incrementing suffix so a second
// real purchase isn't collapsed into the first; because CSV order is stable,
// re-uploading the same file reproduces the same ids (idempotent).
export function buildTxnDocs(
  txns: ParsedTransaction[],
  nowIso: string
): { id: string; data: Record<string, unknown> }[] {
  const seen = new Map<string, number>();
  return txns.map((t) => {
    const base = `${t.source}_${t.date}_${cents(t.amount)}_${hash(t.description.toLowerCase())}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const id = n === 0 ? base : `${base}_${n}`;
    return {
      id,
      data: {
        date: t.date,
        month: t.date.slice(0, 7),
        description: t.description,
        amount: t.amount,
        category: t.category,
        ...(t.rawCategory ? { rawCategory: t.rawCategory } : {}),
        source: t.source,
        excluded: t.excluded,
        createdAt: nowIso,
      },
    };
  });
}

// ── Amazon reconciliation ────────────────────────────────────────────────────
// Greedy match: pair each Amazon card charge with order rows whose summed total
// equals the charge (exact to the cent) within a ±dayWindow window. Returns the
// note (joined item titles) to attach to each matched charge.
export function matchAmazonOrders(
  charges: FinanceTransaction[],
  orders: AmazonOrder[],
  dayWindow = 5
): { id: string; note: string }[] {
  const updates: { id: string; note: string }[] = [];
  const used = new Set<number>();
  const dayDiff = (a: string, b: string) =>
    Math.abs((Date.parse(a + "T00:00:00") - Date.parse(b + "T00:00:00")) / 86400000);
  // Distance from a charge to an order: ship date or order date, whichever is closer
  // (the card usually posts 0–3 days after shipping, but sometimes on order day).
  const dist = (o: AmazonOrder, chargeDate: string) =>
    Math.min(dayDiff(o.date, chargeDate), o.altDate ? dayDiff(o.altDate, chargeDate) : Infinity);
  const hits = (o: AmazonOrder, target: number) =>
    cents(o.amount) === target || (o.altAmount !== undefined && cents(o.altAmount) === target);

  for (const charge of charges) {
    const target = cents(charge.amount);
    // Candidate orders within the date window, not yet consumed.
    const cands = orders
      .map((o, i) => ({ o, i }))
      .filter(({ o, i }) => !used.has(i) && dist(o, charge.date) <= dayWindow);

    // 1) single-shipment exact match — nearest date wins
    let picked = cands
      .filter(({ o }) => hits(o, target))
      .sort((a, b) => dist(a.o, charge.date) - dist(b.o, charge.date))
      .slice(0, 1);

    // 2) split-shipment order charged once: all of an order's shipments sum to the charge
    if (picked.length === 0) {
      const byOrder = new Map<string, typeof cands>();
      for (const c of cands) {
        if (!c.o.orderId) continue;
        const g = byOrder.get(c.o.orderId);
        if (g) g.push(c);
        else byOrder.set(c.o.orderId, [c]);
      }
      for (const group of byOrder.values()) {
        if (group.length < 2) continue;
        if (group.reduce((s, c) => s + cents(c.o.amount), 0) === target) {
          picked = group;
          break;
        }
      }
    }

    // 3) several same-day orders paid in one charge: greedy sum
    if (picked.length === 0) {
      const sameDay = cands.filter(({ o }) => o.date === charge.date);
      let sum = 0;
      const acc: typeof sameDay = [];
      for (const c of sameDay) {
        if (sum + cents(c.o.amount) <= target) {
          acc.push(c);
          sum += cents(c.o.amount);
        }
      }
      if (sum === target && acc.length > 0) picked = acc;
    }

    if (picked.length > 0) {
      picked.forEach((p) => used.add(p.i));
      updates.push({ id: charge.id, note: joinTitles(picked.map((p) => p.o.title)) });
    }
  }
  return updates;
}

// ── Aggregation ──────────────────────────────────────────────────────────────
export interface MonthAgg {
  income: number;
  spend: number;
  net: number;
  savingsPct: number | null;
  byCategory: { category: FinanceCategory; amount: number }[];
}

// Roll a month's transactions into income/spend/net + a category breakdown.
// Excluded rows (transfers, card payments) and Income/Transfer categories are
// left out of the spend breakdown.
export function aggregateMonth(txns: FinanceTransaction[]): MonthAgg {
  let income = 0;
  let spend = 0;
  const byCat = new Map<FinanceCategory, number>();
  for (const t of txns) {
    if (t.excluded) continue;
    if (t.amount > 0) {
      income += t.amount;
    } else {
      const v = -t.amount;
      spend += v;
      if (t.category !== "Income" && t.category !== "Transfer") {
        byCat.set(t.category, (byCat.get(t.category) ?? 0) + v);
      }
    }
  }
  const net = income - spend;
  const byCategory = Array.from(byCat.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { income, spend, net, savingsPct: income > 0 ? net / income : null, byCategory };
}

// ── Snapshot vs transactions: which to trust per month ───────────────────────
// The account feed (Plaid/CSV) only goes back so far, and its first month is
// usually partial (Plaid started mid-March). Older months — and that partial
// boundary month — have authoritative full-month totals in their snapshot; only
// months the feed FULLY covers should be computed from transactions.

// Earliest month the account feed covers, and whether that first month is full
// (feed started within the first 3 days). Manual/recurring rows don't count as
// "feed coverage". Returns null if there are no fed transactions.
export function feedCoverage(
  txns: FinanceTransaction[]
): { month: string; full: boolean } | null {
  const fed = txns.filter((t) => t.source === "plaid" || t.source === "capitalone" || t.source === "chase");
  if (fed.length === 0) return null;
  const earliest = fed.reduce((min, t) => (t.date < min ? t.date : min), fed[0].date);
  return { month: earliest.slice(0, 7), full: Number(earliest.slice(8, 10)) <= 3 };
}

// Resolve a month's income/spend: transactions for fully-covered months, else the
// snapshot's stored totals (pre-feed history + the partial boundary month).
export function resolveMonthTotals(
  month: string,
  monthTxns: FinanceTransaction[],
  snapshot: { income?: number; spend?: number } | undefined,
  coverage: { month: string; full: boolean } | null
): { income: number; spend: number } {
  const fullyCovered =
    coverage !== null && (month > coverage.month || (month === coverage.month && coverage.full));
  if (fullyCovered && monthTxns.length > 0) {
    const a = aggregateMonth(monthTxns);
    return { income: a.income, spend: a.spend };
  }
  if (snapshot && (snapshot.income != null || snapshot.spend != null)) {
    return { income: snapshot.income ?? 0, spend: snapshot.spend ?? 0 };
  }
  const a = aggregateMonth(monthTxns);
  return { income: a.income, spend: a.spend };
}

// ── Formatting / month helpers ───────────────────────────────────────────────
export function fmtUSD(n: number, withCents = false): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  });
}

// "2026-06" -> "June 2026"
export function monthLabel(ym: string): string {
  return new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// "2026-06" -> "Jun" (compact, for charts)
export function monthShort(ym: string): string {
  return new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "short" });
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
