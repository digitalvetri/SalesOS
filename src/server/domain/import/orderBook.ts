// Historical order-book parser (§15, rules in §15.1). Pure: works on a plain
// cell grid so the workbook reader (exceljs) stays in the service layer.
//
// Rules learned from the client's real ORDER DETAILS.xlsx (2026-10-13 audit):
//   - Columns are mapped by header text: DATE, CUSTOMER, CONTACT, PRODUCTS, TOTAL,
//     ADV, BAL, DELIVERY DATE / DVL.TIME, STATUS, ACC DETAILS, COMMENTS / DETAIL.
//     Unlabelled columns that hold text are remarks (→ comments).
//   - Month markers: a row of the same date repeated, a lone date, or a lone month
//     name ("MARCH", "MAY .2026"). TOTAL rows and lone numbers close a block.
//   - Summary tables ("Calender 26 … Total Turnover") are skipped up to the next header.
//   - "Old order … pending status" sections repeat earlier orders → not imported again.
//   - Multi-row orders: the amount on a later row is the total when the first row had
//     none; separately priced lines are added up; a line marked cancelled is not.
//   - BAL formulas (=F226-G226, =H226) are evaluated against the sheet.
//   - Dates: dd/mm text dates are trusted (typos repaired against the month block);
//     Excel date cells may have day and month swapped → nearest to the neighbours.
import Decimal from "decimal.js";
import type { SheetRow } from "./sheetRow";

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
  | "BALANCE_MISMATCH"
  | "AMOUNTS_ADDED" // a multi-row order whose lines were priced separately
  | "PAYMENT_NOT_RECORDED" // ADV and BAL both empty
  | "ADV_BAL_CONFLICT" // ADV, BAL and TOTAL don't add up
  | "CANCEL_MENTIONED"; // a remark mentions cancelling, but the order wasn't marked cancelled

export type ImportStatus = "DELIVERED" | "CONFIRMED" | "PARTIALLY_DISPATCHED" | "CANCELLED" | "CLOSED";

export type ParsedOrder = {
  ref: string; // "VIJI!R12" — first row of the order
  sheet: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM block month (for reconciliation)
  customerName: string; // as typed; "" when the row has no name
  phone: string | null; // first valid 10-digit Indian mobile on the row
  altPhone: string | null; // second valid mobile, if any
  lines: string[]; // free-text products → custom lines
  amount: string; // order total; "0" when the TOTAL cell is empty
  amountMissing: boolean;
  advance: string; // ADV as a number ("0" when NILL/blank)
  balance: string;
  /** false when the BAL cell was left blank (no payment info), true for a number or NILL. */
  balanceStated: boolean;
  /** Paid so far, from TOTAL / ADV / BAL. null = the sheet doesn't say (ADV and BAL empty). */
  paid: string | null;
  status: ImportStatus;
  cancelNote: string | null;
  route: string | null; // ACC DETAILS, e.g. "KUMARESH GPAY"
  deliveryDate: string | null; // YYYY-MM-DD when the DELIVERY cell is a date
  comments: string | null;
  flags: Flag[];
  duplicateOf?: string; // ref of the first occurrence
  sheetRow: SheetRow;
};

export type MonthTotal = { sheet: string; month: string; computed: string; stated: string | null; diffPct: number | null };
export type SkippedRow = { ref: string; reason: string };

export type ParseResult = { orders: ParsedOrder[]; reconciliation: MonthTotal[]; skipped?: SkippedRow[] };

// ───────── Cells ─────────

export function cellValue(c: RawCell | undefined): { value: Cell; unresolved: boolean } {
  if (c === undefined) return { value: null, unresolved: false };
  if (isFormula(c)) {
    if (c.result !== undefined && c.result !== null && !(typeof c.result === "object" && !(c.result instanceof Date))) {
      return { value: c.result, unresolved: false };
    }
    const evaluated = evalArithmetic(c.formula);
    return evaluated === null ? { value: null, unresolved: true } : { value: evaluated, unresolved: false };
  }
  return { value: c as Cell, unresolved: false };
}

const isFormula = (c: RawCell | undefined): c is FormulaCell =>
  c !== null && c !== undefined && typeof c === "object" && !(c instanceof Date) && "formula" in c;

/** `=23500*3` style formulas only (digits, + − × ÷, parentheses). Cell refs → null. */
export function evalArithmetic(formula: string): number | null {
  return /[a-z$]/i.test(formula) ? null : evalFormula(formula, () => null);
}

/**
 * Formula evaluator: numbers, + − × ÷, parentheses, cell refs (F226) and SUM(F3:F9).
 * `ref(row, col)` returns a cell's number (1-based row, 0-based col) or null.
 */
