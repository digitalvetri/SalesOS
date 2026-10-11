"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type Tab = { href: string; label: string; exact?: boolean };

export function Tabs({ tabs, label = "Settings sections" }: { tabs: Tab[]; label?: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="mb-6 flex gap-1 border-b border-[color:var(--color-border)]"
    >
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative -mb-px rounded-t-md px-4 py-2 text-sm transition-colors",
              active
                ? "border-b-2 border-[color:var(--color-ink)] font-medium text-[color:var(--color-ink)]"
                : "text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
