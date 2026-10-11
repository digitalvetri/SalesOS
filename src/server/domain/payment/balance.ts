// Spec BR-09 — balanceDue derivation. Pure: no DB, no framework imports.
// Any mutation of a Payment or Order status in the service layer calls
// `computeBalance` and writes the result back inside the same transaction.
//
// Rules (verbatim from §6 BR-09):
//   netReceived = Σ(non-REFUND payments with status ∈ {PENDING, VERIFIED})
//               − Σ(REFUND     payments with status ∈ {PENDING, VERIFIED})
//   effectiveTotal = 0 if the order is CANCELLED, else order.total
//   balanceDue     = effectiveTotal − netReceived
//
// A **negative** balanceDue means **refund due to the customer**.
import Decimal from "decimal.js";
import { dec, roundToPaise } from "@/server/domain/money";

export type PaymentForBalance = {
  type: "ADVANCE" | "PART" | "FINAL" | "REFUND";
  status: "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
  amount: Decimal.Value;
};

export type OrderForBalance = {
  total: Decimal.Value;
  status: "CANCELLED" | "DELIVERED" | "CLOSED" | string;
};

export type BalanceResult = {
  netReceived: Decimal;         // all PENDING + VERIFIED positive, minus refunds
  verifiedNet: Decimal;         // VERIFIED-only — for "collected" tiles / CLOSED check
  balanceDue: Decimal;          // can be negative → refund due
  isRefundDue: boolean;
  /** Should the order flip to CLOSED? True when status === "DELIVERED" and verified balance is zero. */
  shouldClose: boolean;
  /** Should a currently-CLOSED order reopen to DELIVERED? */
  shouldReopen: boolean;
};

const COUNTING_STATUSES: PaymentForBalance["status"][] = ["PENDING_VERIFICATION", "VERIFIED"];

export function computeBalance(
  order: OrderForBalance,
  payments: PaymentForBalance[],
): BalanceResult {
  const sumPos = (filter: (p: PaymentForBalance) => boolean): Decimal => {
    let s = new Decimal(0);
    for (const p of payments) {
      if (filter(p)) s = s.plus(dec(p.amount));
    }
    return s;
  };

  const incoming = sumPos((p) => p.type !== "REFUND" && COUNTING_STATUSES.includes(p.status));
  const refundsPendingOrVerified = sumPos(
    (p) => p.type === "REFUND" && COUNTING_STATUSES.includes(p.status),
  );
  const netReceived = incoming.minus(refundsPendingOrVerified);

  const verifiedIn = sumPos((p) => p.type !== "REFUND" && p.status === "VERIFIED");
  const verifiedRefund = sumPos((p) => p.type === "REFUND" && p.status === "VERIFIED");
  const verifiedNet = verifiedIn.minus(verifiedRefund);

  const effectiveTotal = order.status === "CANCELLED" ? new Decimal(0) : dec(order.total);
  const balanceDue = roundToPaise(effectiveTotal.minus(netReceived));
  const isRefundDue = balanceDue.isNegative() && !balanceDue.isZero();

  const verifiedBalance = roundToPaise(effectiveTotal.minus(verifiedNet));
  const shouldClose = order.status === "DELIVERED" && verifiedBalance.isZero();
  const shouldReopen = order.status === "CLOSED" && !verifiedBalance.isZero();

  return {
    netReceived: roundToPaise(netReceived),
    verifiedNet: roundToPaise(verifiedNet),
    balanceDue,
    isRefundDue,
    shouldClose,
    shouldReopen,
  };
}
