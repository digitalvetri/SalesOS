"use client";
import * as React from "react";
import Decimal from "decimal.js";
import { cn } from "@/lib/utils";

export type MoneyProps = {
  value: Decimal.Value;
  size?: "sm" | "md" | "lg" | "xl";
  muted?: boolean;
  signed?: boolean;
  className?: string;
};

const sizeClass: Record<NonNullable<MoneyProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-4xl font-semibold",
};

// Indian grouping: ₹1,23,456 (no paise unless the value has them)
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const INR_WITH_PAISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatInr(value: Decimal.Value, signed?: boolean): string {
  const d = new Decimal(value);
  const hasPaise = !d.modulo(1).isZero();
  const abs = d.abs();
  const fmt = (hasPaise ? INR_WITH_PAISE : INR).format(abs.toNumber());
  if (d.isNegative()) return `−${fmt}`;
  if (signed) return `+${fmt}`;
  return fmt;
}

export function Money({ value, size = "md", muted, signed, className }: MoneyProps) {
  const d = new Decimal(value);
  const text = formatInr(value, signed);
  const negative = d.isNegative();
  return (
    <span
      className={cn(
        "tabular-nums",
        sizeClass[size],
        muted && "text-[color:var(--color-ink-3)]",
        negative && "text-[color:var(--color-danger)]",
        className,
      )}
    >
      {text}
    </span>
  );
}
