// §15.1 parsing rules, one test per problem found in the pilot ORDER_DETAILS.xlsx.
import { describe, it, expect } from "vitest";
import {
  cellValue, evalArithmetic, parseMoney, excelSerialToIso, parseTextDate, readDate, resolveDate,
  detectHeader, mapStatus, parseSheet, parseOrderBook, markDuplicates, matchSheetToUser, matchRoute,
  type SheetGrid, type ParsedOrder,
} from "@/server/domain/import/orderBook";
import Decimal from "decimal.js";

const H = ["DATE", "CUSTOMER DETAILS", "PHONE", "PRODUCT", "AMOUNT", "ADV", "BAL", "STATUS", "PAYMENT"];

describe("cells, money, formulas", () => {
  it("uses cached formula results; evaluates simple arithmetic; flags the rest", () => {
    expect(cellValue({ formula: "=F25-G25", result: 14000 })).toEqual({ value: 14000, unresolved: false });
    expect(cellValue({ formula: "=23500*3" })).toEqual({ value: 70500, unresolved: false });
    expect(cellValue({ formula: "=F25-G25" })).toEqual({ value: null, unresolved: true });
    expect(cellValue({ formula: "=SUM(F1:F9)", result: { error: "#REF" } as never })).toEqual({ value: null, unresolved: true });
    expect(cellValue(undefined)).toEqual({ value: null, unresolved: false });
  });
  it("evalArithmetic handles precedence, parens, unary minus; rejects junk", () => {
    expect(evalArithmetic("=2+3*4")).toBe(14);
    expect(evalArithmetic("=(2+3)*4")).toBe(20);
    expect(evalArithmetic("=-5+10/2")).toBe(0);
    expect(evalArithmetic("=10/0")).toBeNull();
    expect(evalArithmetic("=(2+3")).toBeNull();
    expect(evalArithmetic("=2+")).toBeNull();
    expect(evalArithmetic("=A1+2")).toBeNull();
    expect(evalArithmetic("=")).toBeNull();
    expect(evalArithmetic("=2)")).toBeNull();
  });
  it("NILL / NIL / blank = 0; commas; junk → null", () => {
    expect(parseMoney("NILL")?.toNumber()).toBe(0);
    expect(parseMoney("nil")?.toNumber()).toBe(0);
    expect(parseMoney(null)?.toNumber()).toBe(0);
    expect(parseMoney("")?.toNumber()).toBe(0);
    expect(parseMoney("₹ 23,500")?.toNumber()).toBe(23500);
    expect(parseMoney("23,500/-")?.toNumber()).toBe(23500);
    expect(parseMoney(1500)?.toNumber()).toBe(1500);
    expect(parseMoney("see notes")).toBeNull();
    expect(parseMoney(true)).toBeNull();
  });
});

describe("dates (§15.1)", () => {
  it("text dates are day-first in every observed format", () => {
    expect(parseTextDate("07.01.2026")).toBe("2026-01-07");
    expect(parseTextDate("13/01/26")).toBe("2026-01-13");
    expect(parseTextDate("03.01.26")).toBe("2026-01-03");
    expect(parseTextDate("7-1-2026")).toBe("2026-01-07");
    expect(parseTextDate("31.02.26")).toBeNull(); // typo
    expect(parseTextDate("Jan 7")).toBeNull();
  });
  it("Excel serials and Date cells", () => {
    expect(excelSerialToIso(46029)).toBe("2026-01-07");
    expect(excelSerialToIso(12)).toBeNull();
    expect(readDate(46029)).toEqual({ date: "2026-01-07", fromDateCell: true });
    expect(readDate(new Date("2026-01-07T00:00:00Z"))).toEqual({ date: "2026-01-07", fromDateCell: true });
    expect(readDate("07.01.2026")).toEqual({ date: "2026-01-07", fromDateCell: false });
    expect(readDate(null)).toEqual({ date: null, fromDateCell: false });
  });
  it("swaps day/month on Excel date cells that disagree with the block month", () => {
    // Block is January; the cell reads 1 July but was typed 07.01 → 7 January.
    expect(resolveDate({ date: "2026-07-01", fromDateCell: true }, "2026-01")).toEqual({ date: "2026-01-07", flag: "DATE_SWAPPED" });
    expect(resolveDate({ date: "2026-01-15", fromDateCell: true }, "2026-01")).toEqual({ date: "2026-01-15", flag: null });
    expect(resolveDate({ date: "2026-07-15", fromDateCell: true }, "2026-01")).toEqual({ date: "2026-07-15", flag: null }); // day ≠ block month: keep
    expect(resolveDate({ date: "2026-07-01", fromDateCell: false }, "2026-01")).toEqual({ date: "2026-07-01", flag: null }); // text: trust day-first
  });
  it("still invalid → block month, day 1, DATE_GUESSED", () => {
    expect(resolveDate({ date: null, fromDateCell: false }, "2026-02")).toEqual({ date: "2026-02-01", flag: "DATE_GUESSED" });
    expect(resolveDate({ date: null, fromDateCell: false }, null)).toEqual({ date: null, flag: "DATE_GUESSED" });
  });
});

