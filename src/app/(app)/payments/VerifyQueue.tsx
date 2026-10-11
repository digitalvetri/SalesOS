"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Image as ImageIcon, X } from "lucide-react";
import Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/app/Money";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { toast } from "@/components/app/Toast";
import { verifyPaymentsAction, rejectPaymentAction } from "./actions";

export type QueueRowDto = {
  id: string;
  receiptNo: string;
  type: "ADVANCE" | "PART" | "FINAL" | "REFUND";
  method: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
  amount: string;
  paidOn: string;
  referenceNo: string | null;
  hasProof: boolean;
  into: { kind: "account" | "person"; label: string };
  order: { id: string; number: string; customerName: string };
  salesperson: { name: string };
};

export function VerifyQueue({ rows }: { rows: QueueRowDto[] }) {
  const t = useTranslations("payments");
  const tm = useTranslations("recordPayment.methods");
  const router = useRouter();
  const [picked, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const [proofFor, setProofFor] = React.useState<QueueRowDto | null>(null);

  // Ignore selections that left the queue after a refresh (verified elsewhere, rejected…).
  const selected = new Set(rows.filter((r) => picked.has(r.id)).map((r) => r.id));

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const selectedTotal = rows
    .filter((r) => selected.has(r.id))
    .reduce((s, r) => s.plus(r.amount), new Decimal(0));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function verify(ids: string[]) {
    if (ids.length === 0) return;
    setPending(true);
    try {
      const r = await verifyPaymentsAction({ paymentIds: ids });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("verifiedToast", { count: r.data.verifiedCount }));
      setSelected(new Set());
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function reject(id: string, reason?: string) {
    if (!reason) return;
    const r = await rejectPaymentAction({ paymentId: id, reason });
    if (!r.ok) {
      toast.error(r.error.message);
      return;
    }
    toast.success(t("rejectedToast"));
    router.refresh();
  }

  const bulkButton = (
    <Button
      data-gold="true"
      className="h-11"
      disabled={pending || selected.size === 0}
      onClick={() => verify([...selected])}
    >
      {t("verifySelected", { count: selected.size })}
      {selected.size > 0 && (
        <>
          {" · "}
          <Money value={selectedTotal.toString()} />
        </>
      )}
    </Button>
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <p className="text-base text-[color:var(--color-ink-2)]">{t("emptyQueue")}</p>
        {bulkButton}
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[color:var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label={t("selectAll")}
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
                  }
                  className="h-4 w-4"
                />
              </th>
              <th className="px-3 py-3">{t("colReceipt")}</th>
              <th className="px-3 py-3">{t("colOrder")}</th>
              <th className="px-3 py-3 text-right">{t("colAmount")}</th>
              <th className="px-3 py-3">{t("colMethod")}</th>
              <th className="px-3 py-3">{t("colInto")}</th>
              <th className="px-3 py-3">{t("colProof")}</th>
              <th className="px-3 py-3 text-right">
                <span className="sr-only">{t("colActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-[color:var(--color-border)]"
                data-testid="verify-row"
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={t("selectRow", { receipt: r.receiptNo })}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4"
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="tabular-nums">{r.receiptNo}</div>
                  <div className="text-xs text-[color:var(--color-ink-3)]">
                    {new Date(r.paidOn).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    })}{" "}
                    · {r.salesperson.name}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Link href={`/orders/${r.order.id}`} className="font-medium hover:underline">
                    {r.order.number}
                  </Link>
                  <div className="text-xs text-[color:var(--color-ink-3)]">{r.order.customerName}</div>
                </td>
                <td className="px-3 py-3 text-right">
                  {r.type === "REFUND" && (
                    <Badge tone="danger" className="mr-2">
                      {t("refund")}
                    </Badge>
                  )}
                  <Money value={r.amount} />
                </td>
                <td className="px-3 py-3">
                  <div>{tm(r.method)}</div>
                  {r.referenceNo && (
                    <div className="text-xs tabular-nums text-[color:var(--color-ink-3)]">
                      {r.referenceNo}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {r.into.kind === "person" ? t("personal", { name: r.into.label }) : r.into.label}
                </td>
                <td className="px-3 py-3">
                  {r.hasProof ? (
                    <button
                      type="button"
                      onClick={() => setProofFor(r)}
                      className="rounded p-1 hover:bg-[color:var(--color-surface-2)]"
                      aria-label={t("openProof", { receipt: r.receiptNo })}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="text-[color:var(--color-ink-3)]">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      disabled={pending}
                      onClick={() => verify([r.id])}
                      aria-label={t("verifyOne", { receipt: r.receiptNo })}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <ConfirmSheet
                      trigger={
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          aria-label={t("rejectOne", { receipt: r.receiptNo })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      }
                      title={t("rejectTitle", { receipt: r.receiptNo })}
                      description={t("rejectBody")}
                      confirmLabel={t("reject")}
                      destructive
                      requireReason
                      reasonLabel={t("rejectReason")}
                      onConfirm={(reason) => reject(r.id, reason)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 flex justify-end border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        {bulkButton}
      </div>

      <ProofPanel row={proofFor} onClose={() => setProofFor(null)} />
    </div>
  );
}

// "Proof opens a side panel with the image (zoom) and the UTR to match against the bank statement."
function ProofPanel({ row, onClose }: { row: QueueRowDto | null; onClose: () => void }) {
  const t = useTranslations("payments");
  const [zoom, setZoom] = React.useState(false);
  return (
    <DialogPrimitive.Root open={Boolean(row)} onOpenChange={(o) => !o && (onClose(), setZoom(false))}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-y-auto border-l border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-2)]">
          {row && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogPrimitive.Title className="text-lg font-semibold">{row.receiptNo}</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="text-sm text-[color:var(--color-ink-2)]">
                    {row.order.number} · <Money value={row.amount} />
                  </DialogPrimitive.Description>
                </div>
                <DialogPrimitive.Close className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]" aria-label={t("close")}>
                  <X className="h-5 w-5" />
                </DialogPrimitive.Close>
              </div>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-[color:var(--color-ink-3)]">{t("utr")}</dt>
                <dd className="font-medium tabular-nums">{row.referenceNo ?? "—"}</dd>
                <dt className="text-[color:var(--color-ink-3)]">{t("colInto")}</dt>
                <dd>{row.into.kind === "person" ? t("personal", { name: row.into.label }) : row.into.label}</dd>
              </dl>
              <button
                type="button"
                className="mt-4 overflow-auto rounded-[var(--radius)] border border-[color:var(--color-border)]"
                onClick={() => setZoom((z) => !z)}
                aria-label={zoom ? t("zoomOut") : t("zoomIn")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL via redirect */}
                <img
                  src={`/api/payments/${row.id}/proof`}
                  alt={t("proofAlt", { receipt: row.receiptNo })}
                  className={zoom ? "max-w-none" : "w-full"}
                />
              </button>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
