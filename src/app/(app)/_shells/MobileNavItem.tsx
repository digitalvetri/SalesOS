"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type MobileNavItemProps = {
  href?: string;
  disabled?: boolean;
  active?: boolean;
  icon: ReactNode;
  label: string;
};

export function MobileNavItem({ href, disabled, active: activeProp, icon, label }: MobileNavItemProps) {
  const pathname = usePathname();
  // Explicit `active` wins; otherwise match the current route (same rule as DesktopSidebar).
  const active =
    activeProp ??
    (href ? (href === "/home" ? pathname === "/home" : pathname === href || pathname.startsWith(`${href}/`)) : false);
  const content = (
    <>
      <span aria-hidden className="text-lg">
        {icon}
      </span>
      <span className="text-[11px] leading-none">{label}</span>
    </>
  );
  const classes = cn(
    "flex min-h-[48px] min-w-[48px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[color:var(--color-ink-2)]",
    active && "text-[color:var(--color-ink)]",
    disabled && "pointer-events-none opacity-40",
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={classes} aria-current={active ? "page" : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <span className={classes} aria-disabled={disabled}>
      {content}
    </span>
  );
}
