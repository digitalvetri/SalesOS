"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/app/Toast";
import { parseAmount } from "@/server/domain/v1_1/amountParser";
import { setDefaultTargetAction } from "../actions";

export function DefaultTargetEditor({ initial }: { initial: string }) {
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
      const r = await setDefaultTargetAction({ amount: p.toFixed(2) });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Default target saved.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        className="tabular-nums"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "…" : "Save"}
      </Button>
    </form>
  );
}
