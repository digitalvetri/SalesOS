"use client";
// Qty stepper (spec §10.5 QtyStepper, §11.3 Step 2). 48px tap targets.
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div
      className={cn(
        "inline-flex h-12 items-stretch overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)]",
        className,
      )}
    >
      <button
        type="button"
        onClick={dec}
        aria-label="Decrease quantity"
        disabled={value <= min}
        className="flex min-h-[48px] w-12 items-center justify-center hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, Math.floor(n))));
        }}
        className="w-14 border-0 bg-transparent text-center text-base tabular-nums focus-visible:outline-none"
        aria-label="Quantity"
      />
      <button
        type="button"
        onClick={inc}
        aria-label="Increase quantity"
        disabled={value >= max}
        className="flex min-h-[48px] w-12 items-center justify-center hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
