import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

export const runtime = "nodejs";

// Simple gate: the user types one password (GATE_PASSWORD). If it matches, we
// mint a Firebase custom token for the single account and hand it back, so the
// real Firebase credentials never live in the browser.
export async function POST(req: Request) {
  let password = "";
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const gate = process.env.GATE_PASSWORD;
  if (!gate || password !== gate) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const list = await adminAuth().listUsers(1);
  const user = list.users[0];
  if (!user) return NextResponse.json({ error: "No account" }, { status: 404 });

  const token = await adminAuth().createCustomToken(user.uid);
  return NextResponse.json({ token });
}
