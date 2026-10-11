"use client";
import * as React from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/i18n/locale";
import { cn } from "@/lib/utils";

export function LangToggle({ className }: { className?: string }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const setLocale = (next: Locale) => {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "inline-flex items-center overflow-hidden rounded-full border border-[color:var(--color-border-strong)] text-xs",
        pending && "opacity-60",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={cn(
          "px-2 py-1 font-medium transition-colors",
          locale === "en"
            ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
            : "text-[color:var(--color-ink-2)]",
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("ta")}
        aria-pressed={locale === "ta"}
        className={cn(
          "px-2 py-1 font-medium transition-colors",
          locale === "ta"
            ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
            : "text-[color:var(--color-ink-2)]",
        )}
      >
        த
      </button>
    </div>
  );
}
