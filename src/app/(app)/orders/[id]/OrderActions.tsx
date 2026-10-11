"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { toast } from "@/components/app/Toast";
import { cancelOrderAction } from "../actions";

export function OrderActions({
  orderId,
  canCancel,
  pendingCancelRequest,
}: {
  orderId: string;
  canCancel: boolean;
  pendingCancelRequest: boolean;
}) {
  const t = useTranslations("orderDetail");
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function cancel(reason?: string) {
    if (!reason) return;
    setPending(true);
    try {
      const r = await cancelOrderAction({
        id: orderId,
        reason: "CUSTOMER_CHANGED_MIND",
        note: reason,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("cancelled"));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!canCancel) return null;

  return (
    <div className="space-y-2">
      <ConfirmSheet
        trigger={
          <Button variant="danger" className="w-full" disabled={pending}>
            {pendingCancelRequest ? t("approveCancelRequest") : t("cancelOrder")}
          </Button>
        }
        title={t("cancelConfirmTitle")}
        description={t("cancelConfirmBody")}
        confirmLabel={t("cancelOrder")}
        destructive
        requireReason
        reasonLabel={t("cancelReason")}
        onConfirm={cancel}
      />
    </div>
  );
}
