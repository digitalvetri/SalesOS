"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CalendarClock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { setPromiseDateAction } from "./actions";

export function PromiseDateSheet(props: {
  orderId: string;
  orderNumber: string;
  current: string | null;
  today: string;
  compact?: boolean;
}) {
  const t = useTranslations("collect");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(props.current && props.current >= props.today ? props.current : "");
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function save(promisedOn: string | null) {
    setPending(true);
    try {
      const r = await setPromiseDateAction({ orderId: props.orderId, promisedOn, note: note.trim() || null });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(promisedOn ? t("promiseSaved") : t("promiseCleared"));
      setOpen(false);
      setNote("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="outline" size={props.compact ? "sm" : "md"}>
          <CalendarClock className="h-4 w-4" />
          {t("promiseDate")}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 rounded-t-[var(--radius-lg)] border-t border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-6 shadow-[var(--shadow-2)]",
            "md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-lg)] md:border",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">{t("promiseTitle")}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-[color:var(--color-ink-2)]">
                {props.orderNumber}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]" aria-label={t("close")}>
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`promise-${props.orderId}`}>{t("promiseOn")}</Label>
              <Input
                id={`promise-${props.orderId}`}
                type="date"
                value={date}
                min={props.today}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`promise-note-${props.orderId}`}>{t("note")}</Label>
              <Input
                id={`promise-note-${props.orderId}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={400}
                placeholder={t("notePlaceholder")}
              />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            {props.current && (
              <Button variant="ghost" className="flex-1" disabled={pending} onClick={() => save(null)}>
                {t("clearPromise")}
              </Button>
            )}
            <Button className="flex-1" disabled={pending || !date} onClick={() => save(date)}>
              {pending ? "…" : t("savePromise")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
