// Formatting helpers shared by the order table and the order cards.
import type { OrderV2Row } from "@/server/repo/ordersV2";

export function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Asia/Kolkata",
  })
    .format(d)
    .replace(/\//g, "-");
}

/** "2026-10" → "October 2026". */
export function fmtMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** DELIVERY column: the sheet's cell as typed, else the promised delivery date, else "—". */
export function deliveryText(row: Pick<OrderV2Row, "sheetRow" | "promisedDeliveryDate">): string {
  const sheet = row.sheetRow?.delivery?.trim();
  if (sheet) return sheet;
  return row.promisedDeliveryDate ? fmtDate(row.promisedDeliveryDate) : "—";
}

export const PILL_STYLE: Record<OrderV2Row["simpleStatus"], string> = {
  PENDING: "bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]",
  DELIVERED: "bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]",
  CANCELLED: "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-3)]",
};

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "??"
  );
}

// Dialog surface: bottom sheet on phones, centred dialog from 640 px.
export const SHEET_CONTENT =
  "fixed inset-x-0 bottom-0 z-50 max-h-[92svh] overflow-y-auto rounded-t-[24px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-2)] focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-lg)] sm:p-6";
export const SHEET_OVERLAY = "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm";
