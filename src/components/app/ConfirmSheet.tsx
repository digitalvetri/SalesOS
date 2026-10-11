"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ConfirmSheetProps = {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason?: string) => void | Promise<void>;
};

// Bottom sheet for destructive or irreversible actions (spec §10.5).
export function ConfirmSheet({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  requireReason,
  reasonLabel = "Reason",
  onConfirm,
}: ConfirmSheetProps) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const canSubmit = requireReason ? reason.trim().length > 0 : true;

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    try {
      await onConfirm(requireReason ? reason.trim() : undefined);
      setOpen(false);
      setReason("");
    } finally {
      setPending(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 rounded-t-[var(--radius-lg)] border-t border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-6 shadow-[var(--shadow-2)]",
            "md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-lg)] md:border",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="text-lg font-semibold text-[color:var(--color-ink)]">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          {description && (
            <DialogPrimitive.Description className="mt-2 text-sm text-[color:var(--color-ink-2)]">
              {description}
            </DialogPrimitive.Description>
          )}
          {requireReason && (
            <label className="mt-5 block text-sm">
              <span className="text-[color:var(--color-ink-2)]">{reasonLabel}</span>
              <textarea
                className="mt-1 h-24 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)]/60"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
                required
              />
            </label>
          )}
          <div className="mt-6 flex gap-3">
            <DialogPrimitive.Close asChild>
              <Button variant="outline" className="flex-1">
                Cancel
              </Button>
            </DialogPrimitive.Close>
            <Button
              variant={destructive ? "danger" : "default"}
              className="flex-1"
              disabled={!canSubmit || pending}
              onClick={submit}
            >
              {pending ? "…" : confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
