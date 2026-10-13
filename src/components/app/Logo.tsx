import { cn } from "@/lib/utils";
import { BRAND, LOGO } from "@/config/brand";

// Kumaar Industries "Ki" mark: blue K (stem, arm, leg) + red i. Flat colours only.
// Keep in sync with src/app/icon.svg and public/icons/*.
function KiMark({ blue = LOGO.blue, red = LOGO.red }: { blue?: string; red?: string }) {
  return (
    <>
      <rect x="10" y="8" width="11" height="48" fill={blue} />
      <polygon points="21,32 44,8 57,8 27,40" fill={blue} />
      <polygon points="27,40 33,34 44,46 44,56 40,56" fill={blue} />
      <rect x="46" y="30" width="9" height="26" fill={red} />
      <rect x="46" y="20" width="9" height="7" fill={red} />
    </>
  );
}

/** The mark. `tile` puts it on a white rounded badge (for dark backgrounds). */
export function LogoMark({ size = 36, className, tile = false }: { size?: number; className?: string; tile?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className)}>
      {tile ? (
        <>
          <rect width="64" height="64" rx="14" fill="#FFFFFF" />
          <g transform="translate(6.4 6.4) scale(0.8)">
            <KiMark />
          </g>
        </>
      ) : (
        <KiMark />
      )}
    </svg>
  );
}

/** "Kumaar / INDUSTRIES" wordmark. `onDark` uses light ink for graphite surfaces. */
export function Wordmark({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className={cn("text-[1.15em] font-bold tracking-tight", onDark ? "text-white" : "text-[#1E2B4A]")}>Kumaar</span>
      <span className={cn("mt-[3px] text-[0.55em] font-bold tracking-[0.22em]", onDark ? "text-[#FF6B71]" : "text-[#D7262E]")}>INDUSTRIES</span>
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
