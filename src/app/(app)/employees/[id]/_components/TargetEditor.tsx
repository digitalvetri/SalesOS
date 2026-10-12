"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/app/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAmount } from "@/server/domain/v1_1/amountParser";
import { setTargetAction } from "@/app/(app)/employees/actions";

function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function TargetEditor({
  userId,
  currentMonthYm,
  nextMonthYm,
  currentTarget,
  nextTarget,
  defaultTarget,
}: {
  userId: string;
  currentMonthYm: string;
  nextMonthYm: string;
  currentTarget: string;
  nextTarget: string;
  defaultTarget: string;
}) {
  return (
    <div className="space-y-4">
      <OneMonth
        label={fmtMonthLabel(currentMonthYm)}
        userId={userId}
        monthYm={currentMonthYm}
        initial={currentTarget}
      />
      <OneMonth
        label={fmtMonthLabel(nextMonthYm)}
        userId={userId}
        monthYm={nextMonthYm}
        initial={nextTarget}
      />
      <p className="text-xs text-[color:var(--color-ink-3)]">
        Default target for the tenant is ₹{Number(defaultTarget).toLocaleString("en-IN")}.
        Change it in Settings.
      </p>
    </div>
  );
}

function OneMonth({
  label,
  userId,
  monthYm,
  initial,
}: {
  label: string;
  userId: string;
  monthYm: string;
  initial: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(Number(initial).toFixed(0));
  const [pending, setPending] = React.useState(false);

  async function save() {
    if (pending) return;
    const p = parseAmount(value);
    if (!p || p.isNegative()) {
      toast.error("Enter a number ≥ 0.");
      return;
    }
    setPending(true);
    try {
      const r = await setTargetAction({ userId, monthYm, amount: p.toFixed(2) });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`${label} target saved.`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid grid-cols-[auto_1fr_auto] items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Label htmlFor={`t-${monthYm}`} className="w-32">
        {label}
      </Label>
      <Input
        id={`t-${monthYm}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        className="tabular-nums"
      />
      <Button type="submit" gold disabled={pending}>
        {pending ? "…" : "Save"}
      </Button>
    </form>
  );
}
