// Historical order-book parser (§15, rules in §15.1). Pure: works on a plain
// cell grid so the workbook reader (exceljs) stays in the service layer.
import Decimal from "decimal.js";

export type Cell = string | number | boolean | Date | null;
/** A formula cell after reading: cached result if the file has one. */
export type FormulaCell = { formula: string; result?: Cell };
export type RawCell = Cell | FormulaCell;
export type SheetGrid = { name: string; rows: RawCell[][] };

export type Flag =
  | "DATE_GUESSED"
  | "DATE_SWAPPED"
  | "NO_NAME"
  | "NO_PHONE"
  | "FORMULA_UNRESOLVED"
  | "POSSIBLE_DUPLICATE"
  | "AMOUNT_MISSING"
  | "BALANCE_MISMATCH";

export type ImportStatus = "DELIVERED" | "CONFIRMED" | "PARTIALLY_DISPATCHED" | "CANCELLED" | "CLOSED";

export type ParsedOrder = {
  ref: string; // "VIJI!R12" — first row of the order
  sheet: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM block month (for reconciliation)
  customerName: string;
  phone: string | null; // 10-digit Indian mobile or +E.164 as found
  lines: string[]; // free-text products → custom lines
  amount: string; // order total
  advance: string; // paid so far
  balance: string;
  status: ImportStatus;
  cancelNote: string | null;
  route: string | null; // payment route text, e.g. "KUMARESH GPAY"
  flags: Flag[];
  duplicateOf?: string; // ref of the first occurrence
};

export type MonthTotal = { sheet: string; month: string; computed: string; stated: string | null; diffPct: number | null };

export type ParseResult = { orders: ParsedOrder[]; reconciliation: MonthTotal[] };

// ───────── Cells ─────────

export function cellValue(c: RawCell | undefined): { value: Cell; unresolved: boolean } {
  if (c === undefined) return { value: null, unresolved: false };
  if (c !== null && typeof c === "object" && !(c instanceof Date) && "formula" in c) {
    if (c.result !== undefined && c.result !== null && !(typeof c.result === "object" && !(c.result instanceof Date))) {
      return { value: c.result, unresolved: false };
    }
    const evaluated = evalArithmetic(c.formula);
    return evaluated === null ? { value: null, unresolved: true } : { value: evaluated, unresolved: false };
  }
  return { value: c as Cell, unresolved: false };
}

/** `=23500*3` style formulas only (digits, + − × ÷, parentheses). Cell refs → null. */
export function evalArithmetic(formula: string): number | null {
  const expr = formula.replace(/^=/, "").replace(/\s+/g, "");
  if (!expr || !/^[\d.+\-*/()]+$/.test(expr)) return null;
  let i = 0;
  const peek = () => expr[i];
  const num = (): number | null => {
    if (peek() === "(") {
      i++;
      const v = sum();
      if (peek() !== ")") return null;
      i++;
      return v;
    }
    if (peek() === "-") {
      i++;
      const v = num();
      return v === null ? null : -v;
    }
    const m = /^\d+(\.\d+)?/.exec(expr.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const product = (): number | null => {
    let v = num();
    while (v !== null && (peek() === "*" || peek() === "/")) {
      const op = expr[i++];
      const r = num();
      if (r === null) return null;
      v = op === "*" ? v * r : r === 0 ? null : v / r;
    }
    return v;
  };
  const sum = (): number | null => {
    let v = product();
    while (v !== null && (peek() === "+" || peek() === "-")) {
      const op = expr[i++];
      const r = product();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  return v !== null && i === expr.length && Number.isFinite(v) ? v : null;
}

const text = (v: Cell) => (v === null || v === undefined ? "" : v instanceof Date ? "" : String(v).trim());

/** `NILL`, `NIL`, blank → 0; "23,500" → 23500; non-numeric text → null. */
export function parseMoney(v: Cell): Decimal | null {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  if (typeof v === "number") return new Decimal(v);
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase().replace(/[₹,\s/-]+$/g, "").replace(/[₹,\s]/g, "");
  if (t === "" || t === "NIL" || t === "NILL" || t === "NA") return new Decimal(0);
  return /^-?\d+(\.\d+)?$/.test(t) ? new Decimal(t) : null;
}

// ───────── Dates ─────────

const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};

/** Excel serial day number → YYYY-MM-DD (1900 system). */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000).toISOString().slice(0, 10);
}

/** Day-first text dates: 07.01.2026, 13/01/26, 03.01.26, 7-1-2026. */
export function parseTextDate(s: string): string | null {
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s.trim());
  if (!m) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return iso(year, Number(m[2]), Number(m[1]));
}

