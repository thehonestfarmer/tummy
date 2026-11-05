"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * Today, then the library and its review queue. Train and Trends take the
 * last two places when they are built (healthspec.md §12, steps 7 and 11).
 */
const TABS = [
  { href: "/today", label: "Today" },
  { href: "/library", label: "Library" },
  { href: "/review", label: "Review" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="border-t border-hairline bg-ground/95 backdrop-blur-sm"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="flex">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className="flex h-15 items-center justify-center text-[0.95rem]"
                style={{ height: "var(--tab-h)", color: active ? "var(--ink)" : "var(--ink-faint)" }}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
