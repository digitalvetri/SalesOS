"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { Copy, Check, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/app/Toast";
import { BRAND } from "@/config/brand";

export type TempPasswordDialogProps = {
  open: boolean;
  password: string;
  phone: string;
  name: string;
  onClose: () => void;
};

export function TempPasswordDialog({ open, password, phone, name, onClose }: TempPasswordDialogProps) {
  const t = useTranslations("settings.users");
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    const text = `Hi ${name}, your ${BRAND.name} login is ${phone}. Temporary password: ${password}. Please change it after you sign in.`;
    const url = `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-6 shadow-[var(--shadow-2)]">
          <div className="mb-3 flex items-start justify-between">
            <DialogPrimitive.Title className="text-lg font-semibold">
              {name}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="mb-4 text-sm text-[color:var(--color-ink-2)]">
            {t("created")}
          </DialogPrimitive.Description>
          <div className="mb-4 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-3">
            <div className="label-caps mb-1">{t("tempPasswordLabel")}</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all font-mono text-base">{password}</code>
              <Button size="sm" variant="outline" onClick={copy} aria-label={t("copy")}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              {t("backToList")}
            </Button>
            <Button className="flex-1" onClick={shareWhatsApp}>
              <MessageCircle className="mr-1 h-4 w-4" />
              {t("whatsapp")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
