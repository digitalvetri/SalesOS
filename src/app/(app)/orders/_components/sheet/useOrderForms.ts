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
export type OrderItem = { name: string; price: string | null };
export type NewOrderField = "phone" | "customerName" | "items" | "total" | "paid" | "orderDate" | "deliveryDate";

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
  const [items, setItems] = React.useState<OrderItem[]>([]);
  const [itemQuery, setItemQuery] = React.useState("");
  const [totalRaw, setTotalRawState] = React.useState("");
  const [totalTouched, setTotalTouched] = React.useState(false);
  const [paidRaw, setPaidRaw] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("UPI");
  const [orderDate, setOrderDateState] = React.useState(istToday);
  const [deliveryDate, setDeliveryDateState] = React.useState("");
  const [accDetails, setAccDetails] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [errors, setErrors] = React.useState<Partial<Record<NewOrderField, string>>>({});
  const [pending, setPending] = React.useState(false);

  const total = parseAmount(totalRaw) ?? new Decimal(0);
  const paid = parseAmount(paidRaw) ?? new Decimal(0);
  const balance = Decimal.max(total.minus(paid), 0);

  const clearError = (f: NewOrderField) => setErrors((e) => (e[f] ? { ...e, [f]: undefined } : e));
  const setPhone = (v: string) => {
    setPhoneState(normalizeMobile(v));
    clearError("phone");
  };
  const setTotalRaw = (v: string) => {
    setTotalRawState(v);
    setTotalTouched(true);
    clearError("total");
  };

  // Until the employee types a total, it follows the price-list sum of the items.
  function applyItems(next: OrderItem[]) {
    setItems(next);
    clearError("items");
    if (!totalTouched) {
      const sum = next.reduce((s, it) => (it.price ? s.plus(it.price) : s), new Decimal(0));
      setTotalRawState(sum.greaterThan(0) ? sum.toFixed(0) : "");
      if (sum.greaterThan(0)) clearError("total");
    }
  }
  function addItem(item: OrderItem) {
    const name = item.name.trim();
    if (!name || items.some((i) => i.name.toLowerCase() === name.toLowerCase())) return;
    applyItems([...items, { ...item, name }]);
    setItemQuery("");
  }
  function removeItem(name: string) {
    applyItems(items.filter((i) => i.name !== name));
  }

  const productText = [...items.map((i) => i.name), itemQuery.trim()].filter(Boolean).join(", ");
  const dirty = Boolean(phone || customerName || productText || totalRaw || paidRaw || deliveryDate || accDetails || notes);

  function validate() {
    const e: Partial<Record<NewOrderField, string>> = {};
    if (phone.length !== 10) e.phone = "Enter a 10-digit mobile number.";
    if (!customerName.trim()) e.customerName = "Enter the customer's name.";
    if (!productText) e.items = "Type what the customer ordered.";
    const t = parseAmount(totalRaw);
    if (!t || t.lessThanOrEqualTo(0)) e.total = "Total must be more than ₹0.";
    else if (paid.greaterThan(t)) e.paid = `Paid can't be more than the total (₹${t.toFixed(0)}).`;
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
        productText,
        contactPhone: phone,
        customerName: customerName.trim(),
        total: total.toFixed(2),
        paid: paid.greaterThan(0) ? paid.toFixed(2) : undefined,
        paymentMethod: paid.greaterThan(0) ? method : undefined,
        orderDate,
        deliveryDate: deliveryDate || null,
        accDetails: accDetails.trim() || null,
        note: notes.trim() || undefined,
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
    items,
    addItem,
    removeItem,
    itemQuery,
    setItemQuery: (v: string) => {
      setItemQuery(v);
      clearError("items");
    },
    totalRaw,
    setTotalRaw,
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
        toast.success(next === "DELIVERED" ? "Marked delivered." : "Reopened.");
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
