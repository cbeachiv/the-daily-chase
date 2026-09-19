// Server-only Firestore access for the laundry feature (Admin SDK, bypasses
// rules — clients are denied on laundry/* by firestore.rules).
import { adminDb } from "@/lib/firebase/admin";
import {
  normalizeConfig,
  normalizeDoc,
  type LaundryConfig,
  type LaundryDoc,
} from "@/lib/laundry";

export const STATUS_PATH = "laundry/status";
export const CONFIG_PATH = "laundry/config";
export const EVENTS_COLLECTION = "laundryEvents";

export async function readLaundry(): Promise<{ doc: LaundryDoc; config: LaundryConfig }> {
  const db = adminDb();
  const [statusSnap, configSnap] = await Promise.all([
    db.doc(STATUS_PATH).get(),
    db.doc(CONFIG_PATH).get(),
  ]);
  return {
    doc: normalizeDoc(statusSnap.data()),
    config: normalizeConfig(configSnap.data()),
  };
}

export async function readConfig(): Promise<LaundryConfig> {
  const snap = await adminDb().doc(CONFIG_PATH).get();
  return normalizeConfig(snap.data());
}
