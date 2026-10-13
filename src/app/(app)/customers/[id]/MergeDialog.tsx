"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X, Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/app/Toast";
import { mergeCustomersAction } from "../actions";

type Other = { id: string; name: string; phoneE164: string | null };

export function MergeDialog({
  survivor,
  others,
}: {
  survivor: { id: string; name: string; phoneE164: string | null };
  others: Other[];
}) {
  const t = useTranslations("customers.merge");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [sourceId, setSourceId] = React.useState<string>("");
  const [filter, setFilter] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = q
      ? others.filter(
          (o) => o.name.toLowerCase().includes(q) || (o.phoneE164 ?? "").includes(q),
        )
      : others;
    return base.slice(0, 20);
  }, [filter, others]);

  async function confirm() {
    if (!sourceId) {
      toast.error(t("pickOne"));
      return;
    }
    setPending(true);
    try {
      const r = await mergeCustomersAction({ sourceId, survivorId: survivor.id });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("done", { count: r.data.ordersMoved }));
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="outline" size="sm">
          <Merge className="mr-1 h-4 w-4" />
          {t("button")}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-6 shadow-[var(--shadow-2)]">
          <div className="mb-3 flex items-start justify-between">
            <DialogPrimitive.Title className="text-lg font-semibold">
              {t("title")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="mb-4 text-sm text-[color:var(--color-ink-2)]">
            {t("description", { survivor: survivor.name })}
          </DialogPrimitive.Description>

          <div className="mb-3 space-y-2">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("search")}
              className="h-10 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm"
            />
          </div>

          <div className="mb-5 max-h-72 overflow-y-auto rounded-[var(--radius)] border border-[color:var(--color-border)]">
            {filtered.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-3 border-b border-[color:var(--color-border)] px-3 py-2 last:border-b-0 hover:bg-[color:var(--color-surface-2)]"
              >
                <input
                  type="radio"
                  name="merge-source"
                  value={o.id}
                  checked={sourceId === o.id}
                  onChange={() => setSourceId(o.id)}
                  className="h-4 w-4"
                />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{o.name}</div>
                  <div className="text-xs text-[color:var(--color-ink-3)] tabular-nums">
                    {o.phoneE164 ?? "—"}
                  </div>
                </div>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-[color:var(--color-ink-3)]">
                {t("noMatches")}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <DialogPrimitive.Close asChild>
              <Button variant="outline" className="flex-1">
                {t("cancel")}
              </Button>
            </DialogPrimitive.Close>
            <Button
              variant="danger"
              className="flex-1"
              onClick={confirm}
              disabled={!sourceId || pending}
            >
              {pending ? "â¦" : t("confirm")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