describe("headers + status", () => {
  it("maps columns by header text, not position (Mallika's sheet is offset by one)", () => {
    expect(detectHeader(H)).toMatchObject({ date: 0, customer: 1, phone: 2, product: 3, amount: 4, advance: 5, balance: 6, status: 7, route: 8 });
    expect(detectHeader([null, ...H])).toMatchObject({ date: 1, customer: 2, amount: 5 });
    expect(detectHeader(["Gokul", "9843722055", 24000])).toBeNull();
    expect(detectHeader(["CUSTOMER", "AMOUNT", "STATUS"])).toBeNull(); // needs a DATE column
  });
  it("status text mapping (§15.1)", () => {
    const z = new Decimal(0);
    expect(mapStatus("DELIVERD", "", new Decimal(5))).toEqual({ status: "DELIVERED", cancelNote: null });
    expect(mapStatus("Delivered", "", z).status).toBe("DELIVERED");
    expect(mapStatus("PENDING", "", z).status).toBe("CONFIRMED");
    expect(mapStatus("PARTIAL DELIVERY", "", z).status).toBe("PARTIALLY_DISPATCHED");
    expect(mapStatus("Cancelled", "", z)).toEqual({ status: "CANCELLED", cancelNote: "Cancelled" });
    expect(mapStatus("", "customer said cancel the order", z)).toEqual({ status: "CANCELLED", cancelNote: "customer said cancel the order" });
    expect(mapStatus("", "", z).status).toBe("CLOSED"); // no status + no balance
    expect(mapStatus("", "", new Decimal(100)).status).toBe("DELIVERED");
    expect(mapStatus("HOLD", "", z).status).toBe("CONFIRMED");
  });
});

// A synthetic "VIJI" sheet reproducing every §15.1 problem.
const viji: SheetGrid = {
  name: "VIJI",
  rows: [
    [new Date("2026-01-01T00:00:00Z")], // month marker
    H,
    ["07.01.2026", "Gokul Caterers", "9843722055", "15kg Potato Peeler", 24000, 10000, 14000, "PENDING", "KUMARESH GPAY"],
    ["13/01/26", "9876543210", null, "6\" IRG", { formula: "=23500*3" }, "NILL", { formula: "=E5-F5", result: 70500 }, "DELIVERD", "CASH"], // phone in name col
    ["03.01.26", "Swaada Foods", "9840011122", "Wet grinder 10L", null, 20000, null, "PARTIAL DELIVERY", "KFM CA"],
    [null, null, null, "Vada machine ×2", 150000, null, 130000, null, null], // continuation; amount on last row
    [new Date("2026-07-01T00:00:00Z"), "Mathews", "9840011133", "Kneader", 30000, 30000, 0, "", "NAREN"], // swapped Excel date
    ["31.02.26", "Typo Date Co", "9840011144", "Stove", 5000, 0, 5000, "cancelled - price", null], // bad date + cancel
    ["", "", "", "", "TOTAL", 279000, null], // stated total row
    [], // blank
    [new Date("2026-02-01T00:00:00Z")],
    H,
    ["05.02.26", "Nallamuthu", "9840099999", "Pulverizer", 170000, 50000, 120000, "PENDING", "KI CA"],
    [null, null, null, null, 170000], // lone number = stated total
  ],
};
const mallika: SheetGrid = {
  name: "MALLIKA",
  rows: [
    [new Date("2026-02-01T00:00:00Z")],
    [null, ...H], // offset by one column
    [null, "06.02.26", "Nallamuthu", "9840099999", "Pulverizer", 170000, 50000, 120000, "PENDING", "KI CA"], // same order on two sheets
    [null, "08.02.26", "Rew", "9840055555", "Stove", { formula: "=Z9*2" }, 0, null, "", "CASH"], // unresolved formula
  ],
};

