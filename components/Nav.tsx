"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import { useAuth } from "@/lib/auth";

// Elegant high-contrast serif, used only for Annie's monogram "A" tab icon.
const playfair = Playfair_Display({ subsets: ["latin"], weight: "700", style: "italic" });

type Tab = { href: string; label: string; icon: string };

// Most-used tabs stay top-level; the rest live under an "Other" menu.
const PRIMARY: Tab[] = [
  { href: "/today", label: "Today", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/goals", label: "Goals", icon: "M12 2l2.6 6.6L21 9.3l-5 4.6L17.3 21 12 17.3 6.7 21 8 13.9l-5-4.6 6.4-.7z" },
  { href: "/health", label: "Health", icon: "M3 12h4l2 6 4-14 2 8h6" },
  { href: "/lifts", label: "Workouts", icon: "M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10" },
];

const OTHER: Tab[] = [
  { href: "/annie", label: "Annie", icon: "M12 21s-6.7-4.4-9.3-8.1C.9 10.3 2 6.5 5.2 6c2-.3 3.6.8 4.3 2 .7-1.2 2.3-2.3 4.3-2 3.2.5 4.3 4.3 2.5 6.9C18.7 16.6 12 21 12 21z" },
  { href: "/weekly-review", label: "Weekly", icon: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" },
  { href: "/travel", label: "Travel", icon: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" },
  { href: "/code", label: "Code", icon: "M8 9l-4 3 4 3M16 9l4 3-4 3M13 6l-2 12" },
  { href: "/finance", label: "Finance", icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { href: "/interiors", label: "Sarah Beach Interiors", icon: "M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 11h18a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM5 18v2M19 18v2" },
  { href: "/projects", label: "Projects", icon: "M3 7h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { href: "/quotes", label: "Quotes", icon: "M10 11H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2zm0 0c0 3-1 4-3 5m13-5h-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2zm0 0c0 3-1 4-3 5" },
];

// Horizontal ellipsis — the "Other" / more icon.
const MORE_ICON = "M5 12h.01M12 12h.01M19 12h.01";

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

// Tab glyph — Annie gets her serif monogram, everything else a line icon.
function TabIcon({ tab }: { tab: Tab }) {
  if (tab.href === "/annie") {
    return (
      <span
        className={`${playfair.className} grid h-[22px] w-[22px] place-items-center text-[20px] leading-none`}
        aria-hidden
      >
        A
      </span>
    );
  }
  return <Icon d={tab.icon} />;
}

export default function Nav() {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the "Other" menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const onOther = OTHER.some((t) => pathname === t.href);

  return (
    <>
      {/* Desktop / tablet: top bar */}
      <header className="sticky top-0 z-20 hidden border-b border-line bg-bg/90 backdrop-blur sm:block">
        <nav className="mx-auto flex max-w-content items-center gap-1 px-6 py-3">
          <span className="mr-4 bg-gradient-to-r from-sky via-indigo to-teal bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
            The Daily Chase
          </span>
          {PRIMARY.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            );
          })}

          {/* Other dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                onOther || menuOpen ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink"
              }`}
            >
              Other <span className="text-xs">▾</span>
            </button>
            {menuOpen && (
              <>
                {/* Click-away backdrop */}
                <button
                  className="fixed inset-0 z-20 cursor-default"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                />
                <div className="absolute left-0 z-30 mt-2 w-44 overflow-hidden rounded-lg border border-line bg-card py-1 shadow-card-hover">
                  {OTHER.map((t) => {
                    const active = pathname === t.href;
                    return (
                      <Link
                        key={t.href}
                        href={t.href}
                        className={`block px-3 py-2 text-sm font-medium ${
                          active ? "bg-bg text-ink" : "text-muted hover:bg-bg hover:text-ink"
                        }`}
                      >
                        {t.label}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => signOut()}
            className="ml-auto text-sm font-medium text-muted hover:text-coral"
          >
            Sign out
          </button>
        </nav>
      </header>

      {/* Mobile: bottom tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-card/95 backdrop-blur sm:hidden">
        {PRIMARY.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                active ? "text-indigo" : "text-muted"
              }`}
            >
              <TabIcon tab={t} />
              {t.label}
            </Link>
          );
        })}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
            onOther || menuOpen ? "text-indigo" : "text-muted"
          }`}
        >
          <Icon d={MORE_ICON} />
          Other
        </button>
      </nav>

      {/* Mobile: "Other" sheet, anchored above the bottom bar */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end sm:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative mx-2 grid grid-cols-3 gap-1 rounded-2xl border border-line bg-card p-2 shadow-card-hover"
            style={{ marginBottom: "calc(env(safe-area-inset-bottom) + 64px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {OTHER.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`flex flex-col items-center gap-1 rounded-lg py-3 text-[11px] font-medium ${
                    active ? "bg-bg text-indigo" : "text-muted hover:bg-bg hover:text-ink"
                  }`}
                >
                  <TabIcon tab={t} />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
