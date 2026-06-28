// Shared compute for the monthly advisor recap. Both the draft cron (route.ts) and
// the approve endpoint (approve/route.ts) call this so they produce identical
// numbers — the only difference is `mode` and the approve button, which each caller
// sets on the returned data.

import { createHmac, timingSafeEqual } from "crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { aggregateMonth, addMonths, feedCoverage, fmtUSD, monthLabel, resolveMonthTotals } from "@/lib/finance";
import { getUsdToMxn, fmtMXN } from "@/lib/fx";
import { shortDate } from "@/lib/dates";
import type { FinanceSnapshot, FinanceTransaction } from "@/lib/types";
import { ADVISOR_NAME, type FinanceMonthlyEmailData } from "./email";

export const SAVINGS_GOAL_PCT = 50;

async function colData<T>(uid: string, name: string): Promise<T[]> {
  const snap = await adminDb().collection(`users/${uid}/${name}`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

function snapTotal(s: FinanceSnapshot | undefined): number {
  return (s?.bitcoin ?? 0) + (s?.ira ?? 0) + (s?.savings ?? 0);
}

// The single household user (this is a private one-user app).
export async function getPrimaryUid(): Promise<string | null> {
  const list = await adminAuth().listUsers(1);
  return list.users[0]?.uid ?? null;
}

// Month-scoped, unguessable token for the "Approve & send to Sarah" link. Keyed by
// CRON_SECRET so only emails we generated carry a valid link.
export function approveToken(month: string): string {
  const secret = process.env.CRON_SECRET || "dev-secret";
  return createHmac("sha256", secret).update(`finance-monthly:${month}`).digest("hex").slice(0, 32);
}

export function verifyApproveToken(month: string, token: string | null): boolean {
  if (!token) return false;
  const expected = approveToken(month);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// `coreData` is everything except `mode`/`approveUrl`, which the caller fills in.
type CoreData = Omit<FinanceMonthlyEmailData, "mode" | "approveUrl">;

// Build all the recap numbers + Daniela's narrative for a closed month ("YYYY-MM").
export async function buildMonthlyEmailData(uid: string, month: string): Promise<CoreData> {
  const prevMonth = addMonths(month, -1);
  const year = month.slice(0, 4);

  const [txns, snapshots, mxnRate] = await Promise.all([
    colData<FinanceTransaction>(uid, "financeTransactions"),
    colData<FinanceSnapshot>(uid, "financeSnapshots"),
    getUsdToMxn(),
  ]);

  const monthTxns = txns.filter((t) => t.month === month);
  const agg = aggregateMonth(monthTxns);
  const prevAgg = aggregateMonth(txns.filter((t) => t.month === prevMonth));
  const snap = snapshots.find((s) => s.month === month);
  const prevSnap = snapshots.find((s) => s.month === prevMonth);

  // Transactions for fully-covered months, else the snapshot's stored figures
  // (historical/backfilled months + the partial first feed month).
  const { income, spend } = resolveMonthTotals(month, monthTxns, snap, feedCoverage(txns));
  const net = income - spend;
  const savingsPct = income > 0 ? net / income : null;
  const ratePct = savingsPct === null ? null : savingsPct * 100;
  const spendDelta = prevAgg.spend > 0 ? spend - prevAgg.spend : null;

  const topCategories = agg.byCategory.slice(0, 5);
  const maxCat = topCategories[0]?.amount ?? 1;
  // Biggest charges, excluding rent (the heading reads "outside of rent"): drop the
  // Rent category and anything whose name still mentions "rent". Honor the user's
  // edited names (descriptionOverride) over raw bank text.
  const largeTransactions = monthTxns
    .filter((t) => {
      if (t.excluded || t.amount >= 0 || t.category === "Rent") return false;
      const text = `${t.descriptionOverride ?? ""} ${t.description ?? ""}`.toLowerCase();
      return !text.includes("rent");
    })
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 5)
    .map((t) => ({ ...t, label: t.descriptionOverride?.trim() || t.description }));

  const total = snapTotal(snap);
  const worthDelta = prevSnap ? total - snapTotal(prevSnap) : null;

  // YTD average per category: each category's total this year ÷ months elapsed.
  const monthsElapsed = Math.max(1, Number(month.slice(5, 7)));
  const ytdAgg = aggregateMonth(
    txns.filter((t) => t.month.startsWith(`${year}-`) && t.month <= month)
  );
  const ytdAverages = ytdAgg.byCategory.slice(0, 6).map((c) => ({
    label: c.category,
    avg: c.amount / monthsElapsed,
  }));

  // --- 50% savings goal framing --------------------------------------------
  const goalReached = ratePct !== null && ratePct >= SAVINGS_GOAL_PCT;
  const savingsBarPct =
    ratePct === null ? 0 : Math.max(0, Math.min(100, (ratePct / SAVINGS_GOAL_PCT) * 100));
  const savingsGoalNote =
    ratePct === null
      ? "no income recorded"
      : goalReached
        ? "Goal hit \u{1F389}"
        : `${Math.round(SAVINGS_GOAL_PCT - ratePct)} pts to your ${SAVINGS_GOAL_PCT}% goal`;

  // --- Daniela's narrative --------------------------------------------------
  const facts = {
    month: monthLabel(month),
    income: Math.round(income),
    spend: Math.round(spend),
    net: Math.round(net),
    savingsRatePct: ratePct === null ? null : Math.round(ratePct),
    savingsGoalPct: SAVINGS_GOAL_PCT,
    prevMonthSpend: prevAgg.spend ? Math.round(prevAgg.spend) : null,
    topCategories: topCategories.map((c) => ({ category: c.category, amount: Math.round(c.amount) })),
    ytdMonthlyAverages: ytdAverages.map((a) => ({ category: a.label, avgPerMonth: Math.round(a.avg) })),
    biggestCharges: largeTransactions.map((t) => ({ description: t.label, amount: Math.round(-t.amount) })),
    netWorth: Math.round(total),
    netWorthChange: worthDelta === null ? null : Math.round(worthDelta),
  };

  let intro = "";
  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 360,
      messages: [
        {
          role: "user",
          content: [
            `You are ${ADVISOR_NAME}, the personal financial advisor for Chase and his wife Sarah (Sarah is from Mexico). You write their monthly money recap. Use ONLY the real numbers below — never invent figures.`,
            `Write a warm, sharp, plain-spoken 70–100 word recap in first person ("I"), addressed to Chase and Sarah. Open with how the month went, then name the savings rate honestly against their ${SAVINGS_GOAL_PCT}% goal — celebrate hitting it, be candid and constructive when they're short and point to the lever that would close the gap. Call out the single biggest spend driver. End with one specific, encouraging next step. No markdown, no lists, no greeting line, no signature (the email adds my name).`,
            "",
            JSON.stringify(facts, null, 2),
          ].join("\n"),
        },
      ],
    });
    intro = textOf(msg).trim();
  } catch (err) {
    console.error("Finance monthly intro failed:", err);
    intro =
      goalReached
        ? `Strong month — you saved ${fmtUSD(net)} on ${fmtUSD(income)} of income, clearing your ${SAVINGS_GOAL_PCT}% savings goal. Here's the full breakdown.`
        : `Here's where ${monthLabel(month)} landed: ${fmtUSD(income)} in, ${fmtUSD(spend)} out${ratePct === null ? "" : `, a ${Math.round(ratePct)}% savings rate against your ${SAVINGS_GOAL_PCT}% goal`}. The full breakdown is below.`;
  }

  return {
    monthLabel: monthLabel(month),
    intro,
    income: fmtUSD(income),
    spend: fmtUSD(spend),
    net: fmtUSD(net),
    incomeMxn: fmtMXN(income, mxnRate),
    spendMxn: fmtMXN(spend, mxnRate),
    netMxn: fmtMXN(net, mxnRate),
    savingsPct: savingsPct === null ? "—" : `${Math.round(savingsPct * 100)}%`,
    savingsGoalPct: SAVINGS_GOAL_PCT,
    savingsBarPct,
    savingsGoalNote,
    goalReached,
    netPositive: net >= 0,
    spendDelta:
      spendDelta === null
        ? null
        : `${spendDelta >= 0 ? "+" : "−"}${fmtUSD(Math.abs(spendDelta))} vs ${monthLabel(prevMonth).split(" ")[0]}`,
    topCategories: topCategories.map((c) => ({
      label: c.category,
      amount: fmtUSD(c.amount),
      pct: Math.round((c.amount / maxCat) * 100),
    })),
    ytdAverages: ytdAverages.map((a) => ({
      label: a.label,
      amount: fmtUSD(a.avg),
      amountMxn: fmtMXN(a.avg, mxnRate),
    })),
    ytdYear: year,
    largeTransactions: largeTransactions.map((t) => ({
      date: shortDate(t.date),
      description: t.label.length > 38 ? t.label.slice(0, 36) + "…" : t.label,
      amount: fmtUSD(-t.amount),
    })),
    netWorth: fmtUSD(total),
    netWorthMxn: fmtMXN(total, mxnRate),
    netWorthDelta: worthDelta === null ? null : `${worthDelta >= 0 ? "+" : "−"}${fmtUSD(Math.abs(worthDelta))}`,
    bitcoin: fmtUSD(snap?.bitcoin ?? 0),
    ira: fmtUSD(snap?.ira ?? 0),
    savings: fmtUSD(snap?.savings ?? 0),
    appUrl: process.env.APP_BASE_URL || "https://thedailychase.com",
  };
}
