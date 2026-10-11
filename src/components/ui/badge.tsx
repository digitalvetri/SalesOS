"use client";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-2)]",
        ok: "border-transparent bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]",
        warn: "border-transparent bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]",
        danger: "border-transparent bg-[color:var(--color-danger-bg)] text-[color:var(--color-danger)]",
        info: "border-transparent bg-[color:var(--color-info-bg)] text-[color:var(--color-info)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
