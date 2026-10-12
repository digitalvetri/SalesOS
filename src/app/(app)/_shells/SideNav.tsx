"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/app/Logo";
import s3d from "./sidebar.module.css";
import { SidebarScene } from "./SidebarScene";

import type * as React from "react";
import type { ReactNode } from "react";

export type NavItem = {
  label: string;
  // Icon is passed as pre-rendered JSX from the (server) shell.
  icon: ReactNode;
  href: string;
};

export function isActive(pathname: string, href: string) {
  return href === "/home" ? pathname === "/home" : pathname === href || pathname.startsWith(`${href}/`);
}

// ≥ 1280 px: full sidebar with labels. 768–1279 px: 76 px icon rail (labels
// become tooltips). Below 768 px the BottomNav takes over.
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col bg-[color:var(--color-sidebar-bg)] text-[color:var(--color-sidebar-ink)] md:flex xl:w-64">
      <Link
        href={items[0]?.href ?? "/home"}
        className="flex h-20 items-center justify-center gap-3 px-4 xl:justify-start xl:px-6"
        aria-label={BRAND.name}
      >
        <span className={s3d.logo}>
          <span className={s3d.logoMark}>
            <LogoMark size={36} />
          </span>
        </span>
        <span className="hidden text-xl font-bold tracking-tight text-[color:var(--color-sidebar-ink)] xl:inline">
          {BRAND.name}
        </span>
      </Link>

      <nav aria-label="Primary" className={cn("flex flex-col gap-1.5 px-3 py-4 xl:px-4", s3d.nav)}>
        {items.map((item, i) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              style={{ "--i": i } as React.CSSProperties}
              className={cn(
                s3d.item,
                active && s3d.active,
                "group relative flex h-12 items-center justify-center gap-3 rounded-[12px] text-[15px] font-medium text-[color:var(--color-sidebar-ink-2)] transition-colors xl:justify-start xl:px-4",
                active
                  ? "bg-[color:var(--color-sidebar-active-bg)] font-semibold text-white"
                  : "hover:bg-[color:var(--color-sidebar-hover)] hover:text-[color:var(--color-sidebar-ink)]",
              )}
            >
              <span aria-hidden className={cn("shrink-0", s3d.icon)}>
                {item.icon}
              </span>
              <span className="sr-only xl:not-sr-only">{item.label}</span>
              {/* Rail tooltip (tablet). */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md bg-[color:var(--color-ink)] px-2 py-1 text-xs font-medium text-[color:var(--color-bg)] opacity-0 shadow-[var(--shadow-2)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:block xl:hidden"
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Three.js scene in the free space (full sidebar only). */}
      <div className="hidden min-h-0 flex-1 xl:block">
        <SidebarScene />
      </div>
      <div className="flex-1 xl:hidden" />
      <div className="hidden items-start gap-3 px-6 pb-7 text-sm text-[color:var(--color-sidebar-ink-2)] xl:flex">
        <Zap className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--color-sidebar-ink)]" aria-hidden />
        <p className="leading-snug">
          Better Sales
          <br />
          Bigger Tomorrow
        </p>
      </div>
    </aside>
  );
}

// Below 768 px: fixed bottom tab bar (all roles).
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--color-nav-border)] bg-[color:var(--color-nav-bg)]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 text-[color:var(--color-nav-ink-3)] transition-colors",
                  active && "text-[color:var(--color-nav-accent)]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-[color:var(--color-nav-active-bg)]",
                  )}
                >
                  {item.icon}
                </span>
                <span className="w-full truncate text-center text-[11px] font-medium leading-none">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
