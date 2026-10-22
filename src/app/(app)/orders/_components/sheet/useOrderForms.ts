"use client";
// Shared order-sheet logic: the desktop table (inline row) and the phone/tablet
// cards + bottom sheets all go through these, so validation and actions match.
import * as React from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { toast } from "@/components/app/Toast";
import { parseAmount } from "@/server/domain/v1_1/amountParser";
import { createOrderV2Action, setOrderStatusV2Action } from "@/app/(app)/orders/actions-v2";
import type { OrderV2Row } from "@/server/repo/ordersV2";

export type PaymentMethod = "UPI" | "CASH" | "BANK_TRANSFER" | "CHEQUE";
/** One line of the new-order form. qty / price stay as typed text until saved. */
export type OrderLineDraft = { key: string; name: string; productId: string | null; qty: string; price: string };
export type LineError = Partial<Record<"name" | "qty" | "price", string>>;
export type NewOrderField = "phone" | "customerName" | "items" | "total" | "paid" | "orderDate" | "deliveryDate";

let lineSeq = 0;
const blankLine = (): OrderLineDraft => ({ key: `l${++lineSeq}`, name: "", productId: null, qty: "1", price: "" });
const lineQty = (l: OrderLineDraft) => (/^\d{1,4}$/.test(l.qty.trim()) ? Number(l.qty.trim()) : 0);
/** qty × price for one line (0 while incomplete). */
export const lineAmount = (l: OrderLineDraft) => (parseAmount(l.price) ?? new Decimal(0)).times(lineQty(l));

