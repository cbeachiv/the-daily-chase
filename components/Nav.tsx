"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const TABS = [
  { href: "/today", label: "Today", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/goals", label: "Goals", icon: "M12 2l2.6 6.6L21 9.3l-5 4.6L17.3 21 12 17.3 6.7 21 8 13.9l-5-4.6 6.4-.7z" },
  { href: "/weekly-review", label: "Weekly", icon: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" },
  { href: "/health", label: "Health", icon: "M3 12h4l2 6 4-14 2 8h6" },
  { href: "/lifts", label: "Lifts", icon: "M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10" },
  { href: "/travel", label: "Travel", icon: "M2 16l20-6-7 9-2-4-4-1zM8 12l4-7" },
  { href: "/code", label: "Code", icon: "M8 9l-4 3 4 3M16 9l4 3-4 3M13 6l-2 12" },
  { href: "/quotes", label: "Quotes", icon: "M10 11H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2zm0 0c0 3-1 4-3 5m13-5h-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2zm0 0c0 3-1 4-3 5" },
];

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

export default function Nav() {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <>
      {/* Desktop / tablet: top bar */}
      <header className="sticky top-0 z-20 hidden border-b border-line bg-bg/90 backdrop-blur sm:block">
        <nav className="mx-auto flex max-w-content items-center gap-1 px-6 py-3">
          <span className="mr-4 bg-gradient-to-r from-sky via-indigo to-teal bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
            The Daily Chase
          </span>
          {TABS.map((t) => {
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
          <button
            onClick={() => signOut()}
            className="ml-auto text-sm font-medium text-muted hover:text-coral"
          >
            Sign out
          </button>
        </nav>
      </header>

      {/* Mobile: bottom tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 grid grid-cols-8 border-t border-line bg-card/95 backdrop-blur sm:hidden">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                active ? "text-indigo" : "text-muted"
              }`}
            >
              <Icon d={t.icon} />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
