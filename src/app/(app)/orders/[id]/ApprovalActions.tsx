"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { toast } from "@/components/app/Toast";
import { approvePriceAction, rejectPriceAction } from "../actions";

export function ApprovalActions({
  orderId,
  orderNumber,
  updatedAt,
}: {
  orderId: string;
  orderNumber: string;
  updatedAt: string;
}) {
  const t = useTranslations("orderDetail");
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function approve() {
    setPending(true);
    try {
      const r = await approvePriceAction({ orderId, updatedAt });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("approvedToast", { number: orderNumber }));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function reject(reason?: string) {
    if (!reason) return;
    setPending(true);
    try {
      const r = await rejectPriceAction({ orderId, updatedAt, note: reason });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("rejectedToast", { number: orderNumber }));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[var(--radius)] border border-[color:var(--color-warn)]/40 bg-[color:var(--color-warn-bg)] p-4">
      <div className="label-caps mb-2">{t("priceApproval")}</div>
      <p className="mb-3 text-sm text-[color:var(--color-ink-2)]">{t("approvalExplainer")}</p>
      <div className="flex gap-2">
        <Button data-gold onClick={approve} disabled={pending} className="flex-1">
          {t("approve")}
        </Button>
        <ConfirmSheet
          trigger={
            <Button variant="danger" className="flex-1" disabled={pending}>
              {t("reject")}
            </Button>
          }
          title={t("rejectTitle")}
          description={t("rejectBody")}
          confirmLabel={t("reject")}
          destructive
          requireReason
          reasonLabel={t("rejectReason")}
          onConfirm={reject}
        />
      </div>
    </section>
  );
}
