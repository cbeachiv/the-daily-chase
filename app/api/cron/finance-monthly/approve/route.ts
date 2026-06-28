import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase/admin";
import { monthLabel } from "@/lib/finance";
import { buildMonthlyEmailData, getPrimaryUid, verifyApproveToken } from "../build";
import { buildEmailHtml, ADVISOR_NAME, type FinanceMonthlyEmailData } from "../email";

export const runtime = "nodejs";
export const maxDuration = 60;

// Minimal confirmation page shown after the link is clicked from the draft email.
function page(title: string, body: string, accent = "#15803d"): Response {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;background:#efe9dd;font-family:Helvetica,Arial,sans-serif">
<div style="max-width:460px;margin:60px auto;padding:32px 28px;background:#fff;border-radius:18px;border:1px solid #e4dccc">
<div style="font:900 22px Helvetica,Arial,sans-serif;color:${accent};margin-bottom:10px">${title}</div>
<div style="font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#33312b">${body}</div>
</div></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

// Clicked from the draft email's "Approve & send to Sarah" button. Verifies the
// month-scoped token, recomputes fresh numbers (so any late imports are picked up),
// and sends the FINAL recap to Chase + Sarah. Idempotent: a second click won't
// re-send.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const month = params.get("month") || "";
  const token = params.get("token");

  if (!/^\d{4}-\d{2}$/.test(month) || !verifyApproveToken(month, token)) {
    return page("Link not valid", "This approval link is invalid or has expired. Open the most recent draft email and try again.", "#e1574c");
  }

  const uid = await getPrimaryUid();
  if (!uid) return NextResponse.json({ error: "No user" }, { status: 404 });

  const approvalRef = adminDb().doc(`users/${uid}/financeMonthlyApprovals/${month}`);
  const existing = await approvalRef.get();
  if (existing.exists && existing.data()?.sentAt) {
    const when = new Date(existing.data()!.sentAt).toLocaleString("en-US", { timeZone: "America/New_York" });
    return page(
      "Already sent ✓",
      `The ${monthLabel(month)} recap was already approved and sent to you and Sarah on ${when}. No duplicate was sent.`,
      "#6b7280"
    );
  }

  const core = await buildMonthlyEmailData(uid, month);
  const data: FinanceMonthlyEmailData = { ...core, mode: "final" };

  const to = process.env.FINANCE_TO || process.env.RECAP_EMAIL || "chasetbeach@gmail.com";
  const cc = (process.env.FINANCE_CC || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const resend = new Resend(process.env.RESEND_API_KEY);
  let result;
  try {
    result = await resend.emails.send({
      from: process.env.ADVISOR_FROM || process.env.RESEND_FROM || `${ADVISOR_NAME} <onboarding@resend.dev>`,
      to,
      ...(cc.length ? { cc } : {}),
      subject: `Your ${monthLabel(month)} money recap`,
      html: buildEmailHtml(data),
    });
  } catch (err) {
    console.error("Approve send threw:", err);
    return page("Send failed", "Something went wrong sending the recap. Try the link again in a minute.", "#e1574c");
  }
  if (result.error) {
    console.error("Approve send rejected:", result.error);
    return page("Send failed", `Email service rejected the send: ${result.error.message}`, "#e1574c");
  }

  await approvalRef.set({
    month,
    sentAt: new Date().toISOString(),
    sentTo: to,
    cc,
    emailId: result.data?.id ?? null,
  });

  const recipients = [to, ...cc].join(", ");
  return page("Sent to you and Sarah ✓", `The ${monthLabel(month)} recap is on its way to ${recipients}. You can close this tab.`);
}
