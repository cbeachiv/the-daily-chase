"use client";

import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase/client";

// Phone photos are 3–8MB; downscaling client-side keeps Storage small and
// uploads fast. Longest edge ~1600px, JPEG quality ~0.85.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

async function downscale(file: File): Promise<Blob> {
  // Only attempt to recompress raster images; pass anything else through as-is.
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    return blob ?? file;
  } catch {
    // If anything in the canvas path fails, fall back to the original file.
    return file;
  }
}

function safeName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
  return `${base || "photo"}.jpg`;
}

/**
 * Upload a photo for Annie under users/{uid}/annie/. Returns the public download
 * URL plus the storage path (stored on the moment so the file can be deleted).
 */
export async function uploadAnniePhoto(
  uid: string,
  file: File,
): Promise<{ url: string; path: string }> {
  const blob = await downscale(file);
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const path = `users/${uid}/annie/${id}-${safeName(file.name)}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  const url = await getDownloadURL(storageRef);
  return { url, path };
}

/** Best-effort delete of a previously uploaded photo. */
export async function deleteAnniePhoto(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Non-fatal — the moment is gone regardless of whether the file lingered.
  }
}
