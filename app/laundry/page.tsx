import type { Metadata } from "next";
import LaundryStatus from "@/components/LaundryStatus";
import { DEFAULT_CONFIG, deriveStatus, emptyDoc } from "@/lib/laundry";
import { readLaundry } from "@/lib/laundryServer";

// Public page served at www.3720centerstreet.com (host rewrite in
// next.config.mjs) and at /laundry on the main domain. No login.

export const metadata: Metadata = {
  title: "3720 Center St Laundry",
  description: "Is the washer or dryer free?",
  manifest: "/laundry-manifest.json",
  icons: {
    icon: [
      { url: "/laundry-icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/laundry-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/laundry-icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/laundry-icon-192.png",
    apple: { url: "/laundry-icon-180.png", sizes: "180x180" },
  },
  appleWebApp: { capable: true, title: "Laundry", statusBarStyle: "default" },
  openGraph: {
    title: "3720 Center St Laundry",
    description: "Is the washer or dryer free?",
    url: "https://www.3720centerstreet.com",
    siteName: "3720 Center St Laundry",
    images: [{ url: "https://www.3720centerstreet.com/laundry-og.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LaundryPage() {
  let initial;
  try {
    const { doc, config } = await readLaundry();
    initial = deriveStatus(doc, config, Date.now());
  } catch (err) {
    console.error("[laundry] page read failed:", err);
    initial = deriveStatus(emptyDoc(), DEFAULT_CONFIG, Date.now());
  }
  return <LaundryStatus initial={initial} />;
}
