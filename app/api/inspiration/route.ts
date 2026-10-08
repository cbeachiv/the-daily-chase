import { NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { adminAuth, adminBucket, adminDb } from "@/lib/firebase/admin";
import { firstUrl, INSPIRATION } from "@/lib/inspiration";
import { previewLink } from "@/lib/linkPreview";

export const runtime = "nodejs";

// Share-sheet ingestion for the iOS "Save to Inspiration" Shortcut. Share a
// YouTube video, web page, or photo from any app and it lands on the
// /inspiration board. Auth is a shared bearer token like /api/steps
// (INSPIRATION_SECRET, falling back to STEPS_SECRET so the same token works).
//
// JSON body:      { url: "https://…" | "Title https://…", note?, room? }
// Multipart form: file=<image>, note?, room?   (photos from the share sheet)
// Response: { ok, kind, title }

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function authorized(req: Request): boolean | null {
  const secret = process.env.INSPIRATION_SECRET || process.env.STEPS_SECRET;
  if (!secret) return null;
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer (.+)$/);
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Firestore rejects undefined fields; drop them.
function clean(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : undefined;
}

export async function POST(req: Request) {
  const auth = authorized(req);
  if (auth === null) {
    return NextResponse.json({ error: "INSPIRATION_SECRET not configured" }, { status: 500 });
  }
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await adminAuth().listUsers(1);
  const uid = list.users[0]?.uid;
  if (!uid) return NextResponse.json({ error: "No account" }, { status: 404 });

  const now = new Date().toISOString();
  const col = adminDb().collection(`users/${uid}/${INSPIRATION}`);
  const isForm = (req.headers.get("content-type") ?? "").includes("multipart/form-data");

  if (isForm) {
    const form = await req.formData();
    const file = form.get("file");
    const note = str(form.get("note"));
    const room = str(form.get("room"));
    if (!(file instanceof Blob) || !file.size) {
      // A Shortcut may send a shared URL as a form field instead of a file.
      const text = str(form.get("url"));
      if (text) return pinUrl(text, note, room);
      return NextResponse.json({ error: "file or url required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only images can be uploaded" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is over 15 MB; resize it in the Shortcut" }, { status: 413 });
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/heic" ? "heic" : "jpg";
    const path = `users/${uid}/inspiration/${randomUUID()}.${ext}`;
    const token = randomUUID();
    const bucket = adminBucket();
    await bucket.file(path).save(Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    await col.add(clean({ kind: "image", url, path, note, room, source: "shortcut", createdAt: now }));
    return NextResponse.json({ ok: true, kind: "image", title: "Photo" });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = str(body?.url) ?? str(body?.text);
  if (!text) return NextResponse.json({ error: "url required" }, { status: 400 });
  return pinUrl(text, str(body?.note), str(body?.room));

  async function pinUrl(text: string, note?: string, room?: string) {
    const url = firstUrl(text);
    const preview = url ? await previewLink(url) : null;
    if (!preview) return NextResponse.json({ error: "No link found in what was shared" }, { status: 400 });
    await col.add(clean({ ...preview, note, room, source: "shortcut", createdAt: now }));
    return NextResponse.json({ ok: true, kind: preview.kind, title: preview.title ?? preview.url });
  }
}