describe("parseSheet — the VIJI sheet", () => {
  const r = parseSheet(viji);
  const by = (ref: string) => r.orders.find((o) => o.ref === ref)!;

  it("ignores month markers, headers, TOTAL and blank rows", () => {
    expect(r.orders.map((o) => o.ref)).toEqual(["VIJI!R3", "VIJI!R4", "VIJI!R5", "VIJI!R7", "VIJI!R8", "VIJI!R13"]);
  });
  it("normal row with text date + route", () => {
    expect(by("VIJI!R3")).toMatchObject({
      date: "2026-01-07", customerName: "Gokul Caterers", phone: "9843722055", lines: ["15kg Potato Peeler"],
      amount: "24000", advance: "10000", balance: "14000", status: "CONFIRMED", route: "KUMARESH GPAY", flags: [],
    });
  });
  it("phone in the customer column → no name (left empty), NO_NAME; formula + NILL", () => {
    // ADV NILL + BAL 70500 (a formula with a cached result) → nothing paid yet.
    expect(by("VIJI!R4")).toMatchObject({ customerName: "", phone: "9876543210", amount: "70500", advance: "0", balance: "70500", paid: "0", status: "DELIVERED" });
    expect(by("VIJI!R4").flags).toContain("NO_NAME");
  });
  it("multi-row order: continuation appends the line and carries the amount from the last row", () => {
    expect(by("VIJI!R5")).toMatchObject({ lines: ["Wet grinder 10L", "Vada machine ×2"], amount: "150000", advance: "20000", balance: "130000", status: "PARTIALLY_DISPATCHED" });
  });
  it("Excel date swapped back into the January block", () => {
    expect(by("VIJI!R7")).toMatchObject({ date: "2026-01-07", status: "CLOSED" });
    expect(by("VIJI!R7").flags).toContain("DATE_SWAPPED");
  });
  it("typo date 31.02 → the block's month (31 Jan) + DATE_GUESSED; STATUS 'cancelled' → CANCELLED with note", () => {
    expect(by("VIJI!R8")).toMatchObject({ date: "2026-01-31", status: "CANCELLED", cancelNote: "cancelled - price" });
    expect(by("VIJI!R8").flags).toContain("DATE_GUESSED");
  });
  it("reconciliation: computed vs stated TOTAL per month", () => {
    expect(r.reconciliation).toEqual([
      { sheet: "VIJI", month: "2026-01", computed: "279500", stated: "279000", diffPct: 0.2 },
      { sheet: "VIJI", month: "2026-02", computed: "170000", stated: "170000", diffPct: 0 },
    ]);
  });
});

describe("parseOrderBook — across sheets", () => {
  const r = parseOrderBook([viji, mallika]);
  it("offset sheet parses by header text", () => {
    const m = r.orders.filter((o) => o.sheet === "MALLIKA");
    expect(m[0]).toMatchObject({ date: "2026-02-06", customerName: "Nallamuthu", amount: "170000" });
  });
  it("Nallamuthu ₹1,70,000 on two sheets → POSSIBLE_DUPLICATE on the second", () => {
    const dup = r.orders.find((o) => o.ref === "MALLIKA!R3")!;
    expect(dup.flags).toContain("POSSIBLE_DUPLICATE");
    expect(dup.duplicateOf).toBe("VIJI!R13");
    expect(r.orders.find((o) => o.ref === "VIJI!R13")!.flags).not.toContain("POSSIBLE_DUPLICATE");
  });
  it("unresolved formula → FORMULA_UNRESOLVED + AMOUNT_MISSING", () => {
    expect(r.orders.find((o) => o.ref === "MALLIKA!R4")!.flags).toEqual(expect.arrayContaining(["FORMULA_UNRESOLVED", "AMOUNT_MISSING"]));
  });
  it("same-sheet repeats are not duplicates; name is used when no phone", () => {
    const base = { sheet: "A", month: "2026-01", amount: "100", phone: null, flags: [] } as unknown as ParsedOrder;
    const out = markDuplicates([
      { ...base, flags: [], ref: "A!R1", customerName: "Rew" },
      { ...base, flags: [], ref: "A!R2", customerName: "Rew" },
      { ...base, flags: [], ref: "B!R1", sheet: "B", customerName: " rew " },
    ]);
    expect(out.map((o) => o.flags.includes("POSSIBLE_DUPLICATE"))).toEqual([false, false, true]);
  });
});

