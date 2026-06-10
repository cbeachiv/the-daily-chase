import { adminAuth } from "@/lib/firebase/admin";

/**
 * Verify the Firebase ID token sent as `Authorization: Bearer <token>`.
 * Returns the uid, or null if missing/invalid.
 */
export async function verifyUser(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}