export type DateRead = { date: string | null; fromDateCell: boolean };

export function readDate(v: Cell): DateRead {
  if (v instanceof Date) return { date: v.toISOString().slice(0, 10), fromDateCell: true };
  if (typeof v === "number") return { date: excelSerialToIso(v), fromDateCell: true };
  if (typeof v === "string") return { date: parseTextDate(v), fromDateCell: false };
  return { date: null, fromDateCell: false };
}

/**
 * §15.1: text dates are day-first. For Excel date cells, if the block's majority
 * month disagrees with the cell's month but matches its day → swap day/month.
 * Still invalid → the block's month, day 1, flagged DATE_GUESSED.
 */
export function resolveDate(r: DateRead, blockMonth: string | null): { date: string | null; flag: Flag | null } {
  if (r.date && r.fromDateCell && blockMonth) {
    const [y, m, d] = r.date.split("-").map(Number) as [number, number, number];
    const bm = Number(blockMonth.slice(5));
    if (m !== bm && d === bm) {
      const swapped = iso(y, d, m);
      if (swapped) return { date: swapped, flag: "DATE_SWAPPED" };
    }
  }
  if (r.date) return { date: r.date, flag: null };
  return blockMonth ? { date: `${blockMonth}-01`, flag: "DATE_GUESSED" } : { date: null, flag: "DATE_GUESSED" };
}

// ───────── Headers + rows ─────────

export type Columns = Partial<Record<"date" | "customer" | "phone" | "product" | "amount" | "advance" | "balance" | "status" | "route", number>>;

const HEADER_KEYS: [keyof Columns, RegExp][] = [
  ["date", /^date$|^dt$/],
  ["customer", /customer|party|name/],
  ["phone", /phone|mobile|cell|contact|ph\.?\s*no/],
  ["product", /product|machine|item|particular|description/],
  ["amount", /^amount|^total|^value|order value|^amt/],
  ["advance", /^adv|advance|paid|received/],
  ["balance", /^bal|balance|pending amt/],
  ["status", /status|delivery/],
  ["route", /route|mode|payment|gpay|a\/c/],
];

/** A header row has ≥ 3 recognised column titles. Columns map by header text, not position. */
export function detectHeader(row: Cell[]): Columns | null {
  const cols: Columns = {};
  row.forEach((c, i) => {
    const t = text(c).toLowerCase();
    if (!t) return;
    for (const [key, re] of HEADER_KEYS) {
      if (cols[key] === undefined && re.test(t)) {
        cols[key] = i;
        break;
      }
    }
  });
  return Object.keys(cols).length >= 3 && cols.date !== undefined ? cols : null;
}

export function mapStatus(statusText: string, rowText: string, balance: Decimal): { status: ImportStatus; cancelNote: string | null } {
  const s = statusText.trim().toUpperCase();
  if (/CANCEL/.test(s) || /cancel/i.test(rowText)) return { status: "CANCELLED", cancelNote: statusText.trim() || rowText.trim() };
  if (/PARTIAL/.test(s)) return { status: "PARTIALLY_DISPATCHED", cancelNote: null };
  if (/DELIVER/.test(s)) return { status: "DELIVERED", cancelNote: null };
  if (/PENDING/.test(s)) return { status: "CONFIRMED", cancelNote: null };
  if (!s && balance.lte(0)) return { status: "CLOSED", cancelNote: null };
  return { status: s ? "CONFIRMED" : "DELIVERED", cancelNote: null };
}