describe("edge rows", () => {
  it("rows before any header are ignored; no-phone rows flag NO_PHONE; balance mismatch flagged", () => {
    const r = parseSheet({
      name: "X",
      rows: [
        ["stray", "text", "before", "header"],
        H,
        ["01.03.26", "", "", "Item", 1000, 200, 500, "PENDING", null],
        [7, null, null, null, null], // lone number outside a block: ignored
      ],
    });
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0]!.flags).toEqual(expect.arrayContaining(["NO_NAME", "NO_PHONE", "BALANCE_MISMATCH"]));
    expect(r.orders[0]!.customerName).toBe("");
    expect(r.reconciliation).toEqual([{ sheet: "X", month: "2026-03", computed: "1000", stated: null, diffPct: null }]);
  });
  it("continuation with no open order is dropped", () => {
    const r = parseSheet({ name: "Y", rows: [H, [null, null, null, "orphan product", 100]] });
    expect(r.orders).toHaveLength(0);
  });
});

describe("mapping helpers", () => {
  const users = [{ id: "1", name: "Viji" }, { id: "2", name: "Naren" }];
  it("sheet → salesperson by name", () => {
    expect(matchSheetToUser("VIJI", users)?.id).toBe("1");
    expect(matchSheetToUser("NAREN 2025", users)?.id).toBe("2");
    expect(matchSheetToUser("TURBO ORDER", users)).toBeNull();
  });
  it("route keyword → target, longest keyword wins", () => {
    const map = [{ keyword: "GPAY", target: "upi" }, { keyword: "KUMARESH GPAY", target: "kumaresh" }, { keyword: "CASH", target: "cash" }];
    expect(matchRoute("kumaresh gpay", map)).toBe("kumaresh");
    expect(matchRoute("GPAY", map)).toBe("upi");
    expect(matchRoute("cheque", map)).toBeNull();
    expect(matchRoute(null, map)).toBeNull();
  });
});

describe("block month from the majority of text dates (no month marker)", () => {
  it("swaps an Excel date by the majority month of the block", () => {
    const r = parseSheet({
      name: "Z",
      rows: [
        H,
        ["05.01.26", "A", "9840000101", "x", 100, 0, 100, "PENDING", null],
        ["02.02.26", "B", "9840000102", "x", 100, 0, 100, "PENDING", null],
        ["09.01.26", "C", "9840000103", "x", 100, 0, 100, "PENDING", null],
        [new Date("2026-08-01T00:00:00Z"), "D", "9840000104", "x", 100, 0, 100, "PENDING", null], // typed 08.01 → 8 Jan
      ],
    });
    expect(r.orders.map((o) => o.date)).toEqual(["2026-01-05", "2026-02-02", "2026-01-09", "2026-01-08"]);
    expect(r.orders[3]!.flags).toContain("DATE_SWAPPED");
  });
});

