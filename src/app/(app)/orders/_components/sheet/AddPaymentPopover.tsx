"use client";
// v1.1 §4.5 — Add payment popover.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { parseAmount } from "@/server/domain/v1_1/amountParser";
import { addPaymentV2Action } from "@/app/(app)/orders/actions-v2";
import { SHEET_CONTENT, SHEET_OVERLAY } from "./sheetFormat";

type Method = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE";
const METHODS: { v: Method; label: string }[] = [
  { v: "CASH", label: "Cash" },
  { v: "UPI", label: "UPI" },
  { v: "BANK_TRANSFER", label: "Bank" },
  { v: "CHEQUE", label: "Cheque" },
];

// Today's date in India (the date input expects YYYY-MM-DD).
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function AddPaymentPopover({
  orderId,
  currentBalance,
  onClose,
}: {
  orderId: string;
  currentBalance: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = React.useState(
    // Round down so the pre-filled amount never exceeds the balance.
    new Decimal(currentBalance).toDecimalPlaces(2, Decimal.ROUND_DOWN).toString(),
  );
  const [paidOn, setPaidOn] = React.useState(today());
  const [method, setMethod] = React.useState<Method>("UPI");
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function save() {
    if (pending) return;
    const p = parseAmount(amount);
    if (!p || p.lessThanOrEqualTo(0)) {
      toast.error("Payment amount must be more than ₹0.");
      return;
    }
    setPending(true);
    try {
      const r = await addPaymentV2Action({
        orderId,
        amount: p.toFixed(2),
        method,
        paidOn,
        note: note.trim() || undefined,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Payment added.");
      onClose();
      router.refresh();
    } catch {
      toast.error("Couldn't save the payment. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SHEET_OVERLAY} />
        <DialogPrimitive.Content className={SHEET_CONTENT}>
          <div className="mb-4 flex items-start justify-between">
            <DialogPrimitive.Title className="text-lg font-semibold">
              Add payment
            </DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount</Label>
              <Input
                id="pay-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                autoFocus
                className="tabular-nums"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pay-date">Date</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-method">Mode</Label>
                <select
                  id="pay-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as Method)}
                  className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
                >
                  {METHODS.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay-note">Note (optional)</Label>
              <Input
                id="pay-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="UTR 123456…"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="outline" className="flex-1">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button type="submit" data-gold className="flex-1" disabled={pending}>
                {pending ? "…" : "Save payment"}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
