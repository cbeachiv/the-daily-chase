import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { aggregateMonth, fmtUSD } from "@/lib/finance";
import { prettyDate, shortDate, startOfWeek } from "@/lib/dates";
import type { FinanceTransaction } from "@/lib/types";
import { buildEmailHtml, type FinanceWeeklyEmailData } from "./email";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP_BASE_URL = process.env.APP_BASE_URL || "https://thedailychase.com";

async function colData<T>(uid: string, name: string): Promise<T[]> {
  const snap = await adminDb().collection(`users/${uid}/${name}`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

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

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const toOverride = params.get("to");
  const ccOverride = params.get("cc");

  // Real cron runs only proceed at the 5pm Eastern hour (Sunday); test sends bypass.
  const et = easternNow();
  if (!toOverride && et.hour !== 17) {
    return NextResponse.json({ ok: true, skipped: true, easternHour: et.hour });
  }

  const list = await adminAuth().listUsers(1);
  const user = list.users[0];
  if (!user) return NextResponse.json({ error: "No user" }, { status: 404 });
  const uid = user.uid;

  const today = et.dateStr;
  const weekStart = startOfWeek(today); // Monday
  const month = today.slice(0, 7);

  const txns = await colData<FinanceTransaction>(uid, "financeTransactions");
  const weekTxns = txns.filter((t) => t.date >= weekStart && t.date <= today);
  const weekAgg = aggregateMonth(weekTxns); // same income/spend/byCategory math, scoped to the week
  const monthAgg = aggregateMonth(txns.filter((t) => t.month === month));

  const largeTransactions = weekTxns
    .filter((t) => !t.excluded && t.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 4);

  const data: FinanceWeeklyEmailData = {
    weekLabel: `Week of ${prettyDate(weekStart)}`,
    spend: fmtUSD(weekAgg.spend),
    income: fmtUSD(weekAgg.income),
    txnCount: weekTxns.filter((t) => !t.excluded).length,
    topCategories: weekAgg.byCategory.slice(0, 4).map((c) => ({ label: c.category, amount: fmtUSD(c.amount) })),
    largeTransactions: largeTransactions.map((t) => ({
      date: shortDate(t.date),
      description: t.description.length > 38 ? t.description.slice(0, 36) + "…" : t.description,
      amount: fmtUSD(-t.amount),
    })),
    monthLabel: new Date(month + "-01T00:00:00").toLocaleDateString("en-US", { month: "long" }),
    monthSpend: fmtUSD(monthAgg.spend),
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
      subject: `This week's spending — ${prettyDate(weekStart)}`,
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
  return NextResponse.json({ ok: true, sentTo: recipient, cc, weekStart, id: result.data?.id });
}
