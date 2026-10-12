import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";

// SalesOS mark: solid accent rounded square with three rising bars ("sales growing").
// Flat colours only. Keep in sync with src/app/icon.svg.
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <rect width="64" height="64" rx="16" fill="var(--color-accent)" />
      <rect x="14" y="36" width="9" height="14" rx="2.5" fill="#fff" />
      <rect x="27.5" y="27" width="9" height="23" rx="2.5" fill="#fff" />
      <rect x="41" y="16" width="9" height="34" rx="2.5" fill="#fff" />
    </svg>
  );
}

export function Logo({
  size = 36,
  className,
  wordmarkClassName,
}: {
  size?: number;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className={cn("font-bold tracking-tight", wordmarkClassName)}>{BRAND.name}</span>
    </span>
  );
}
