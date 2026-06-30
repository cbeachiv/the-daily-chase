import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
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

// Inbound-email → hours pipeline for Sarah Beach Interiors. Sarah emails an
// address (e.g. hours@thedailychase.com) describing what she worked on and for
// how long; Resend forwards the message here as a Svix-signed webhook. We verify
// the signature, confirm the sender is allowlisted, let Claude parse the project
// + hours + kind + a short description, match it to a client, append a
// designHours entry, and reply to confirm (so the design/billable call is easy
// to correct). We always return 200 so Resend doesn't retry a parse failure.

// Verify a Svix-signed webhook (Resend uses Svix). The signed content is
// `${id}.${timestamp}.${body}`, HMAC-SHA256'd with the base64 secret after the
// `whsec_` prefix; the header may carry several space-separated `v1,<sig>` pairs.
function verifySvix(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !timestamp || !sigHeader) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  return sigHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// `from` may be a plain "Name <addr>" string or a { address, name } object.
function senderEmail(from: unknown): string {
  if (typeof from === "string") {
    const m = from.match(/<([^>]+)>/);
    return (m ? m[1] : from).trim().toLowerCase();
  }
  if (from && typeof from === "object" && "address" in from) {
    return String((from as { address: string }).address).trim().toLowerCase();
  }
  return "";
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
  const rawBody = await req.text();

  // Verify the Svix signature when a secret is configured (skip locally so the
  // route can be exercised with a sample payload before DNS is set up).
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret && !verifySvix(rawBody, req.headers, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const data = event.data ?? {};

  // Defense in depth: only act on mail from Sarah (or Chase).
  const sender = senderEmail(data.from);
  const allow = [process.env.SARAH_EMAIL, "chasetbeach@gmail.com"]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  if (!allow.includes(sender)) {
    return NextResponse.json({ ok: true, ignored: "sender not allowlisted" });
  }

  const subject = String(data.subject ?? "");
  const text = String(data.text ?? data.html ?? "");

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
      "<p>I couldn't tell which project or how many hours from that note. Try something like: <em>“2 hours on Julie's living room today — sketched the layout”.</em></p>"
    );
    return NextResponse.json({ ok: true, parsed: false });
  }

  const client = matchClient(clients, `${parsed.clientName} ${subject} ${text}`);
  if (!client) {
    await reply(
      sender,
      "Which client?",
      `<p>I logged ${formatHours(parsed.hours)} hours but couldn't match a client from “${parsed.clientName}”. Add the client name and resend, or log it in the app.</p>`
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
    `Logged ${formatHours(parsed.hours)} ${parsed.kind} hrs — ${client.clientName}`,
    `<p>Logged <strong>${formatHours(parsed.hours)} ${parsed.kind} hours</strong> to ${client.clientName}${
      parsed.description ? ` — “${parsed.description}”` : ""
    }.</p>
     <p>Project so far: ${formatHours(design)} design hrs · ${formatHours(billable)} billable hrs · earnings ${formatMoney(earnings)}.</p>
     <p style="color:#888;font-size:13px">Logged as <strong>${parsed.kind}</strong>. If that's wrong, fix it in the app.</p>`
  );

  return NextResponse.json({ ok: true, clientId: client.id, kind: parsed.kind, hours: parsed.hours });
}
