// Detect internal transfers so they don't count as income/spend. Two signals:
//  1) Pairing  — a money-out and a money-in of the SAME amount within a few days
//     (moving cash between your own accounts, or paying a card from checking).
//     Excludes BOTH sides so neither inflates spend nor income.
//  2) Self-name — a deposit whose description names the account holder (a transfer
//     in from an account we haven't connected, so it has no pair). Excludes the in.
// Pure + side-effect free so it's easy to test and reuse on client/server.

export interface TxnLike {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // signed: + in, - out
  description: string;
  excluded?: boolean;
}

export interface TransferHit {
  id: string;
  reason: "pair" | "self-name";
}

const cents = (a: number) => Math.round(Math.abs(a) * 100);
const dayDiff = (a: string, b: string) =>
  Math.abs((Date.parse(a + "T00:00:00") - Date.parse(b + "T00:00:00")) / 86_400_000);

// Parse "Charles Beach, Chase Beach" → [["charles","beach"],["chase","beach"]].
export function parseSelfNames(raw: string | undefined): string[][] {
  return (raw || "")
    .split(",")
    .map((n) => n.trim().toLowerCase().split(/\s+/).filter(Boolean))
    .filter((w) => w.length > 0);
}

function nameMatches(description: string, selfNames: string[][]): boolean {
  if (selfNames.length === 0) return false;
  const words = new Set(
    description.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean)
  );
  // A name matches if every word in it appears in the description (handles a
  // middle initial, e.g. name "charles beach" vs "CHARLES T BEACH").
  return selfNames.some((nameWords) => nameWords.every((w) => words.has(w)));
}

export function detectTransfers(
  txns: TxnLike[],
  opts: { selfNames?: string[][]; windowDays?: number } = {}
): TransferHit[] {
  const selfNames = opts.selfNames ?? [];
  const windowDays = opts.windowDays ?? 4;
  const hits = new Map<string, "pair" | "self-name">();

  const open = txns.filter((t) => !t.excluded);

  // 1) Pair money-out to money-in (greedy, each used once). Pairing wins over the
  //    name rule so both sides of a connected-account transfer get excluded.
  const ins = open.filter((t) => t.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
  const outs = open.filter((t) => t.amount < 0);
  const usedIn = new Set<string>();
  for (const o of outs) {
    const match = ins.find(
      (i) => !usedIn.has(i.id) && cents(i.amount) === cents(o.amount) && dayDiff(i.date, o.date) <= windowDays
    );
    if (match) {
      usedIn.add(match.id);
      hits.set(o.id, "pair");
      hits.set(match.id, "pair");
    }
  }

  // 2) Self-name deposits not already paired (transfers in from unconnected accounts).
  for (const t of ins) {
    if (!hits.has(t.id) && nameMatches(t.description, selfNames)) hits.set(t.id, "self-name");
  }

  return [...hits].map(([id, reason]) => ({ id, reason }));
}
