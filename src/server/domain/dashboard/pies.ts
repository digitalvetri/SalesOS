// Dashboard donut data (spec §6). Pure — no IO. Flat colours only — no
// gradients, no purple: greens / charcoal / amber / red from the KFM palette.
import Decimal from "decimal.js";

export type Slice = { key: string; label: string; value: number; color: string };

export type StatusCounts = { pending: number; inProgress: number; finished: number; delivered: number; cancelled: number };

/** Fixed categorical palette (no purple / violet). */
export const PALETTE = ["#2D6A4F", "#E0A526", "#2D2B2C", "#D7262E", "#74C69D", "#8A5A00", "#40916C"] as const;
const OTHERS_COLOR = "#A3B1A8";

const STATUS: { key: keyof StatusCounts; label: string; color: string }[] = [
  { key: "pending", label: "Pending", color: "var(--color-warn-fill)" },
  { key: "inProgress", label: "On progress", color: "#E0A526" },
  { key: "finished", label: "Finished", color: "var(--color-accent)" },
  { key: "delivered", label: "Delivered", color: "#2D2B2C" },
  { key: "cancelled", label: "Cancelled", color: "var(--color-border-strong)" },
];

/** pending = PENDING & NOT_STARTED, inProgress = PENDING & IN_PROGRESS, finished = PENDING & FINISHED. Zero slices dropped. */
export function statusSlices(c: StatusCounts): Slice[] {
  return STATUS.filter((s) => c[s.key] > 0).map((s) => ({ key: s.key, label: s.label, value: c[s.key], color: s.color }));
}

/** Whole-number percentages that always sum to 100 (largest-remainder method). */
export function slicesWithPercent<T extends Slice>(s: T[]): (T & { pct: number })[] {
  const total = s.reduce((a, x) => a + Math.max(0, x.value), 0);
  if (total <= 0) return s.map((x) => ({ ...x, pct: 0 }));
  const raw = s.map((x) => (Math.max(0, x.value) / total) * 100);
  const pct = raw.map(Math.floor);
  let left = 100 - pct.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    pct[i]! += 1;
    left -= 1;
  }
  return s.map((x, i) => ({ ...x, pct: pct[i]! }));
}

export const PAYMENT_MODE_LABEL: Record<string, string> = {
  UPI: "UPI",
  CASH: "Cash",
  BANK_TRANSFER: "Bank",
  CHEQUE: "Cheque",
  CARD: "Card",
};
const MODE_COLOR: Record<string, string> = {
  UPI: "#2D6A4F",
  CASH: "#E0A526",
  BANK_TRANSFER: "#2D2B2C",
  CHEQUE: "#74C69D",
  CARD: "#D7262E",
};

const toNum = (v: string) => new Decimal(v).toNumber();

/** Amount received per payment method → slices, largest first; zero / negative dropped. */
export function paymentModeSlices(rows: { mode: string; amount: string }[]): Slice[] {
  return rows
    .map((r) => ({ key: r.mode, label: PAYMENT_MODE_LABEL[r.mode] ?? r.mode, value: toNum(r.amount), color: MODE_COLOR[r.mode] ?? OTHERS_COLOR }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** Sales by employee → top 6 + "Others", largest first; zero dropped. */
export function employeeSlices(rows: { name: string; value: string }[], top = 6): Slice[] {
  const sorted = rows
    .map((r) => ({ name: r.name, value: toNum(r.value) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const head = sorted.slice(0, top).map((r, i) => ({ key: `e${i}`, label: r.name, value: r.value, color: PALETTE[i % PALETTE.length]! }));
  const rest = sorted.slice(top).reduce((a, r) => a + r.value, 0);
  return rest > 0 ? [...head, { key: "others", label: "Others", value: rest, color: OTHERS_COLOR }] : head;
}
