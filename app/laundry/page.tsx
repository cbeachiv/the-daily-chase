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
  appleWebApp: { capable: true, title: "Laundry", statusBarStyle: "default" },
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
