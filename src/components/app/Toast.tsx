"use client";
import { Toaster as SonnerToaster, toast } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "!bg-[color:var(--color-surface)] !border-[color:var(--color-border-strong)] !text-[color:var(--color-ink)] !shadow-[var(--shadow-2)]",
          error:
            "!bg-[color:var(--color-danger-bg)] !border-[color:var(--color-danger)]/40 !text-[color:var(--color-danger)]",
          success:
            "!bg-[color:var(--color-ok-bg)] !border-[color:var(--color-ok)]/40 !text-[color:var(--color-ok)]",
        },
      }}
    />
  );
}

export { toast };
