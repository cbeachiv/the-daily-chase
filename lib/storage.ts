"use client";

import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase/client";

export type MediaType = "image" | "video";

// Phone photos are 3–8MB; downscaling client-side keeps Storage small and
// uploads fast. Longest edge ~1600px, JPEG quality ~0.85.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

// Videos can't be transcoded in the browser, so they upload at full size.
// Cap them to protect the no-cost Storage quota and keep mobile uploads sane.
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

async function downscale(file: File): Promise<Blob> {
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

function baseName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .slice(0, 40) || "media"
  );
}

function nameExt(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}

function uuid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/**
 * Upload a photo or video for Annie under users/{uid}/annie/. Images are
 * downscaled to JPEG; videos upload as-is (subject to MAX_VIDEO_BYTES).
 * Returns the public download URL, the storage path (kept on the moment so
 * the file can be deleted), and which media type it is.
 */
export async function uploadAnnieMedia(
  uid: string,
  file: File,
): Promise<{ url: string; path: string; mediaType: MediaType }> {
  const isVideo = file.type.startsWith("video/");

  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new Error("Video is too large — keep it under 100 MB.");
  }

  let blob: Blob = file;
  let contentType = file.type || "application/octet-stream";
  let ext = nameExt(file.name) || (isVideo ? "mp4" : "bin");

  if (file.type.startsWith("image/")) {
    const out = await downscale(file);
    if (out === file) {
      // Canvas fell back to the original — keep its real type/extension.
      contentType = file.type || "image/jpeg";
    } else {
      blob = out;
      contentType = "image/jpeg";
      ext = "jpg";
    }
  }

  const path = `users/${uid}/annie/${uuid()}-${baseName(file.name)}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType });
  const url = await getDownloadURL(storageRef);
  return { url, path, mediaType: isVideo ? "video" : "image" };
}

/** Best-effort delete of a previously uploaded photo or video. */
export async function deleteAnnieMedia(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Non-fatal — the moment is gone regardless of whether the file lingered.
  }
}
