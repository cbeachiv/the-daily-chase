// Shared (client + server) helpers for the Home Inspiration board.

export const INSPIRATION = "homeInspiration";

// Suggested tags; any free-text room also works.
export const ROOMS = [
  "Kitchen",
  "Living",
  "Bedroom",
  "Bath",
  "Nursery",
  "Office",
  "Outdoor",
  "Exterior",
  "Details",
];

/** Pull the 11-char video id out of any YouTube URL shape (watch, youtu.be, shorts, embed, live). */
export function youTubeId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function youTubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function isImageUrl(raw: string): boolean {
  try {
    return /\.(jpe?g|png|gif|webp|avif|heic)$/i.test(new URL(raw).pathname);
  } catch {
    return false;
  }
}

/** First http(s) URL in a blob of pasted/shared text (share sheets often add a title line). */
export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;]+$/, "") : null;
}
