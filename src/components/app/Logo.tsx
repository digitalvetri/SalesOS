import { cn } from "@/lib/utils";
import { BRAND, LOGO } from "@/config/brand";

// Kumar Food Machinery (KFM) brand. Vector artwork lives in public/brand/:
//   kfm-emblem.svg       the KFM ring mark (green + charcoal, transparent)
//   kfm-lockup.svg       full horizontal logo for light backgrounds
//   kfm-lockup-light.svg full logo recoloured for dark backgrounds
// Flat colours only. Keep in sync with src/app/icon.svg and public/icons/*.
export const EMBLEM_SRC = "/brand/kfm-emblem.svg";
export const LOCKUP_SRC = "/brand/kfm-lockup.svg";
export const LOCKUP_LIGHT_SRC = "/brand/kfm-lockup-light.svg";

/**
 * The KFM emblem. `tile` puts it on a white rounded badge so the charcoal parts
 * stay visible on dark backgrounds (sidebar, dark theme).
 */
export function LogoMark({ size = 36, className, tile = false }: { size?: number; className?: string; tile?: boolean }) {
  if (!tile) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static vector asset, no optimisation needed
      <img src={EMBLEM_SRC} width={size} height={size} alt="" aria-hidden className={cn("shrink-0", className)} />
    );
  }
  const pad = Math.round(size * 0.08);
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center bg-white", className)}
      style={{ width: size, height: size, padding: pad, borderRadius: Math.round(size * 0.22) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static vector asset */}
      <img src={EMBLEM_SRC} width={size - pad * 2} height={size - pad * 2} alt="" className="block h-full w-full" />
    </span>
  );
}

/**
 * "KUMAR / FOOD MACHINERY" wordmark in the logo colours (green + charcoal).
 * Default follows the theme tokens (light: logo charcoal + green; dark theme: light ink +
 * light green). `onDark` forces white + light green for always-dark surfaces like the sidebar.
 */
export function Wordmark({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  const green = onDark ? LOGO.greenOnDark : "var(--color-gold)";
  const ink = onDark ? "#FFFFFF" : "var(--color-ink)";
  return (
    <span className={cn("flex flex-col font-bold uppercase leading-none", className)}>
      <span className="text-[1.15em] tracking-[0.04em]" style={{ color: green }}>
        Kumar
      </span>
      <span className="mt-[4px] whitespace-nowrap text-[0.58em] tracking-[0.12em]">
        <span style={{ color: ink }}>Food</span> <span style={{ color: green }}>Machinery</span>
      </span>
    </span>
  );
}

export function Logo({
  size = 36,
  className,
  onDark = false,
}: {
  size?: number;
  className?: string;
  onDark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label={BRAND.name}>
      <LogoMark size={size} tile={onDark} />
      <Wordmark onDark={onDark} />
    </span>
  );
}
