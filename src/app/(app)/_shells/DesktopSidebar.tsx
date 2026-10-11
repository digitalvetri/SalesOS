import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type SidebarItem = {
  label: string;
  icon: ReactNode;
  href?: string;
  disabled?: boolean;
  active?: boolean;
};

export function DesktopSidebar({ items }: { items: SidebarItem[] }) {
  return (
    <aside className="hidden min-h-dvh w-60 shrink-0 border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-4 md:block">
      <nav aria-label="Primary" className="flex flex-col gap-1 text-sm">
        {items.map((item) => {
          const classes = cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-[color:var(--color-ink-2)]",
            item.active && "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)] font-medium",
            item.disabled && "pointer-events-none opacity-40",
            !item.disabled && !item.active && "hover:bg-[color:var(--color-surface-2)]",
          );
          if (item.href && !item.disabled) {
            return (
              <Link
                key={item.label}
                href={item.href}
                className={classes}
                aria-current={item.active ? "page" : undefined}
              >
                <span aria-hidden>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          }
          return (
            <span key={item.label} className={classes} aria-disabled={item.disabled}>
              <span aria-hidden>{item.icon}</span>
              <span>{item.label}</span>
            </span>
          );
        })}
      </nav>
    </aside>
  );
}
