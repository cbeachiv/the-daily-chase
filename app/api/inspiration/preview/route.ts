import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/verifyUser";
import { previewLink } from "@/lib/linkPreview";

export const runtime = "nodejs";

// Resolve a pasted URL into a Home Inspiration pin (kind, title, preview
// image). Server-side because most sites block cross-origin fetches.
export async function POST(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = (await req.json().catch(() => ({}))) as { url?: unknown };
  if (typeof url !== "string" || !url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  const preview = await previewLink(url);
  if (!preview) return NextResponse.json({ error: "That doesn't look like a web link" }, { status: 400 });
  return NextResponse.json(preview);
}
