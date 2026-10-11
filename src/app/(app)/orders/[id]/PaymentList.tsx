// Payments on the order detail money card (§11.4): receipt, amount, method,
// where it landed, status — plus the amber "With {name}" chip until a personal
// receipt is deposited to a company account (§5.2 personal-receiver rule).
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/app/Money";

export type PaymentRow = {
  id: string;
  receiptNo: string;
  type: "ADVANCE" | "PART" | "FINAL" | "REFUND";
  method: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CARD";
  amount: string;
  status: "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
  paidOn: string;
  into: { kind: "account" | "person"; label: string };
  deposited: boolean;
  referenceNo: string | null;
  hasProof: boolean;
  rejectReason: string | null;
};

const STATUS_TONE = {
  PENDING_VERIFICATION: "info",
  VERIFIED: "ok",
  REJECTED: "danger",
} as const;

export async function PaymentList({ payments }: { payments: PaymentRow[] }) {
  const t = await getTranslations("recordPayment");
  return (
    <ul className="mt-4 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
      {payments.map((p) => (
        <li key={p.id} className="py-3 text-sm" data-testid="payment-row">
          <div className="flex items-baseline justify-between gap-3">
            <span className="tabular-nums text-xs text-[color:var(--color-ink-3)]">{p.receiptNo}</span>
            <span className={p.status === "REJECTED" ? "line-through" : undefined}>
              {p.type === "REFUND" && "− "}
              <Money value={p.amount} />
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--color-ink-2)]">
            <span>{t(`methods.${p.method}`)}</span>
            <span aria-hidden>·</span>
            <span>
              {p.into.kind === "person" ? t("intoPerson", { name: p.into.label }) : p.into.label}
            </span>
            <span aria-hidden>·</span>
            <span>
              {new Date(p.paidOn).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                timeZone: "UTC",
              })}
            </span>
            {p.referenceNo && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{p.referenceNo}</span>
              </>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[p.status]}>{t(`status.${p.status}`)}</Badge>
            {p.into.kind === "person" && !p.deposited && p.status !== "REJECTED" && (
              <Badge tone="warn">{t("withPerson", { name: p.into.label })}</Badge>
            )}
            {p.hasProof && (
              <a
                href={`/api/payments/${p.id}/proof`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline underline-offset-2"
              >
                {t("viewProof")}
              </a>
            )}
          </div>
          {p.status === "REJECTED" && p.rejectReason && (
            <p className="mt-1 text-xs text-[color:var(--color-danger)]">{p.rejectReason}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
