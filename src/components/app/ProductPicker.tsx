"use client";
// Full-screen sheet on mobile; modal on desktop. Spec §10.5 and §11.3 Step 2.
// Debounced search via /api/products/search (pg_trgm backed).
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Search } from "lucide-react";
import { formatInr } from "@/components/app/Money";
import { cn } from "@/lib/utils";

export type ProductHit = {
  id: string;
  name: string;
  spec: string | null;
  customerPrice: string | null;
};

export type ProductPickerProps = {
  trigger: React.ReactNode;
  onPick: (hit: ProductHit) => void;
};

export function ProductPicker({ trigger, onPick }: ProductPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<ProductHit[]>([]);
  const [pending, setPending] = React.useState(false);

  // Debounced lookup. All state mutations run inside the setTimeout callback
  // so the effect never updates state synchronously (clean react-hooks lint).
  React.useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setHits([]);
        setPending(false);
        return;
      }
      setPending(true);
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`, {
          signal: ctl.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          setHits([]);
          return;
        }
        const body = (await res.json()) as
          | { ok: true; data: { hits: ProductHit[] } }
          | { ok: false };
        setHits(body.ok ? body.data.hits : []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setHits([]);
      } finally {
        setPending(false);
      }
    }, 200);
    return () => {
      ctl.abort();
      clearTimeout(t);
    };
  }, [q, open]);

  function pick(hit: ProductHit) {
    onPick(hit);
    setOpen(false);
    setQ("");
    setHits([]);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content
          className={cn(
            // Full-screen on mobile, modal on desktop
            "fixed inset-0 z-50 flex flex-col bg-[color:var(--color-surface)] md:left-1/2 md:top-1/2 md:h-auto md:max-h-[80dvh] md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-lg)] md:border md:border-[color:var(--color-border-strong)] md:shadow-[var(--shadow-2)]",
          )}
        >
          <header className="flex items-center gap-3 border-b border-[color:var(--color-border)] px-4 py-3">
            <Search className="h-5 w-5 text-[color:var(--color-ink-3)]" />
            <input
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search machine, alias, HP…"
              className="flex-1 border-0 bg-transparent text-base focus-visible:outline-none"
              aria-label="Product search"
            />
            <DialogPrimitive.Close className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 overflow-y-auto">
            {q.trim().length < 2 ? (
              <p className="px-4 py-8 text-center text-sm text-[color:var(--color-ink-3)]">
                Start typing to search the price list.
              </p>
            ) : pending && hits.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[color:var(--color-ink-3)]">
                Searching…
              </p>
            ) : hits.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[color:var(--color-ink-3)]">
                No matches. Add a custom item instead.
              </p>
            ) : (
              <ul>
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => pick(h)}
                      className="flex w-full items-start justify-between gap-3 border-b border-[color:var(--color-border)] px-4 py-3 text-left hover:bg-[color:var(--color-surface-2)]"
                    >
                      <div>
                        <div className="font-medium">{h.name}</div>
                        {h.spec && (
                          <div className="text-xs text-[color:var(--color-ink-3)]">{h.spec}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-sm">
                        {h.customerPrice ? (
                          <>
                            <div className="font-medium tabular-nums">
                              {formatInr(h.customerPrice)}
                            </div>
                            <div className="text-xs text-[color:var(--color-ink-3)]">List</div>
                          </>
                        ) : (
                          <span className="text-xs text-[color:var(--color-ink-3)]">—</span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
