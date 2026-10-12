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
      className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-[color:var(--color-border)] px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative -mb-px shrink-0 whitespace-nowrap rounded-t-md px-4 py-2.5 text-sm transition-colors",
              active
                ? "border-b-2 border-[color:var(--color-gold)] font-semibold text-[color:var(--color-gold)]"
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
