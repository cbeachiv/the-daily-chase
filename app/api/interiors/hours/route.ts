import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { anthropic, CLAUDE_MODEL, textOf } from "@/lib/anthropic";
import {
  matchClient,
  clientEarnings,
  formatHours,
  formatMoney,
  todayISO,
} from "@/lib/interiors";
import type { DesignClient, DesignHoursEntry } from "@/lib/types";

export const runtime = "nodejs";

// Inbound-email → hours pipeline for Sarah Beach Interiors. Sarah emails the
// Postmark inbound address (forwarded to/aliased as hours@thedailychase.com)
// describing what she worked on and for how long. Postmark POSTs the parsed
// message here as JSON. We authenticate via a secret token in the webhook URL
// (?token=...) plus a sender allowlist, let Claude parse the project + hours +
// kind + a short description, match it to a client, append a designHours entry,
// and reply via Resend to confirm. We always return 200 on a parse/match miss so
// Postmark doesn't retry; auth failures return 401.

// Postmark inbound payload — only the fields we use. `FromFull` carries the
// structured sender; `TextBody`/`HtmlBody` carry the message.
interface PostmarkInbound {
  FromFull?: { Email?: string; Name?: string };
  From?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
}

function senderEmail(body: PostmarkInbound): string {
  const structured = body.FromFull?.Email;
  if (structured) return structured.trim().toLowerCase();
  const from = body.From ?? "";
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

// Plain text when available, otherwise a rough strip of the HTML body.
function bodyText(body: PostmarkInbound): string {
  if (body.TextBody && body.TextBody.trim()) return body.TextBody;
  return (body.HtmlBody ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Parsed {
  clientName: string;
  hours: number;
  date: string;
  kind: "design" | "billable";
  description: string;
}

async function parseEmail(
  clients: DesignClient[],
  subject: string,
  text: string
): Promise<Parsed | null> {
  const roster = clients
    .map((c) => `- ${c.clientName}${c.address ? ` (${c.address})` : ""} — rooms: ${c.rooms.join(", ") || "n/a"}`)
    .join("\n");

  const prompt = [
    "Sarah runs an interior-design business and logs her work hours by email.",
    "Extract a single hours entry from the message below.",
    "",
    "Her current clients:",
    roster || "(none on file)",
    "",
    `Email subject: ${subject || "(none)"}`,
    `Email body:\n${text}`,
    "",
    "Return ONLY a JSON object with these keys:",
    `- "clientName": the client this work was for, matching one of the names above as closely as possible.`,
    `- "hours": number of hours worked (decimal allowed).`,
    `- "date": the work date as YYYY-MM-DD; if she says "today" or gives none, use ${todayISO()}.`,
    `- "kind": "billable" if the work is managing purchases or installations billed to the client, otherwise "design" (the actual designing). Default to "design" when ambiguous.`,
    `- "description": a concise summary (max ~12 words) of what she worked on.`,
    `If you can't find a client or an hours amount, return {"error": true}.`,
    "No prose, no markdown — just the JSON object.",
  ].join("\n");

  try {
    const msg = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = textOf(msg).trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    if (obj.error) return null;
    const hours = Number(obj.hours);
    if (!hours || hours <= 0) return null;
    return {
      clientName: String(obj.clientName ?? ""),
      hours,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(obj.date)) ? String(obj.date) : todayISO(),
      kind: obj.kind === "billable" ? "billable" : "design",
      description: String(obj.description ?? "").slice(0, 200),
    };
  } catch (err) {
    console.error("Hours email parse failed:", err);
    return null;
  }
}

async function reply(to: string, subject: string, html: string) {
  if (!to) return;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM || "The Daily Chase <onboarding@resend.dev>",
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("Hours confirmation reply failed:", err);
  }
}

export async function POST(req: Request) {
  // Authenticate the webhook via a shared secret carried in the URL (?token=...).
  // Postmark lets you set the inbound webhook URL with this query string, so only
  // requests that know the token reach the handler.
  const expected = process.env.INBOUND_WEBHOOK_TOKEN;
  if (expected) {
    const token = new URL(req.url).searchParams.get("token");
    if (token !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: PostmarkInbound;
  try {
    body = (await req.json()) as PostmarkInbound;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Defense in depth: only act on mail from Sarah (or Chase).
  const sender = senderEmail(body);
  const allow = [process.env.SARAH_EMAIL, "chasetbeach@gmail.com"]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  if (!allow.includes(sender)) {
    return NextResponse.json({ ok: true, ignored: "sender not allowlisted" });
  }

  const subject = String(body.Subject ?? "");
  const text = bodyText(body);

  const list = await adminAuth().listUsers(1);
  const user = list.users[0];
  if (!user) return NextResponse.json({ ok: true });
  const uid = user.uid;

  const clientsSnap = await adminDb().collection(`users/${uid}/designClients`).get();
  const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as DesignClient);

  const parsed = await parseEmail(clients, subject, text);
  if (!parsed) {
    await reply(
      sender,
      "Couldn't log those hours",
      "<p>I couldn't tell which project or how many hours from that note. Try something like: <em>“2 hours on Julie's living room today, sketched the layout”.</em></p>"
    );
    return NextResponse.json({ ok: true, parsed: false });
  }

  const client = matchClient(clients, `${parsed.clientName} ${subject} ${text}`);
  if (!client) {
    await reply(
      sender,
      "Which client?",
      `<p>I read ${formatHours(parsed.hours)} hours but couldn't match a client from “${parsed.clientName}”. Add the client name and resend, or log it in the app.</p>`
    );
    return NextResponse.json({ ok: true, matched: false });
  }

  await adminDb()
    .collection(`users/${uid}/designHours`)
    .add({
      clientId: client.id,
      date: parsed.date,
      hours: parsed.hours,
      kind: parsed.kind,
      description: parsed.description,
      source: "email",
      createdAt: new Date().toISOString(),
    } satisfies Omit<DesignHoursEntry, "id">);

  // Tally the project so far for the confirmation line.
  const hoursSnap = await adminDb()
    .collection(`users/${uid}/designHours`)
    .where("clientId", "==", client.id)
    .get();
  let design = 0;
  let billable = 0;
  for (const d of hoursSnap.docs) {
    const e = d.data() as DesignHoursEntry;
    if (e.kind === "billable") billable += e.hours;
    else design += e.hours;
  }
  const earnings = clientEarnings(client, billable);

  await reply(
    sender,
    `Logged ${formatHours(parsed.hours)} ${parsed.kind} hrs, ${client.clientName}`,
    `<p>Logged <strong>${formatHours(parsed.hours)} ${parsed.kind} hours</strong> to ${client.clientName}${
      parsed.description ? ` — “${parsed.description}”` : ""
    }.</p>
     <p>Project so far: ${formatHours(design)} design hrs · ${formatHours(billable)} billable hrs · earnings ${formatMoney(earnings)}.</p>
     <p style="color:#888;font-size:13px">Logged as <strong>${parsed.kind}</strong>. If that's wrong, fix it in the app.</p>`
  );

  return NextResponse.json({ ok: true, clientId: client.id, kind: parsed.kind, hours: parsed.hours });
}
