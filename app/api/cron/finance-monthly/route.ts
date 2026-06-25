import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import { aggregateMonth, addMonths, feedCoverage, fmtUSD, monthLabel, resolveMonthTotals } from "@/lib/finance";
import { shortDate } from "@/lib/dates";
import type { FinanceSnapshot, FinanceTransaction } from "@/lib/types";
import { buildEmailHtml, type FinanceMonthlyEmailData } from "./email";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP_BASE_URL = process.env.APP_BASE_URL || "https://thedailychase.com";

async function colData<T>(uid: string, name: string): Promise<T[]> {
  const snap = await adminDb().collection(`users/${uid}/${name}`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

// Eastern wall-clock so the email lands in the morning year-round. Vercel crons
// are UTC; we fire at two UTC hours and let exactly one pass this guard (EDT/EST).
function easternNow(now = new Date()): { hour: number; dateStr: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { hour: Number(parts.hour) % 24, dateStr: `${parts.year}-${parts.month}-${parts.day}` };
}

function snapTotal(s: FinanceSnapshot | undefined): number {
  return (s?.bitcoin ?? 0) + (s?.ira ?? 0) + (s?.savings ?? 0);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const toOverride = params.get("to");
  const ccOverride = params.get("cc");

  // Real cron runs only proceed at the 9am Eastern hour; ?to= test sends bypass it.
  const et = easternNow();
  if (!toOverride && et.hour !== 9) {
    return NextResponse.json({ ok: true, skipped: true, easternHour: et.hour });
  }

  const list = await adminAuth().listUsers(1);
  const user = list.users[0];
  if (!user) return NextResponse.json({ error: "No user" }, { status: 404 });
  const uid = user.uid;

  // The month just closed (e.g. on June 3rd, recap May).
  const month = addMonths(et.dateStr.slice(0, 7), -1);
  const prevMonth = addMonths(month, -1);

  const [txns, snapshots] = await Promise.all([
    colData<FinanceTransaction>(uid, "financeTransactions"),
    colData<FinanceSnapshot>(uid, "financeSnapshots"),
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
  const spendDelta = prevAgg.spend > 0 ? spend - prevAgg.spend : null;

  const topCategories = agg.byCategory.slice(0, 5);
  const maxCat = topCategories[0]?.amount ?? 1;
  const largeTransactions = monthTxns
    .filter((t) => !t.excluded && t.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 5);

  const total = snapTotal(snap);
  const worthDelta = prevSnap ? total - snapTotal(prevSnap) : null;

  // --- Claude narrative -----------------------------------------------------
  const facts = {
    month: monthLabel(month),
    income: Math.round(income),
    spend: Math.round(spend),
    net: Math.round(net),
    savingsRatePct: savingsPct === null ? null : Math.round(savingsPct * 100),
    prevMonthSpend: prevAgg.spend ? Math.round(prevAgg.spend) : null,
    topCategories: topCategories.map((c) => ({ category: c.category, amount: Math.round(c.amount) })),
    biggestCharges: largeTransactions.map((t) => ({ description: t.description, amount: Math.round(-t.amount) })),
    netWorth: Math.round(total),
    netWorthChange: worthDelta === null ? null : Math.round(worthDelta),
  };

  let intro = "";
  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 320,
      messages: [
        {
          role: "user",
          content: [
            "You write the monthly money recap for Chase & his wife Sarah. Use ONLY the real numbers below — never invent figures.",
            "Write a warm, plain-spoken 60–90 word recap in the voice of a sharp, encouraging friend: open with how the month went financially, name the savings rate honestly (celebrate a good one, be candid about a tight one), and call out the single biggest spend driver. No markdown, no lists, no greeting line.",
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
      savingsPct !== null && savingsPct >= 0.2
        ? `Solid month — you saved ${fmtUSD(net)} on ${fmtUSD(income)} of income (${Math.round((savingsPct ?? 0) * 100)}%). Here's the breakdown.`
        : `Here's where ${monthLabel(month)} landed: ${fmtUSD(income)} in, ${fmtUSD(spend)} out. The full breakdown is below.`;
  }

  const data: FinanceMonthlyEmailData = {
    monthLabel: monthLabel(month),
    intro,
    income: fmtUSD(income),
    spend: fmtUSD(spend),
    net: fmtUSD(net),
    savingsPct: savingsPct === null ? "—" : `${Math.round(savingsPct * 100)}%`,
    netPositive: net >= 0,
    spendDelta:
      spendDelta === null ? null : `${spendDelta >= 0 ? "+" : "−"}${fmtUSD(Math.abs(spendDelta))} vs ${monthLabel(prevMonth).split(" ")[0]}`,
    topCategories: topCategories.map((c) => ({
      label: c.category,
      amount: fmtUSD(c.amount),
      pct: Math.round((c.amount / maxCat) * 100),
    })),
    largeTransactions: largeTransactions.map((t) => ({
      date: shortDate(t.date),
      description: t.description.length > 38 ? t.description.slice(0, 36) + "…" : t.description,
      amount: fmtUSD(-t.amount),
    })),
    netWorth: fmtUSD(total),
    netWorthDelta: worthDelta === null ? null : `${worthDelta >= 0 ? "+" : "−"}${fmtUSD(Math.abs(worthDelta))}`,
    bitcoin: fmtUSD(snap?.bitcoin ?? 0),
    ira: fmtUSD(snap?.ira ?? 0),
    savings: fmtUSD(snap?.savings ?? 0),
    appUrl: APP_BASE_URL,
  };

  const recipient = toOverride || process.env.FINANCE_TO || process.env.RECAP_EMAIL || "chasetbeach@gmail.com";
  const cc = (ccOverride || process.env.FINANCE_CC || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const resend = new Resend(process.env.RESEND_API_KEY);
  let result;
  try {
    result = await resend.emails.send({
      from: process.env.RESEND_FROM || "The Daily Chase <onboarding@resend.dev>",
      to: recipient,
      ...(cc.length ? { cc } : {}),
      subject: `Money recap — ${monthLabel(month)}`,
      html: buildEmailHtml(data),
    });
  } catch (err) {
    console.error("Resend send threw:", err);
    return NextResponse.json({ error: "Email send failed" }, { status: 500 });
  }
  if (result.error) {
    console.error("Resend rejected send:", result.error);
    return NextResponse.json({ error: result.error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sentTo: recipient, cc, month, id: result.data?.id });
}
