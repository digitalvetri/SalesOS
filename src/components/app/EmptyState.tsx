import * as React from "react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  title: string;
  action?: React.ReactNode;
  className?: string;
};

// One sentence + one action. No illustrations (spec §10.5).
export function EmptyState({ title, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[60svh] flex-col items-center justify-center gap-6 px-6 text-center",
        className,
      )}
    >
      <p className="max-w-md text-base text-[color:var(--color-ink-2)]">{title}</p>
      {action}
    </div>
  );
}