describe("real ORDER DETAILS.xlsx layouts (2026-10-13 import)", () => {
  const D = (s: string) => new Date(`${s}T00:00:00Z`);
  it("treats a row of the same date repeated across columns as a month marker, not an order", () => {
    const r = parseSheet({
      name: "NAREN",
      rows: [
        H,
        ["07.01.2026", "A", "9840000101", "x", 100, "NILL", "NILL", "DELIVERD", null],
        Array(9).fill(D("2026-02-01")),
        H,
        ["03.02.2026", "B", "9840000102", "y", 200, "NILL", "NILL", "DELIVERD", null],
      ],
    });
    expect(r.orders).toHaveLength(2);
    expect(r.orders.map((o) => o.customerName)).toEqual(["A", "B"]);
    expect(r.orders[1]!.month).toBe("2026-02");
  });

  it("resolves swapped Excel dates by date order when there is no month marker (Viji)", () => {
    // Typed dd/mm: day ≤ 12 became an Excel date with day/month swapped; day > 12 stayed text.
    const r = parseSheet({
      name: "VIJI",
      rows: [
        [null, null, null, D("2026-01-01")],
        H,
        [D("2026-02-01"), "A", "9840000101", "x", 100, null, null, null, null], // 02/01 → 2 Jan
        [D("2026-12-01"), "B", "9840000102", "x", 100, null, null, null, null], // 01/12? no: 12/01 → 12 Jan
        ["14/01/26", "C", "9840000103", "x", 100, null, null, null, null],
        [D("2026-02-02"), "D", "9840000104", "x", 100, null, null, null, null], // 02/02 → 2 Feb
        [D("2026-03-02"), "E", "9840000105", "x", 100, null, null, null, null], // 03/02 → 3 Feb
        ["13/02/26", "F", "9840000106", "x", 100, null, null, null, null],
        [D("2026-02-03"), "G", "9840000107", "x", 100, null, null, null, null], // 02/03 → 2 Mar
      ],
    });
    expect(r.orders.map((o) => o.date)).toEqual([
      "2026-01-02", "2026-01-12", "2026-01-14", "2026-02-02", "2026-02-03", "2026-02-13", "2026-03-02",
    ]);
  });

  it("keeps genuine Excel dates when they already follow on (Dhanushya)", () => {
    const r = parseSheet({
      name: "DHANUSHYA",
      rows: [
        H,
        [D("2026-04-04"), "A", "9840000101", "x", 100, "NILL", "NILL", "DELIVERED", null],
        [D("2026-04-15"), "B", "9840000102", "x", 100, "NILL", "NILL", "DELIVERED", null],
        [D("2026-05-04"), "C", "9840000103", "x", 100, "NILL", "NILL", "DELIVERED", null],
      ],
    });
    expect(r.orders.map((o) => o.date)).toEqual(["2026-04-04", "2026-04-15", "2026-05-04"]);
  });

  it("fixes a one-year typo in a text date that sits among this year's orders", () => {
    const r = parseSheet({
      name: "VIJI",
      rows: [
        H,
        ["12/01/26", "A", "9840000101", "x", 100, null, null, null, null],
        ["13/01/25", "B", "9840000102", "x", 100, null, null, null, null],
      ],
    });
    expect(r.orders[1]!.date).toBe("2026-01-13");
    expect(r.orders[1]!.flags).toContain("DATE_GUESSED");
  });

  it("fixes month/year typos and slightly out-of-order rows using the neighbouring dates", () => {
    const r = parseSheet({
      name: "VIJI",
      rows: [
        H,
        ["13/02/26", "A", "9840000101", "x", 100, null, null, null, null],
        ["16/12/25", "B", "9840000102", "x", 100, null, null, null, null], // 12 typed for 02, 25 for 26 → 16 Feb 2026
        ["15/06/26", "C", "9840000103", "x", 100, null, null, null, null],
        [D("2026-11-06"), "D", "9840000104", "x", 100, null, null, null, null], // 11/06 → 11 June (just before 15 June)
        [D("2026-04-03"), "E", "9840000105", "x", 100, null, null, null, null], // 04/03 → 4 Mar? no: after June → keep… see below
      ],
    }, { latest: "2026-10-13" });
    expect(r.orders.slice(0, 4).map((o) => o.date)).toEqual(["2026-02-13", "2026-02-16", "2026-06-15", "2026-06-11"]);
    expect(r.orders[1]!.flags).toContain("DATE_GUESSED");
    expect(r.orders.every((o) => o.date <= "2026-10-13")).toBe(true);
  });

  it("repairs an Excel date with a wrong year next to this year's rows", () => {
    const r = parseSheet({
      name: "VIJI",
      rows: [
        H,
        ["02/03/26", "Z", "9840000100", "x", 100, null, null, null, null], // context: 2 Mar 2026
        [D("2026-04-03"), "A", "9840000101", "x", 100, null, null, null, null], // → 4 Mar 2026
        [D("2025-05-03"), "B", "9840000102", "x", 100, null, null, null, null], // year typo + swap → 5 Mar 2026
      ],
    }, { latest: "2026-10-13" });
    expect(r.orders.map((o) => o.date)).toEqual(["2026-03-02", "2026-03-04", "2026-03-05"]);
  });

  it("gives a row with no date the previous order's date", () => {
    const r = parseSheet({
      name: "VIJI",
      rows: [
        H,
        ["12/01/26", "A", "9840000101", "x", 100, null, null, null, null],
        [null, null, "9840000102", "y", 200, null, null, null, null],
      ],
    });
    expect(r.orders[1]!.date).toBe("2026-01-12");
    expect(r.orders[1]!.flags).toContain("DATE_GUESSED");
  });
});

