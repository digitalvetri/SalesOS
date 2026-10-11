"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type SidebarItem = {
  label: string;
  // Icon is passed as pre-rendered JSX from the (server) shell.
  icon: ReactNode;
  href?: string;
  disabled?: boolean;
  // Explicit active override. Otherwise auto-detected from pathname.
  active?: boolean;
};

export function DesktopSidebar({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();
  return (
    <aside className="hidden min-h-dvh w-64 shrink-0 border-r border-[color:var(--color-nav-border)] bg-[color:var(--color-nav-bg)] px-4 py-5 md:block">
      <nav aria-label="Primary" className="flex flex-col gap-1.5 text-[15px]">
        {items.map((item) => {
          const auto = item.href
            ? item.href === "/home"
              ? pathname === "/home"
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
            : false;
          const active = item.active ?? auto;
          const classes = cn(
            "flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 font-medium text-[color:var(--color-nav-ink-2)] tracking-[-0.005em] transition-colors",
            active &&
              "bg-[color:var(--color-nav-active-bg)] text-[color:var(--color-nav-accent)] font-semibold shadow-[0_1px_2px_rgba(60,46,20,0.05)]",
            item.disabled && "pointer-events-none opacity-40",
            !item.disabled &&
              !active &&
              "hover:bg-[color:var(--color-nav-bg-2)] hover:text-[color:var(--color-nav-ink)]",
          );
          if (item.href && !item.disabled) {
            return (
              <Link
                key={item.label}
                href={item.href}
                className={classes}
                aria-current={active ? "page" : undefined}
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
