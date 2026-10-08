import { isImageUrl, youTubeId, youTubeThumb } from "@/lib/inspiration";
import type { InspirationKind } from "@/lib/types";

// Server-only: turn a pasted/shared URL into a board pin. YouTube gets its
// title from oEmbed; image URLs are pinned as-is; any other page is fetched
// once for its og:title / og:image so the card has a picture.

export type LinkPreview = {
  kind: InspirationKind;
  url: string;
  imageUrl?: string;
  youtubeId?: string;
  title?: string;
};

const TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 1_000_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

// Only fetch public http(s) hosts — never loopback / private ranges.
function publicUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) ||
    h.startsWith("[")
  ) {
    return null;
  }
  return u;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function meta(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : undefined;
}

async function timedFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,image/*;q=0.9,*/*;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function previewLink(raw: string): Promise<LinkPreview | null> {
  const u = publicUrl(raw.trim());
  if (!u) return null;
  const url = u.toString();

  const yt = youTubeId(url);
  if (yt) {
    let title: string | undefined;
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${yt}`)}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (res.ok) title = ((await res.json()) as { title?: string }).title;
    } catch {
      // Title is a nicety; the video still pins without it.
    }
    return { kind: "youtube", url, youtubeId: yt, imageUrl: youTubeThumb(yt), title };
  }

  if (isImageUrl(url)) return { kind: "image", url };

  try {
    const res = await timedFetch(url);
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("image/")) {
      res.body?.cancel().catch(() => {});
      return { kind: "image", url };
    }
    const html = await readCapped(res);
    const tagTitle = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    const title =
      meta(html, "og:title") ?? meta(html, "twitter:title") ?? (tagTitle ? decode(tagTitle) : undefined);
    let image = meta(html, "og:image") ?? meta(html, "og:image:secure_url") ?? meta(html, "twitter:image");
    if (image) {
      try {
        image = new URL(image, res.url || url).toString();
      } catch {
        image = undefined;
      }
    }
    return { kind: "link", url, title: title || undefined, imageUrl: image };
  } catch {
    // Unreachable or blocked page: still pin the bare link.
    return { kind: "link", url, title: u.hostname.replace(/^www\./, "") };
  }
}
