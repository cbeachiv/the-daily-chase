import { NextResponse } from "next/server";
import { Resend } from "resend";
import { addMonths, monthLabel } from "@/lib/finance";
import { buildMonthlyEmailData, getPrimaryUid, approveToken } from "./build";
import { buildEmailHtml, ADVISOR_NAME, type FinanceMonthlyEmailData } from "./email";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP_BASE_URL = process.env.APP_BASE_URL || "https://thedailychase.com";

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

// Sends the DRAFT recap to Chase only. The email carries an "Approve & send to
// Sarah" button (see approve/route.ts) — nothing reaches Sarah until he clicks it.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const toOverride = params.get("to");
  const preview = params.get("preview");

  // Real cron runs only proceed at the 9am Eastern hour; ?to= test sends and
  // ?preview=1 (render HTML, send nothing) bypass it.
  const et = easternNow();
  if (!toOverride && !preview && et.hour !== 9) {
    return NextResponse.json({ ok: true, skipped: true, easternHour: et.hour });
  }

  const uid = await getPrimaryUid();
  if (!uid) return NextResponse.json({ error: "No user" }, { status: 404 });

  // The month just closed (e.g. on July 1st, recap June). ?month=YYYY-MM overrides
  // (preview/test only — lets you render a specific month).
  const monthParam = params.get("month");
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : addMonths(et.dateStr.slice(0, 7), -1);

  const core = await buildMonthlyEmailData(uid, month);
  const approveUrl = `${APP_BASE_URL}/api/cron/finance-monthly/approve?month=${month}&token=${approveToken(month)}`;
  const data: FinanceMonthlyEmailData = { ...core, mode: "draft", approveUrl };

  // ?preview=1 renders the real-data draft as HTML and sends nothing.
  if (preview) {
    return new Response(buildEmailHtml(data), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // Draft goes to Chase only.
  const recipient = toOverride || process.env.FINANCE_TO || process.env.RECAP_EMAIL || "chasetbeach@gmail.com";

  const resend = new Resend(process.env.RESEND_API_KEY);
  let result;
  try {
    result = await resend.emails.send({
      from: process.env.ADVISOR_FROM || process.env.RESEND_FROM || `${ADVISOR_NAME} <onboarding@resend.dev>`,
      to: recipient,
      subject: `[Draft to approve] ${monthLabel(month)} money recap`,
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
  return NextResponse.json({ ok: true, mode: "draft", sentTo: recipient, month, id: result.data?.id });
}
