import * as React from "react";
import Decimal from "decimal.js";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/formatInr";

export { formatInr };

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
