"use client";
// Phone-first input (spec §12.1, §11.3 Step 1): +91 fixed prefix, numeric keypad,
// live validation + debounced lookup of a matching customer card.
import * as React from "react";
import { tryNormalizePhone } from "@/server/domain/phone";
import { cn } from "@/lib/utils";

export type PhoneMatch = {
  id: string;
  name: string;
  businessName: string | null;
  phoneE164: string;
  city: string | null;
  ordersCount: number;
};

export type PhoneInputProps = {
  id?: string;
  value: string; // raw user input
  onChange: (raw: string) => void;
  onNormalized?: (e164: string | null) => void;
  onMatch?: (match: PhoneMatch | null) => void;
  autoLookup?: boolean; // if true, hits /api/customers/search
  autoFocus?: boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

const LOOKUP_DEBOUNCE_MS = 250;

export function PhoneInput({
  id,
  value,
  onChange,
  onNormalized,
  onMatch,
  autoLookup = true,
  autoFocus,
  placeholder = "98437 22055",
  required,
  disabled,
  className,
}: PhoneInputProps) {
  const normalized = React.useMemo(() => tryNormalizePhone(value), [value]);
  const [match, setMatch] = React.useState<PhoneMatch | null>(null);
  const [lookupPending, setLookupPending] = React.useState(false);

  React.useEffect(() => {
    onNormalized?.(normalized?.e164 ?? null);
  }, [normalized?.e164, onNormalized]);

  // Debounced lookup. All state mutations run inside the debounced callback so
  // the effect never updates state synchronously (avoids cascading-render lint).
  const e164 = normalized?.e164 ?? "";
  React.useEffect(() => {
    if (!autoLookup) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      if (!e164 || e164.length < 10) {
        setMatch(null);
        setLookupPending(false);
        onMatch?.(null);
        return;
      }
      setLookupPending(true);
      try {
        const res = await fetch(
          `/api/customers/search?phone=${encodeURIComponent(e164)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!res.ok) {
          setMatch(null);
          onMatch?.(null);
          return;
        }
        const body = (await res.json()) as
          | { ok: true; data: { hits: PhoneMatch[] } }
          | { ok: false };
        if (!body.ok) {
          setMatch(null);
          onMatch?.(null);
          return;
        }
        const exact =
          body.data.hits.find((h) => h.phoneE164 === e164) ?? body.data.hits[0] ?? null;
        setMatch(exact);
        onMatch?.(exact);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setMatch(null);
        onMatch?.(null);
      } finally {
        setLookupPending(false);
      }
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [e164, autoLookup, onMatch]);

  const inputId = id ?? "phone-input";
  const invalid = value.length >= 6 && !normalized;

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "flex overflow-hidden rounded-[var(--radius)] border bg-[color:var(--color-surface)] focus-within:ring-2 focus-within:ring-[color:var(--color-ink)]/60",
          invalid
            ? "border-[color:var(--color-danger)]"
            : "border-[color:var(--color-border-strong)]",
        )}
      >
        <span className="flex items-center justify-center bg-[color:var(--color-surface-2)] px-3 text-sm text-[color:var(--color-ink-2)]">
          +91
        </span>
        <input
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          required={required}
          disabled={disabled}
          className="flex-1 border-0 bg-transparent px-3 text-base text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)] focus-visible:outline-none"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {invalid && (
        <p className="text-xs text-[color:var(--color-danger)]">
          Enter a valid 10-digit mobile number.
        </p>
      )}
      {match && (
        <div
          role="status"
          className="rounded-[var(--radius)] border border-[color:var(--color-ok)]/40 bg-[color:var(--color-ok-bg)] p-3 text-sm"
        >
          <div className="font-medium">
            ✓ {match.businessName ?? match.name}
            {match.businessName && (
              <span className="text-[color:var(--color-ink-3)]"> · {match.name}</span>
            )}
          </div>
          <div className="text-xs text-[color:var(--color-ink-2)]">
            {match.city ? `${match.city} · ` : ""}
            {match.ordersCount} order{match.ordersCount === 1 ? "" : "s"}
          </div>
        </div>
      )}
      {lookupPending && !match && (
        <p className="text-xs text-[color:var(--color-ink-3)]">Looking…</p>
      )}
    </div>
  );
}
