// Minimal Twilio SMS sender (REST API via fetch, no SDK). Used for the
// "washer/dryer is done" text. Silently no-ops when Twilio isn't configured so
// local dev never sends real messages.

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM
  );
}

export async function sendSms(to: string[], body: string): Promise<{ sent: number }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    console.log(`[sms] Twilio not configured; would send to ${to.join(", ")}: ${body}`);
    return { sent: 0 };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  let sent = 0;
  const failures: string[] = [];
  for (const dest of to) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: dest, Body: body }),
    });
    if (res.ok) sent++;
    else failures.push(`${dest}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  if (failures.length) throw new Error(`Twilio send failed — ${failures.join("; ")}`);
  return { sent };
}

/** Comma-separated E.164 numbers from an env var. */
export function parseRecipients(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
