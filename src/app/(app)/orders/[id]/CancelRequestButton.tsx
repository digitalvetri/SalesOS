"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { toast } from "@/components/app/Toast";
import { requestCancelAction } from "../actions";

export function CancelRequestButton({ orderId }: { orderId: string }) {
  const t = useTranslations("orderDetail");
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function submit(reason?: string) {
    if (!reason) return;
    setPending(true);
    try {
      const r = await requestCancelAction({
        orderId,
        reason: "CUSTOMER_CHANGED_MIND",
        note: reason,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("cancelRequestSent"));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <ConfirmSheet
      trigger={
        <Button variant="outline" className="w-full" disabled={pending}>
          {t("requestCancel")}
        </Button>
      }
      title={t("requestCancelTitle")}
      description={t("requestCancelBody")}
      confirmLabel={t("sendRequest")}
      requireReason
      reasonLabel={t("cancelReason")}
      onConfirm={submit}
    />
  );
}
