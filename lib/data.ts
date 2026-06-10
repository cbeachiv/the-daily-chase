"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth";

// All data lives under users/{uid}/<collection>.
function colRef(uid: string, name: string) {
  return collection(db, "users", uid, name);
}

/**
 * Subscribe to a user subcollection in real time. Returns docs (with id),
 * loading flag, and the resolved uid for writes.
 */
export function useCollection<T>(
  name: string,
  constraints: QueryConstraint[] = []
): { data: T[]; loading: boolean; uid: string | null } {
  const { user } = useAuth();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = user?.uid ?? null;
  // Stable dependency key so the effect re-subscribes when the query changes.
  const key = JSON.stringify(constraints.map((c) => (c as unknown as { _key?: string })._key ?? ""));

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const q = query(colRef(uid, name), ...constraints);
    return onSnapshot(q, (snap) => {
      setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, name, key]);

  return { data, loading, uid };
}

export async function addItem(uid: string, name: string, data: Record<string, unknown>) {
  const ref = doc(colRef(uid, name));
  await setDoc(ref, { ...data, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function setItem(
  uid: string,
  name: string,
  id: string,
  data: Record<string, unknown>
) {
  await setDoc(doc(db, "users", uid, name, id), data, { merge: true });
}

export async function updateItem(
  uid: string,
  name: string,
  id: string,
  data: Record<string, unknown>
) {
  await updateDoc(doc(db, "users", uid, name, id), data);
}

export async function deleteItem(uid: string, name: string, id: string) {
  await deleteDoc(doc(db, "users", uid, name, id));
}