const PHONE_RE = /^(?:\+?91)?[6-9]\d{9}$/;
const digits = (s: string) => s.replace(/[\s\-()]/g, "");

// ───────── Sheet parser ─────────

export function parseSheet(sheet: SheetGrid): ParseResult {
  const orders: ParsedOrder[] = [];
  const stated = new Map<string, Decimal>();
  let cols: Columns | null = null;
  let blockMonth: string | null = null;
  let current: ParsedOrder | null = null;
  // Majority month of text dates per block, learned on the fly.
  const monthVotes = new Map<string, number>();

  const finish = () => {
    if (current) orders.push(current);
    current = null;
  };

  sheet.rows.forEach((raw, idx) => {
    const reads = raw.map((c) => cellValue(c));
    const row = reads.map((r) => r.value);
    const filled = row.filter((v) => text(v) !== "" || v instanceof Date || typeof v === "number");
    const rowText = row.map(text).join(" ");

    if (filled.length === 0) return;

    const header = detectHeader(row);
    if (header) {
      finish();
      cols = header;
      return;
    }

    // Month marker: a lone date → new block.
    if (filled.length === 1) {
      const only = filled[0]!;
      const d = readDate(only);
      if (d.date) {
        finish();
        blockMonth = d.date.slice(0, 7);
        monthVotes.clear();
        return;
      }
      // Lone number (or =SUM) → stated block total.
      if (typeof only === "number" && blockMonth) {
        finish();
        stated.set(blockMonth, (stated.get(blockMonth) ?? new Decimal(0)).plus(only));
        return;
      }
    }
    if (/\btotal\b/i.test(rowText)) {
      finish();
      const nums = row.filter((v): v is number => typeof v === "number");
      if (blockMonth && nums.length > 0) stated.set(blockMonth, (stated.get(blockMonth) ?? new Decimal(0)).plus(Math.max(...nums)));
      return;
    }
    if (!cols) return;
    const c: Columns = cols;
    const get = (k: keyof Columns) => (c[k] === undefined ? null : (row[c[k]!] ?? null));
    const unresolved = (k: keyof Columns) => c[k] !== undefined && reads[c[k]!]?.unresolved === true;

    const dateCell = get("date");
    const custText = text(get("customer"));
    const phoneCell = get("phone");
    const phoneText = typeof phoneCell === "number" ? String(phoneCell) : text(phoneCell);
    const product = text(get("product"));

    // Continuation: no date, customer and phone → append product to the previous order.
    if (!readDate(dateCell).date && !custText && !phoneText) {
      if (current && product) {
        (current as ParsedOrder).lines.push(product);
        // The amount often sits on the last row of a multi-row order.
        const amt = parseMoney(get("amount"));
        if (amt && amt.gt(0)) (current as ParsedOrder).amount = amt.toString();
        const adv = parseMoney(get("advance"));
        if (adv && adv.gt(0)) (current as ParsedOrder).advance = adv.toString();
        const bal = parseMoney(get("balance"));
        if (bal && bal.gt(0)) (current as ParsedOrder).balance = bal.toString();
      }
      return;
    }

    finish();
    const flags: Flag[] = [];
    const dr = readDate(dateCell);
    if (dr.date && !dr.fromDateCell) monthVotes.set(dr.date.slice(0, 7), (monthVotes.get(dr.date.slice(0, 7)) ?? 0) + 1);
    const majority = [...monthVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? blockMonth;
    const resolved = resolveDate(dr, majority ?? blockMonth);
    if (resolved.flag) flags.push(resolved.flag);
    const date = resolved.date ?? `${blockMonth ?? "1970-01"}-01`;

    // Phone in the customer column (Viji's sheet).
    let name = custText;
    let phone = PHONE_RE.test(digits(phoneText)) ? digits(phoneText) : null;
    if (PHONE_RE.test(digits(custText))) {
      phone = phone ?? digits(custText);
      name = `Unknown (${digits(custText).slice(-4)})`;
      flags.push("NO_NAME");
    }
    if (!name) {
      name = phone ? `Unknown (${phone.slice(-4)})` : "Unknown";
      flags.push("NO_NAME");
    }
    if (!phone) flags.push("NO_PHONE");

    const amountRaw = parseMoney(get("amount"));
    const advance = parseMoney(get("advance")) ?? new Decimal(0);
    let balance = parseMoney(get("balance"));
    if (unresolved("amount") || unresolved("advance") || unresolved("balance")) flags.push("FORMULA_UNRESOLVED");
    const amount = amountRaw ?? new Decimal(0);
    if (!amountRaw || amount.isZero()) flags.push("AMOUNT_MISSING");
    if (balance === null) balance = Decimal.max(0, amount.minus(advance));

    const { status, cancelNote } = mapStatus(text(get("status")), rowText, balance);
    current = {
      ref: `${sheet.name}!R${idx + 1}`,
      sheet: sheet.name,
      date,
      month: blockMonth ?? date.slice(0, 7),
      customerName: name,
      phone,
      lines: product ? [product] : [],
      amount: amount.toString(),
      advance: advance.toString(),
      balance: balance.toString(),
      status,
      cancelNote,
      route: text(get("route")) || null,
      flags,
    };
  });
  finish();

  for (const o of orders) {
    if (!new Decimal(o.amount).minus(o.advance).minus(o.balance).abs().lte(1) && !new Decimal(o.amount).isZero()) {
      o.flags.push("BALANCE_MISMATCH");
    }
  }

  const computed = new Map<string, Decimal>();
  for (const o of orders) computed.set(o.month, (computed.get(o.month) ?? new Decimal(0)).plus(o.amount));
  const months = [...new Set([...computed.keys(), ...stated.keys()])].sort();
  const reconciliation = months.map((month) => {
    const comp = computed.get(month) ?? new Decimal(0);
    const st = stated.get(month) ?? null;
    return {
      sheet: sheet.name,
      month,
      computed: comp.toString(),
      stated: st ? st.toString() : null,
      diffPct: st && !st.isZero() ? Number(comp.minus(st).div(st).times(100).toFixed(1)) : null,
    };
  });
  return { orders, reconciliation };
}

/**
 * §15.1 "Same order on two sheets": phone (or name) + amount + month match
 * across sheets → POSSIBLE_DUPLICATE on the later ones (default: import the first).
 */
export function markDuplicates(orders: ParsedOrder[]): ParsedOrder[] {
  const seen = new Map<string, ParsedOrder>();
  for (const o of orders) {
    const who = o.phone ?? o.customerName.trim().toLowerCase();
    const key = `${who}|${o.amount}|${o.month}`;
    const first = seen.get(key);
    if (first && first.sheet !== o.sheet) {
      if (!o.flags.includes("POSSIBLE_DUPLICATE")) o.flags.push("POSSIBLE_DUPLICATE");
      o.duplicateOf = first.ref;
    } else if (!first) {
      seen.set(key, o);
    }
  }
  return orders;
}

/** Parse every sheet that isn't skipped, then flag cross-sheet duplicates. */
export function parseOrderBook(sheets: SheetGrid[]): ParseResult {
  const all = sheets.map(parseSheet);
  return {
    orders: markDuplicates(all.flatMap((r) => r.orders)),
    reconciliation: all.flatMap((r) => r.reconciliation),
  };
}

/** Pre-fill sheet → salesperson by name (sheet `VIJI` → user Viji). */
export function matchSheetToUser<T extends { id: string; name: string }>(sheetName: string, users: T[]): T | null {
  const s = sheetName.trim().toLowerCase();
  return users.find((u) => u.name.trim().toLowerCase() === s) ?? users.find((u) => s.startsWith(u.name.trim().toLowerCase())) ?? null;
}

/** Route keyword → configured target ("KUMARESH GPAY" → the Kumaresh GPay account). */
export function matchRoute<T>(route: string | null, mapping: { keyword: string; target: T }[]): T | null {
  if (!route) return null;
  const r = route.toUpperCase();
  const hit = [...mapping].sort((a, b) => b.keyword.length - a.keyword.length).find((m) => m.keyword && r.includes(m.keyword.toUpperCase()));
  return hit ? hit.target : null;
}