export function evalFormula(formula: string, ref: (row: number, col: number) => number | null): number | null {
  const expr = formula.replace(/^=/, "").replace(/\s+/g, "").toUpperCase();
  if (!expr || !/^[\dA-Z.+\-*/():$]+$/.test(expr)) return null;
  let i = 0;
  const peek = () => expr[i];
  const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  const cellRef = (): { row: number; col: number } | null => {
    const m = /^\$?([A-Z]{1,3})\$?(\d+)/.exec(expr.slice(i));
    if (!m) return null;
    i += m[0].length;
    return { row: Number(m[2]), col: colIndex(m[1]!) };
  };
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
    if (expr.startsWith("SUM(", i)) {
      i += 4;
      const a = cellRef();
      if (!a || peek() !== ":") return null;
      i++;
      const b = cellRef();
      if (!b || peek() !== ")") return null;
      i++;
      let total = 0;
      for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++)
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) total += ref(r, c) ?? 0;
      return total;
    }
    if (/[A-Z$]/.test(peek() ?? "")) {
      const r = cellRef();
      return r ? ref(r.row, r.col) : null;
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

/** Display text of a cell value (trimmed; Excel's "Column 7" placeholders count as empty). */
const text = (v: Cell) => {
  if (v === null || v === undefined || v instanceof Date) return "";
  const t = String(v).replace(/\s+/g, " ").trim();
  return /^column \d+$/i.test(t) ? "" : t;
};

/** `NILL`, `NIL`, blank → 0; "23,500" → 23500; non-numeric text → null. */
export function parseMoney(v: Cell): Decimal | null {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  if (typeof v === "number") return new Decimal(v);
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase().replace(/[₹,\s/-]+$/g, "").replace(/[₹,\s]/g, "");
  if (t === "" || t === "NIL" || t === "NILL" || t === "NA") return new Decimal(0);
  return /^-?\d+(\.\d+)?$/.test(t) ? new Decimal(t) : null;
}

type Money = { kind: "number"; value: Decimal } | { kind: "nil" } | { kind: "blank" } | { kind: "text"; text: string };

function readMoney(v: Cell): Money {
  if (v === null || v === undefined || (typeof v === "string" && text(v) === "")) return { kind: "blank" };
  if (typeof v === "number") return { kind: "number", value: new Decimal(v) };
  if (typeof v !== "string") return { kind: "text", text: String(v) };
  const t = v.trim().toUpperCase().replace(/[₹,\s/-]+$/g, "").replace(/[₹,\s]/g, "");
  if (t === "NIL" || t === "NILL" || t === "NA" || t === "") return { kind: "nil" };
  return /^-?\d+(\.\d+)?$/.test(t) ? { kind: "number", value: new Decimal(t) } : { kind: "text", text: text(v) };
}

const positive = (m: Money): Decimal | null => (m.kind === "number" && m.value.gt(0) ? m.value : null);

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

/** Lenient day-first reading: "06.-2.2026", "28/03/326", "17/12", "24/03 /26" → parts (year may be garbled). */
function textDateParts(s: string): { d: number; m: number; y: number | null } | null {
  const m = /^(\d{1,2})\s*[./-]+\s*(\d{1,2})(?:\s*[./ -]+\s*(\d+))?$/.exec(s.trim());
  if (!m) return null;
  const raw = m[3];
  let y: number | null = null;
  if (raw && raw.length === 2) y = 2000 + Number(raw);
  else if (raw && raw.length === 4) y = Number(raw);
  return { d: Number(m[1]), m: Number(m[2]), y };
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

const dayNum = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;
const monthIdx = (isoOrYm: string) => Number(isoOrYm.slice(0, 4)) * 12 + Number(isoOrYm.slice(5, 7)) - 1;
const ddmmyyyy = (isoDate: string) => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;

/** A date cell's two readings: as stored, and day/month swapped (Excel turns typed 08/01 into 1 Aug). */
function cellCandidates(isoDate: string): { date: string; swapped: boolean }[] {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const out = [{ date: isoDate, swapped: false }];
  const sw = d <= 12 && d !== m ? iso(y, d, m) : null;
  if (sw) out.push({ date: sw, swapped: true });
  return out;
}

// ───────── Headers + rows ─────────

export type ColumnKey =
  | "date" | "customer" | "phone" | "product" | "amount" | "advance" | "balance"
  | "delivery" | "status" | "route" | "comments";
export type Columns = Partial<Record<ColumnKey, number>>;

// Order matters: "DELIVERY DATE" is a delivery column (not the order DATE, not STATUS);
// "CUSTOMER DETAILS" is the customer and "ACC DETAILS" the account, before "DETAIL" = comments.
const HEADER_KEYS: [ColumnKey, RegExp][] = [
  ["date", /^date\.?$|^dt\.?$|^order date$/],
  ["delivery", /deliver|^dvl|dispatch/],
  ["status", /status/],
  ["customer", /customer|party|name/],
  ["phone", /phone|mobile|cell|contact|ph\.?\s*no/],
  ["product", /product|machine|item|particular|description/],
  ["amount", /^amount|^total|^value|order value|^amt/],
  ["advance", /^adv|advance|paid|received/],
  ["balance", /^bal|balance|pending amt/],
  ["route", /^acc|account|a\/c|route|mode|payment|gpay/],
  ["comments", /comment|detail|remark|note/],
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

// ───────── Contacts ─────────

/** Indian mobile from a run of digits: 98407 52395, +91…, 0…; anything else → null. */
function mobileOf(digits: string): string | null {
  let d = digits;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** Valid mobiles in a cell ("9965736331 / 8122774418", "mohan/9600722488") + the leftover text. */
export function splitContact(raw: string): { phones: string[]; rest: string } {
  const phones: string[] = [];
  let rest = raw;
  // Numbers may contain spaces/dashes ("97899 03684", "+91 98429-92802").
  const re = /\+?\d[\d\s-]{6,16}\d/g;
  for (const m of raw.match(re) ?? []) {
    const mob = mobileOf(m.replace(/\D/g, ""));
    if (mob) {
      if (!phones.includes(mob)) phones.push(mob);
      rest = rest.replace(m, " ");
    }
  }
  rest = rest.replace(/\s+/g, " ").replace(/^[\s/,&\-–:]+|[\s/,&\-–:]+$/g, "").trim();
  return { phones, rest };
}

const isNumberish = (s: string) => s !== "" && /^[\d\s+().\-/]+$/.test(s);

// ───────── Sheet parser ─────────

export type ParseOptions = { latest?: string | null };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b[\s.\-/]*(?<year>\d{4})?$/i;
const TOTAL_RE = /^(grand\s+)?total(\s+value)?\s*:?$/i;
const SUMMARY_RE = /calend[ae]r|turnover/i;
const REPEAT_SECTION_RE = /old order|pending status|follow\s*-?\s*up/i;
const JUNK_RE = /^[?*#.\-–]+$/;

type DateInfo =
  | { kind: "text"; raw: string; parts: { d: number; m: number; y: number | null } | null }
  | { kind: "cell"; raw: string; date: string }
  | { kind: "none"; raw: string };

type Draft = {
  ref: string;
  rowNo: number;
  segment: number;
  section: "normal" | "repeat";
  dateInfo: DateInfo;
  cells: Record<ColumnKey, string>; // opening row, display text
  extraRemarks: string[];
  lines: string[];
  cancelledLines: number;
  cancelledAmount: Decimal; // amounts written on lines marked cancelled (the sheet's TOTAL still counts them)
  amount: Decimal | null;
  amountText: string[];
  adv: Money;
  bal: Money;
  advText: string[];
  balText: string[];
  amountsAdded: boolean;
  unresolved: boolean;
  deliveryCell: Cell;
  rows: number[];
};

export function parseSheet(sheet: SheetGrid, opts: ParseOptions = {}): ParseResult {
  const latest = opts.latest ?? null;
  const skipped: SkippedRow[] = [];
  const statedBySeg = new Map<number, Decimal>();
  const addStated = (n: Decimal.Value) => statedBySeg.set(segment, (statedBySeg.get(segment) ?? new Decimal(0)).plus(n));
  const drafts: Draft[] = [];
  const segMarker = new Map<number, string>(); // segment → month from a marker

  // Evaluate any cell as a number (formulas follow references across the sheet).
  const memo = new Map<string, number | null>();
  const numberAt = (row: number, col: number, depth = 0): number | null => {
    const key = `${row}:${col}`;
    if (memo.has(key)) return memo.get(key)!;
    const raw = sheet.rows[row - 1]?.[col];
    let out: number | null = null;
    if (raw === undefined || raw === null) out = null;
    else if (isFormula(raw)) {
      if (typeof raw.result === "number") out = raw.result;
      else if (depth < 12) out = evalFormula(raw.formula, (r, c) => numberAt(r, c, depth + 1));
    } else if (typeof raw === "number") out = raw;
    else if (typeof raw === "string") {
      const m = readMoney(raw);
      out = m.kind === "number" ? m.value.toNumber() : m.kind === "nil" ? 0 : null;
    }
    memo.set(key, out);
    return out;
  };
  /** Cell value with formulas evaluated; `unresolved` when a formula can't be worked out. */
  const valueAt = (rowNo: number, col: number): { value: Cell; unresolved: boolean } => {
    const raw = sheet.rows[rowNo - 1]?.[col];
    if (isFormula(raw)) {
      const n = numberAt(rowNo, col);
      if (n !== null) return { value: n, unresolved: false };
      const cv = cellValue(raw);
      return cv;
    }
    return cellValue(raw);
  };

  let cols: Columns | null = null;
  let segment = 0;
  let mode: "normal" | "summary" | "repeat" = "normal";
  let blockMonth: string | null = null;
  let current: Draft | null = null;
  const finish = () => {
    if (current) drafts.push(current);
    current = null;
  };
  const newSegment = (marker: string | null) => {
    finish();
    segment++;
    blockMonth = marker;
    if (marker) segMarker.set(segment, marker);
  };

  sheet.rows.forEach((_, idx) => {
    const rowNo = idx + 1;
    const reads = sheet.rows[idx]!.map((_c, ci) => valueAt(rowNo, ci));
    const row = reads.map((r) => r.value);
    const filledIdx = row.map((v, i) => ((v instanceof Date || typeof v === "number" || text(v) !== "") ? i : -1)).filter((i) => i >= 0);
    if (filledIdx.length === 0) return;
    const meaningful = filledIdx.filter((i) => !(typeof row[i] === "string" && JUNK_RE.test(text(row[i]!))));

    const header = detectHeader(row);
    if (header) {
      finish();
      cols = header;
      if (mode === "summary") mode = "normal";
      return;
    }
    if (mode === "summary" && meaningful.length === 1 && typeof row[meaningful[0]!] === "string") {
      const t = text(row[meaningful[0]!]!);
      const inLabelCol = !cols || meaningful[0]! === cols.date || meaningful[0]! === cols.customer;
      if (inLabelCol && !MONTH_RE.test(t) && !SUMMARY_RE.test(t)) {
        mode = REPEAT_SECTION_RE.test(t) ? "repeat" : "normal";
        newSegment(null);
        return;
      }
    }
    if (mode === "summary") {
      skipped.push({ ref: `${sheet.name}!R${rowNo}`, reason: "summary table" });
      return;
    }

    // Month marker: every meaningful cell is a date cell (mostly the same date), or a lone date.
    // (Plain numbers never count — a lone 50500 is a stated total, not a 2038 date.)
    const asDates = meaningful.map((i) => (row[i] instanceof Date ? readDate(row[i]!).date : null));
    if (meaningful.length > 0 && asDates.every((d) => d !== null)) {
      // A row of nothing but dates is a marker; its month = the most common one (tie → the first cell's).
      const counts = new Map<string, number>();
      for (const d of asDates) counts.set(d!.slice(0, 7), (counts.get(d!.slice(0, 7)) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] === asDates[0]!.slice(0, 7) ? -1 : 1))[0]![0];
      newSegment(top);
      mode = "normal";
      return;
    }
    if (meaningful.length === 1) {
      const v = row[meaningful[0]!]!;
      const t = text(v);
      const td = typeof v === "string" ? parseTextDate(t) : null;
      const mm = typeof v === "string" ? MONTH_RE.exec(t) : null;
      if (td || mm) {
        const ym = td ? td.slice(0, 7) : `${mm!.groups?.year ?? (latest ?? "2026").slice(0, 4)}-${String(MONTHS.indexOf(mm![1]!.slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}`;
        newSegment(ym);
        mode = "normal";
        return;
      }
      if (typeof v === "number") {
        // Lone number = a block's stated total.
        addStated(v);
        newSegment(null);
        return;
      }
      const labelCol = !cols || meaningful[0]! === cols.date || meaningful[0]! === cols.customer || meaningful[0]! < (cols.date ?? 0);
      if (typeof v === "string" && !TOTAL_RE.test(t) && labelCol) {
        // A section label ("Service", "Old order Payment pending status") in the DATE/CUSTOMER column.
        finish();
        if (SUMMARY_RE.test(t)) mode = "summary";
        else mode = REPEAT_SECTION_RE.test(t) ? "repeat" : "normal";
        newSegment(null);
        return;
      }
    }
    if (filledIdx.some((i) => typeof row[i] === "string" && SUMMARY_RE.test(text(row[i]!)))) {
      finish();
      mode = "summary";
      skipped.push({ ref: `${sheet.name}!R${rowNo}`, reason: "summary table" });
      return;
    }
    if (filledIdx.some((i) => typeof row[i] === "string" && TOTAL_RE.test(text(row[i]!)))) {
      const nums = row.filter((v): v is number => typeof v === "number");
      if (nums.length > 0) addStated(Math.max(...nums));
      else {
        const amtCol = cols?.amount;
        const t = amtCol !== undefined ? readMoney(row[amtCol] ?? null) : { kind: "blank" as const };
        if (t.kind === "number") addStated(t.value);
      }
      newSegment(null);
      return;
    }
    if (!cols) return;
    const c: Columns = cols;
    const at = (k: ColumnKey) => (c[k] === undefined ? null : (row[c[k]!] ?? null));
    const unresolvedAt = (k: ColumnKey) => c[k] !== undefined && reads[c[k]!]?.unresolved === true;
    const cellText = (k: ColumnKey) => {
      const v = at(k);
      if (v instanceof Date) return ddmmyyyy(v.toISOString().slice(0, 10));
      if (typeof v === "number") return String(v);
      return text(v);
    };
    const mapped = new Set(Object.values(c));
    const remarks = filledIdx.filter((i) => !mapped.has(i) && !JUNK_RE.test(text(row[i]!))).map((i) => {
      const v = row[i]!;
      return v instanceof Date ? ddmmyyyy(v.toISOString().slice(0, 10)) : typeof v === "number" ? String(v) : text(v);
    });

    const dateCell = at("date");
    const custText = cellText("customer");
    const contactText = cellText("phone");
    const product = cellText("product");
    const productIsText = product !== "" && !isNumberish(product);
    const amount = readMoney(at("amount"));
    const routeText = cellText("route");
    const dateRead = readDate(dateCell);
    const dateRaw = dateCell instanceof Date || typeof dateCell === "number" ? "" : text(dateCell);
    const hasDate = !!dateRead.date || (!!dateRaw && !!textDateParts(dateRaw));

    const isContinuation = !hasDate && !custText && !contactText;
    if (isContinuation) {
      // Lines without a product are subtotals/notes ("1193576 | New Clients") — not order lines.
      if (!productIsText) {
        if (remarks.length && current) (current as Draft).extraRemarks.push(...remarks);
        return;
      }
      const cur = current as Draft | null;
      if (!cur) return;
      const amt = positive(amount);
      const lineCancelled = [product, cellText("balance"), cellText("status"), text(at("amount"))].some((t) => /cancel/i.test(t));
      // A priced line with its own payment route and an already-priced order is a separate sale (Viji R389).
      if (amt && cur.amount && routeText && !lineCancelled) {
        finish();
        current = startDraft(rowNo, { dateInfo: { kind: "none", raw: "" } });
        return;
      }
      cur.lines.push(product);
      cur.rows.push(rowNo);
      if (remarks.length) cur.extraRemarks.push(...remarks);
      if (lineCancelled) {
        cur.cancelledLines++;
        if (amt) cur.cancelledAmount = cur.cancelledAmount.plus(amt);
        return;
      }
      const adv = readMoney(at("advance"));
      const bal = readMoney(at("balance"));
      if (unresolvedAt("amount") || unresolvedAt("advance") || unresolvedAt("balance")) cur.unresolved = true;
      if (amt) {
        cur.amountText.push(amount.kind === "number" ? amount.value.toString() : "");
        if (!cur.amount) {
          // The total sits on the last row of a multi-row order.
          cur.amount = amt;
          if (adv.kind !== "blank") { cur.adv = adv; cur.advText.push(cellText("advance")); }
          if (bal.kind !== "blank") { cur.bal = bal; cur.balText.push(cellText("balance")); }
        } else if (amt.eq(cur.amount)) {
          // Same total written again on the next line — not a second price.
        } else {
          cur.amount = cur.amount.plus(amt);
          cur.amountsAdded = true;
          cur.adv = addMoney(cur.adv, adv);
          cur.bal = addMoney(cur.bal, bal);
          if (adv.kind !== "blank") cur.advText.push(cellText("advance"));
          if (bal.kind !== "blank") cur.balText.push(cellText("balance"));
        }
      } else {
        if (cur.adv.kind === "blank" && adv.kind !== "blank") { cur.adv = adv; cur.advText.push(cellText("advance")); }
        if (cur.bal.kind === "blank" && bal.kind !== "blank") { cur.bal = bal; cur.balText.push(cellText("balance")); }
      }
      return;
    }

    finish();
    const info: DateInfo = dateRead.date && dateRead.fromDateCell
      ? { kind: "cell", raw: "", date: dateRead.date }
      : dateRaw && textDateParts(dateRaw)
        ? { kind: "text", raw: dateRaw, parts: textDateParts(dateRaw) }
        : { kind: "none", raw: dateRaw };
    current = startDraft(rowNo, { dateInfo: info });

    function startDraft(rn: number, o: { dateInfo: DateInfo }): Draft {
      const adv = readMoney(at("advance"));
      const bal = readMoney(at("balance"));
      const amt = positive(amount);
      const cancelledOnly = [product, cellText("balance"), text(at("amount"))].some((t) => /cancel/i.test(t));
      return {
        ref: `${sheet.name}!R${rn}`,
        rowNo: rn,
        segment,
        section: mode === "repeat" ? "repeat" : "normal",
        dateInfo: o.dateInfo,
        cells: {
          date: o.dateInfo.kind === "cell" ? "" : o.dateInfo.raw,
          customer: custText,
          phone: contactText,
          product,
          amount: cellText("amount"),
          advance: cellText("advance"),
          balance: cellText("balance"),
          delivery: cellText("delivery"),
          status: cellText("status"),
          route: routeText,
          comments: cellText("comments"),
        },
        extraRemarks: remarks,
        lines: productIsText || product ? [product] : [],
        cancelledLines: cancelledOnly ? 1 : 0,
        cancelledAmount: new Decimal(0),
        amount: amt,
        amountText: amt ? [amt.toString()] : [],
        adv,
        bal,
        advText: adv.kind !== "blank" ? [cellText("advance")] : [],
        balText: bal.kind !== "blank" ? [cellText("balance")] : [],
        amountsAdded: false,
        unresolved: unresolvedAt("amount") || unresolvedAt("advance") || unresolvedAt("balance"),
        deliveryCell: at("delivery"),
        rows: [rn],
      };
    }
  });
  finish();

  const { resolved: dates, blockOf } = resolveDates(drafts, segMarker, latest);
  const stated = new Map<string, Decimal>();
  for (const [seg, n] of statedBySeg) {
    const month = blockOf.get(seg) ?? null;
    // A stray small number (< 5% of the block's rows) isn't the block's total.
    const blockSum = drafts.reduce((a, d) => (d.segment === seg && d.amount ? a.plus(d.amount) : a), new Decimal(0));
    if (month && n.gte(blockSum.times(0.05))) stated.set(month, (stated.get(month) ?? new Decimal(0)).plus(n));
  }
  const orders: ParsedOrder[] = [];
  const sheetSum = new Map<string, Decimal>(); // what the sheet's own TOTAL formula would add up
  for (const [i, d] of drafts.entries()) {
    const o = buildOrder(sheet.name, d, dates[i]!, blockOf.get(d.segment) ?? dates[i]!.date.slice(0, 7));
    if (d.section === "repeat") {
      // "Old order … pending status": the same order again, written for follow-up.
      const first = orders.find((p) => sameOrder(p, o));
      if (first) {
        const said = [o.sheetRow.status, o.comments].filter(Boolean).join(" · ");
        const note = said ? `Follow-up (${d.ref}): ${said}` : `Listed again as pending at ${d.ref}`;
        first.comments = [first.comments, note].filter(Boolean).join(" · ");
        first.sheetRow.comments = first.comments;
        skipped.push({ ref: d.ref, reason: `repeat of ${first.ref}` });
        continue;
      }
    }
    orders.push(o);
    sheetSum.set(o.month, (sheetSum.get(o.month) ?? new Decimal(0)).plus(o.amount).plus(d.cancelledAmount));
  }

  const computed = sheetSum;
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
  return { orders, reconciliation, skipped };
}

function addMoney(a: Money, b: Money): Money {
  if (a.kind === "number" && b.kind === "number") return { kind: "number", value: a.value.plus(b.value) };
  if (a.kind === "blank") return b;
  if (b.kind === "blank") return a;
  if (a.kind === "nil" && b.kind === "nil") return a;
  if (a.kind === "number" && b.kind === "nil") return a;
  if (a.kind === "nil" && b.kind === "number") return b;
  return a;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function sameOrder(a: ParsedOrder, b: ParsedOrder): boolean {
  const who = (a.phone && b.phone && a.phone === b.phone) || (!!normName(a.customerName) && normName(a.customerName) === normName(b.customerName));
  return !!who && a.amount === b.amount;
}

// ───────── Dates in context ─────────

type Resolved = { date: string; flag: Flag | null; deliveryDate: string | null; dateText: string | null };

function resolveDates(
  drafts: Draft[],
  segMarker: Map<number, string>,
  latest: string | null,
): { resolved: Resolved[]; blockOf: Map<number, string | null> } {
  // The sheet's year = most common year among text dates (ties → the later year).
  const years = new Map<number, number>();
  for (const d of drafts) if (d.dateInfo.kind === "text" && d.dateInfo.parts?.y) years.set(d.dateInfo.parts.y, (years.get(d.dateInfo.parts.y) ?? 0) + 1);
  if (!years.size)
    for (const d of drafts) if (d.dateInfo.kind === "cell") { const y = Number(d.dateInfo.date.slice(0, 4)); years.set(y, (years.get(y) ?? 0) + 1); }
  const latestYear = latest ? Number(latest.slice(0, 4)) : 9999;
  const sheetYear = [...years.entries()].filter(([y]) => y <= latestYear).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0]
    ?? (latest ? latestYear : 2026);

  // Block month per segment: its marker, else the clear majority month of its text dates.
  const blockOf = new Map<number, string | null>();
  const segs = new Set(drafts.map((d) => d.segment));
  for (const s of segs) {
    if (segMarker.has(s)) { blockOf.set(s, segMarker.get(s)!); continue; }
    const votes = new Map<string, number>();
    let n = 0;
    for (const d of drafts) {
      if (d.segment !== s || d.dateInfo.kind !== "text" || !d.dateInfo.parts) continue;
      const p = d.dateInfo.parts;
      const t = iso(p.y ?? sheetYear, p.m, p.d);
      if (!t) continue;
      n++;
      votes.set(t.slice(0, 7), (votes.get(t.slice(0, 7)) ?? 0) + 1);
    }
    const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    blockOf.set(s, top && top[1] / n >= 0.5 ? top[0] : null);
  }

  const okDate = (c: string | null, block: string | null) =>
    !!c && (!latest || c <= latest) && Number(c.slice(0, 4)) === sheetYear && (!block || Math.abs(monthIdx(c) - monthIdx(block)) <= 1);

  const out: (Resolved | null)[] = drafts.map(() => null);
  // Pass 1 — text dates (trusted; typos repaired against the block / previous text date).
  let prevText: string | null = null;
  drafts.forEach((d, i) => {
    if (d.dateInfo.kind !== "text" || !d.dateInfo.parts) return;
    const p = d.dateInfo.parts;
    const block = blockOf.get(d.segment) ?? null;
    const asWritten = iso(p.y ?? sheetYear, p.m, p.d);
    let date: string | null = null;
    let flag: Flag | null = null;
    if (okDate(asWritten, block) && p.y !== null) date = asWritten;
    else {
      const tries = [
        iso(sheetYear, p.m, p.d),
        block ? iso(sheetYear, Number(block.slice(5)), p.d) : null,
        prevText ? iso(sheetYear, Number(prevText.slice(5, 7)), p.d) : null,
      ];
      date = tries.find((t) => okDate(t, block)) ?? null;
      flag = "DATE_GUESSED";
    }
    if (date) {
      out[i] = { date, flag, deliveryDate: null, dateText: d.dateInfo.raw };
      prevText = date;
    }
  });

  // Pass 2 — Excel date cells (pick as-stored or day/month swapped), missing dates.
  let prev: string | null = null;
  drafts.forEach((d, i) => {
    const block = blockOf.get(d.segment) ?? null;
    if (out[i]) { prev = out[i]!.date; return; }
    const nextAnchor = out.slice(i + 1).find((r) => r !== null)?.date ?? null;
    if (d.dateInfo.kind === "cell") {
      let cands = cellCandidates(d.dateInfo.date).flatMap((c) => {
        const y = Number(c.date.slice(0, 4));
        const fixed = y !== sheetYear ? iso(sheetYear, Number(c.date.slice(5, 7)), Number(c.date.slice(8, 10))) : null;
        return fixed ? [c, { ...c, date: fixed, yearFixed: true }] : [c];
      }) as { date: string; swapped: boolean; yearFixed?: boolean }[];
      const notFuture = cands.filter((c) => !latest || c.date <= latest);
      if (notFuture.length) cands = notFuture;
      const dist = (c: string) => {
        const toPrev = prev ? (c >= prev ? dayNum(c) - dayNum(prev) : 2 * (dayNum(prev) - dayNum(c))) : Infinity;
        const toNext = nextAnchor ? Math.abs(dayNum(nextAnchor) - dayNum(c)) : Infinity;
        const near = Math.min(toPrev, toNext);
        return near === Infinity ? 0 : near;
      };
      const score = (c: { date: string; yearFixed?: boolean }) =>
        (block && c.date.slice(0, 7) !== block ? 60 : 0) + (Number(c.date.slice(0, 4)) !== sheetYear ? 400 : 0) + dist(c.date);
      const best = cands.reduce((a, b) => (score(b) < score(a) ? b : a));
      out[i] = {
        date: best.date,
        flag: best.yearFixed ? "DATE_GUESSED" : best.swapped ? "DATE_SWAPPED" : null,
        deliveryDate: null,
        dateText: ddmmyyyy(best.date),
      };
    } else {
      const fallback = prev ?? (block ? `${block}-01` : nextAnchor ?? latest ?? `${sheetYear}-01-01`);
      out[i] = { date: fallback, flag: "DATE_GUESSED", deliveryDate: null, dateText: d.dateInfo.raw || null };
    }
    prev = out[i]!.date;
  });

  // Delivery dates: date cells read the way that falls on/after the order date.
  const resolved = drafts.map((d, i) => {
    const r = out[i]!;
    const v = d.deliveryCell;
    let deliveryDate: string | null = null;
    if (v instanceof Date || typeof v === "number") {
      const raw = readDate(v).date;
      if (raw) {
        const cands = cellCandidates(raw).map((c) => c.date);
        const after = cands.filter((c) => c >= r.date && dayNum(c) - dayNum(r.date) <= 180);
        deliveryDate = (after.length ? after : cands).reduce((a, b) => (Math.abs(dayNum(b) - dayNum(r.date)) < Math.abs(dayNum(a) - dayNum(r.date)) ? b : a));
      }
    } else if (typeof v === "string") {
      const p = textDateParts(text(v));
      const t = p ? iso(p.y ?? sheetYear, p.m, p.d) : null;
      deliveryDate = t;
    }
    return { ...r, deliveryDate };
  });
  // Segments with no orders of their own (a stated total right after a marker) keep their marker.
  for (const [s, m] of segMarker) if (!blockOf.has(s)) blockOf.set(s, m);
  // Blocks with no marker and no clear text-date month: the most common month of their resolved dates.
  for (const [s, m] of blockOf) {
    if (m) continue;
    const votes = new Map<string, number>();
    drafts.forEach((d, i) => { if (d.segment === s) votes.set(resolved[i]!.date.slice(0, 7), (votes.get(resolved[i]!.date.slice(0, 7)) ?? 0) + 1); });
    blockOf.set(s, [...votes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null);
  }
  return { resolved, blockOf };
}

// ───────── One order from its rows ─────────

function buildOrder(sheetName: string, d: Draft, r: Resolved, month: string): ParsedOrder {
  const flags: Flag[] = [];
  if (r.flag) flags.push(r.flag);
  if (d.unresolved) flags.push("FORMULA_UNRESOLVED");
  if (d.amountsAdded) flags.push("AMOUNTS_ADDED");

  // Customer + contact: Viji sometimes writes the phone under CUSTOMER and the name under CONTACT.
  const cust = splitContact(d.cells.customer);
  const cont = splitContact(d.cells.phone);
  let name = isNumberish(cust.rest) ? "" : cust.rest;
  if (!name && cont.rest && !isNumberish(cont.rest) && cust.phones.length > 0) name = cont.rest;
  if (!name && !d.cells.customer && cont.rest && !isNumberish(cont.rest)) name = cont.rest;
  const phones = [...cont.phones, ...cust.phones.filter((p) => !cont.phones.includes(p))];
  if (!name) flags.push("NO_NAME");
  if (!phones.length) flags.push("NO_PHONE");

  const lines = d.lines.filter((l) => l !== "");
  const productTexts = d.lines.map((l) => l).filter(Boolean);
  const allCancelled = lines.length > 0 && d.cancelledLines >= lines.length;
  const cancelCell = [d.cells.status, d.cells.balance, d.cells.amount, d.cells.advance].some((t) => /cancel/i.test(t))
    || [d.cells.comments, ...d.extraRemarks].some((t) => /^cancel+ed$|^cancel$/i.test(t.trim()));
  const cancelled = cancelCell || allCancelled;
  const remarks = [d.cells.comments, ...d.extraRemarks].filter(Boolean);
  if (!cancelled && [...remarks, d.cells.delivery].some((t) => /cancel|cansel/i.test(t))) flags.push("CANCEL_MENTIONED");

  // Money.
  const total = d.amount ?? new Decimal(0);
  const amountMissing = !d.amount;
  if (amountMissing) flags.push("AMOUNT_MISSING");
  const adv = positive(d.adv);
  let paid: Decimal | null;
  let balance: Decimal;
  if (amountMissing) {
    paid = adv; // money received is still recorded; the price is to be filled in
    balance = new Decimal(0);
  } else if (d.bal.kind === "number") {
    balance = Decimal.min(Decimal.max(d.bal.value, 0), total);
    paid = total.minus(balance);
    if (adv && !adv.eq(paid) && !d.amountsAdded) flags.push("ADV_BAL_CONFLICT");
  } else if (adv) {
    // ADV given and BAL is NILL / blank / text → ADV is what was received.
    paid = Decimal.min(adv, total);
    balance = total.minus(paid);
    if (d.bal.kind === "nil" && adv.lt(total)) flags.push("ADV_BAL_CONFLICT");
  } else if (d.bal.kind === "nil") {
    paid = total; // BAL NILL → nothing left to pay
    balance = new Decimal(0);
  } else {
    paid = null; // ADV and BAL both empty: the sheet doesn't say
    balance = total;
    flags.push("PAYMENT_NOT_RECORDED");
  }
  if (!amountMissing && adv && paid && d.bal.kind === "number" && !adv.plus(balance).minus(total).abs().lte(1)) flags.push("BALANCE_MISMATCH");

  // Mallika's early months use the unlabelled column after BAL for the status ("Cancelled").
  const statusWord = /^(cancel+ed|cancel|delivered|deliverd|pending)$/i;
  const statusText = d.cells.status || [d.cells.comments, ...d.extraRemarks].find((t) => statusWord.test(t.trim())) || "";
  let status: ImportStatus;
  let cancelNote: string | null = null;
  if (cancelled) {
    status = "CANCELLED";
    cancelNote = [statusText, d.cells.balance, ...productTexts].find((t) => /cancel/i.test(t)) ?? "Cancelled";
  } else {
    status = mapStatus(statusText, "", balance).status;
  }

  const sheetRow: SheetRow = {
    sheet: sheetName,
    rows: d.rows,
    date: r.dateText || null,
    customer: d.cells.customer || null,
    name: name || null,
    contact: d.cells.phone || null,
    products: productTexts.join(", ") || null,
    total: d.amountText.length > 1 ? d.amountText.join(" + ") : d.cells.amount || d.amountText[0] || null,
    adv: d.advText.filter(Boolean).join(" + ") || null,
    bal: d.balText.filter(Boolean).join(" + ") || null,
    delivery: d.cells.delivery || null,
    status: statusText || null,
    acc: d.cells.route || null,
    comments: remarks.join(" · ") || null,
  };

  return {
    ref: d.ref,
    sheet: sheetName,
    date: r.date,
    month,
    customerName: name,
    phone: phones[0] ?? null,
    altPhone: phones[1] ?? null,
    lines: lines.length ? lines : [],
    amount: total.toString(),
    amountMissing,
    advance: (adv ?? new Decimal(0)).toString(),
    balance: balance.toString(),
    balanceStated: d.bal.kind === "number" || d.bal.kind === "nil",
    paid: paid === null ? null : paid.toString(),
    status,
    cancelNote,
    route: d.cells.route || null,
    deliveryDate: r.deliveryDate,
    comments: sheetRow.comments,
    flags,
    sheetRow,
  };
}

/**
 * §15.1 "Same order on two sheets": phone (or name) + amount + month match
 * across sheets → POSSIBLE_DUPLICATE on the later ones (default: import the first).
 */
export function markDuplicates(orders: ParsedOrder[]): ParsedOrder[] {
  const seen = new Map<string, ParsedOrder>();
  for (const o of orders) {
    const who = o.phone ?? o.customerName.trim().toLowerCase();
    if (!who) continue;
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
export function parseOrderBook(sheets: SheetGrid[], opts: ParseOptions = {}): ParseResult {
  const all = sheets.map((sh) => parseSheet(sh, opts));
  return {
    orders: markDuplicates(all.flatMap((r) => r.orders)),
    reconciliation: all.flatMap((r) => r.reconciliation),
    skipped: all.flatMap((r) => r.skipped ?? []),
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