/** Today in India (YYYY-MM-DD) — the default order date. */
export const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** Keep only the 10-digit Indian mobile (drops +91 / leading 0 and spaces). */
export function normalizeMobile(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

// State, validation (v1.1 §4.4 copy) and save for the "New order" form.
export function useNewOrderForm(onDone: () => void) {
  const router = useRouter();
  const [phone, setPhoneState] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [lines, setLines] = React.useState<OrderLineDraft[]>(() => [blankLine()]);
  const [lineErrors, setLineErrors] = React.useState<Record<string, LineError>>({});
  const [paidRaw, setPaidRaw] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("UPI");
  const [orderDate, setOrderDateState] = React.useState(istToday);
  const [deliveryDate, setDeliveryDateState] = React.useState("");
  const [accDetails, setAccDetails] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [readyStock, setReadyStock] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<NewOrderField, string>>>({});
  const [pending, setPending] = React.useState(false);

  // The order total is always the sum of the lines — worked out here and again on the server.
  const total = lines.reduce((sum, l) => sum.plus(lineAmount(l)), new Decimal(0));
  const paid = parseAmount(paidRaw) ?? new Decimal(0);
  const balance = Decimal.max(total.minus(paid), 0);

  const clearError = (f: NewOrderField) => setErrors((e) => (e[f] ? { ...e, [f]: undefined } : e));
  const setPhone = (v: string) => {
    setPhoneState(normalizeMobile(v));
    clearError("phone");
  };
  function updateLine(key: string, patch: Partial<Omit<OrderLineDraft, "key">>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setLineErrors((e) => (e[key] ? { ...e, [key]: {} } : e));
    clearError("items");
    clearError("total");
  }
  /** Typing a name by hand drops any earlier price-list link. */
  const setLineName = (key: string, name: string) => updateLine(key, { name, productId: null });
  function pickProduct(key: string, p: { id: string; name: string; customerPrice: string | null }) {
    updateLine(key, {
      name: p.name,
      productId: p.id,
      ...(p.customerPrice ? { price: new Decimal(p.customerPrice).toDecimalPlaces(2).toString() } : {}),
    });
  }
  function addLine() {
    setLines((ls) => [...ls, blankLine()]);
  }
  function removeLine(key: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [blankLine()]));
    setLineErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  const usedLines = lines.filter((l) => l.name.trim() || l.price.trim());
  const dirty = Boolean(phone || customerName || usedLines.length || paidRaw || deliveryDate || accDetails || notes);

  function validate() {
    const e: Partial<Record<NewOrderField, string>> = {};
    if (phone.length !== 10) e.phone = "Enter a 10-digit mobile number.";
    if (!customerName.trim()) e.customerName = "Enter the customer's name.";
    const le: Record<string, LineError> = {};
    for (const l of usedLines) {
      const x: LineError = {};
      if (!l.name.trim()) x.name = "Type the product.";
      if (lineQty(l) < 1) x.qty = "Qty?";
      const pr = parseAmount(l.price);
      if (!l.price.trim() || !pr || pr.isNegative()) x.price = "Price?";
      if (Object.keys(x).length) le[l.key] = x;
    }
    setLineErrors(le);
    if (usedLines.length === 0) e.items = "Add what the customer ordered.";
    else if (Object.keys(le).length) e.items = "Fill in the product, quantity and price for each item.";
    else if (total.lessThanOrEqualTo(0)) e.total = "The order total must be more than ₹0.";
    else if (paid.greaterThan(total)) e.paid = `Paid can't be more than the total (₹${total.toFixed(0)}).`;
    if (paidRaw && !parseAmount(paidRaw)) e.paid = "Enter the amount received as a number.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) e.orderDate = "Pick the order date.";
    else if (orderDate > istToday()) e.orderDate = "The order date can't be in the future.";
    if (deliveryDate && deliveryDate < orderDate) e.deliveryDate = "Delivery can't be before the order date.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (pending || !validate()) return false;
    setPending(true);
    try {
      const r = await createOrderV2Action({
        items: usedLines.map((l) => ({
          name: l.name.trim(),
          qty: lineQty(l),
          unitPrice: (parseAmount(l.price) ?? new Decimal(0)).toFixed(2),
          productId: l.productId,
        })),
        contactPhone: phone,
        customerName: customerName.trim(),
        total: total.toFixed(2),
        paid: paid.greaterThan(0) ? paid.toFixed(2) : undefined,
        paymentMethod: paid.greaterThan(0) ? method : undefined,
        orderDate,
        deliveryDate: deliveryDate || null,
        accDetails: accDetails.trim() || null,
        note: notes.trim() || undefined,
        readyStock,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return false;
      }
      toast.success(`Order #${r.data.serialNo ?? "?"} saved`);
      onDone();
      router.refresh();
      return true;
    } catch {
      toast.error("Couldn't save the order. Check your connection and try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return {
    phone,
    setPhone,
    customerName,
    setCustomerName: (v: string) => {
      setCustomerName(v);
      clearError("customerName");
    },
    lines,
    lineErrors,
    setLineName,
    updateLine,
    pickProduct,
    addLine,
    removeLine,
    paidRaw,
    setPaidRaw: (v: string) => {
      setPaidRaw(v);
      clearError("paid");
    },
    method,
    setMethod,
    orderDate,
    setOrderDate: (v: string) => {
      setOrderDateState(v);
      clearError("orderDate");
    },
    deliveryDate,
    setDeliveryDate: (v: string) => {
      setDeliveryDateState(v);
      clearError("deliveryDate");
    },
    accDetails,
    setAccDetails,
    notes,
    setNotes,
    readyStock,
    setReadyStock,
    total,
    paid,
    balance,
    errors,
    pending,
    dirty,
    save,
  };
}

export function useOrderStatus(row: OrderV2Row) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function updateStatus(next: "PENDING" | "DELIVERED" | "CANCELLED") {
    if (pending) return;
    if (next === row.simpleStatus) return;
    // Delivering before production finished = from ready stock; it leaves the production board.
    if (
      next === "DELIVERED" &&
      row.productionStatus === "IN_PROGRESS" &&
      !window.confirm("Production is still working on this order. Deliver it from ready stock instead? It will be removed from the production board.")
    ) {
      return;
    }
    if (next === "CANCELLED") {
      const reason = window.prompt("Why cancel this order? (one line)");
      if (!reason?.trim()) return;
      setPending(true);
      try {
        const r = await setOrderStatusV2Action({
          orderId: row.id,
          status: "CANCELLED",
          cancelReason: reason.trim(),
        });
        if (!r.ok) toast.error(r.error.message);
        else {
          toast.success("Order cancelled.");
          router.refresh();
        }
      } catch {
        toast.error("Couldn't update the order. Try again.");
      } finally {
        setPending(false);
      }
      return;
    }
    setPending(true);
    try {
      const r = await setOrderStatusV2Action({ orderId: row.id, status: next });
      if (!r.ok) toast.error(r.error.message);
      else {
        toast.success(
          next === "DELIVERED"
            ? row.productionStatus === "FINISHED"
              ? "Marked delivered."
              : "Delivered from ready stock."
            : "Reopened.",
        );
        router.refresh();
      }
    } catch {
      toast.error("Couldn't update the order. Try again.");
    } finally {
      setPending(false);
    }
  }

  return { pending, setPending, updateStatus };
}
