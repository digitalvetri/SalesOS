// Display helpers for orders imported from the client's Excel order book.
// Pure and client-safe (no server imports) — used by the orders repo, the
// order sheet / cards, the order page, the Excel export and WhatsApp guards.
//
// Rule: show exactly what the sheet said. Never show or dial a placeholder.

/** Minimal shape of Order.sheetRow needed for labels (see domain/import/sheetRow.ts). */
type SheetLabelSource = { customer: string | null; contact: string | null } | null;

/**
 * A dialable E.164 phone, or null. Older imports stored placeholders like
 * "+91-import-VIJIR519" — those (and anything else that isn't "+<digits>")
 * are treated as "no phone".
 */
export function realPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  return /^\+\d{8,15}$/.test(e164) ? e164 : null;
}

/** "+919965736331" → "9965736331"; foreign numbers keep their "+code". */
export function displayPhone(e164: string | null | undefined): string | null {
  const p = realPhone(e164);
  if (!p) return null;
  return p.startsWith("+91") && p.length === 13 ? p.slice(3) : p;
}

const DASH = "—";

/** Per-order customer name: the sheet's CUSTOMER cell for imported orders, else the customer record. */
export function customerLabelOf(sheetRow: SheetLabelSource, customerName: string): string {
  // Imported orders: the name the import read from that row (`name` — the CUSTOMER cell
  // can hold a phone number, with the name typed under CONTACT); else the cell as typed.
  const raw = sheetRow ? ("name" in sheetRow ? (sheetRow as { name: string | null }).name : sheetRow.customer) : customerName;
  const v = raw?.trim();
  return v ? v : DASH;
}

/** Per-order contact text: the sheet's CONTACT cell (raw), else the customer's real phone. */
export function contactLabelOf(sheetRow: SheetLabelSource, phoneE164: string | null): string {
  const sheet = sheetRow?.contact?.trim();
  if (sheet) return sheet;
  return displayPhone(phoneE164) ?? DASH;
}

/**
 * tel: target for the order — the customer's real phone, else the first
 * phone-looking number typed in the sheet's CONTACT cell. Null = no Call link.
 */
export function telOf(sheetRow: SheetLabelSource, phoneE164: string | null): string | null {
  const sheet = sheetRow?.contact?.trim();
  if (sheet) {
    const m = sheet.match(/\+?\d[\d\s-]{6,}\d/);
    if (m) {
      let digits = m[0].replace(/[\s-]/g, "");
      // "9965736331 8122774418" — two numbers run together: take the first.
      if (digits.replace(/^\+/, "").length > 13) digits = digits.match(/\d{10}/)?.[0] ?? digits;
      if (digits.startsWith("+")) return digits;
      if (digits.length === 10) return `+91${digits}`;
      return digits;
    }
  }
  return realPhone(phoneE164);
}

/** Money is hidden ("—") when the sheet had no TOTAL and nobody has typed one since. */
export function amountMissing(o: { totalMissing: boolean; total: string | number }): boolean {
  return o.totalMissing && Number(o.total) === 0;
}

/** IST calendar month "YYYY-MM" for an order date. */
export function istMonthKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${y}-${m}`;
}

export type MonthGroup<T> = { month: string; rows: T[] };

/**
 * Groups rows by IST month: newest month first, and inside a month oldest →
 * newest (like the sheet), ties broken by S.No.
 */
export function groupByMonth<T extends { orderDate: Date; serialNo: number | null }>(rows: T[]): MonthGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = istMonthKey(r.orderDate);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([month, list]) => ({
      month,
      rows: [...list].sort(
        (a, b) =>
          a.orderDate.getTime() - b.orderDate.getTime() ||
          (a.serialNo ?? Number.MAX_SAFE_INTEGER) - (b.serialNo ?? Number.MAX_SAFE_INTEGER),
      ),
    }));
}

export type MoneySummary = {
  orders: number; // non-cancelled orders (incl. "no amount" ones)
  cancelled: number;
  noAmount: number; // non-cancelled orders whose total is blank
  total: number;
  paid: number;
  balance: number;
};

/** Totals for a set of orders: cancelled excluded; blank-total orders counted but not summed. */
export function summarise(
  rows: { simpleStatus: string; totalMissing: boolean; total: string; paidTotal: string; balanceDue: string }[],
): MoneySummary {
  const s: MoneySummary = { orders: 0, cancelled: 0, noAmount: 0, total: 0, paid: 0, balance: 0 };
  // Sum in paise to avoid float drift.
  let total = 0;
  let paid = 0;
  let balance = 0;
  for (const r of rows) {
    if (r.simpleStatus === "CANCELLED") {
      s.cancelled++;
      continue;
    }
    s.orders++;
    if (amountMissing(r)) {
      s.noAmount++;
      continue;
    }
    total += Math.round(Number(r.total) * 100);
    paid += Math.round(Number(r.paidTotal) * 100);
    balance += Math.round(Number(r.balanceDue) * 100);
  }
  s.total = total / 100;
  s.paid = paid / 100;
  s.balance = balance / 100;
  return s;
}
