// Business rules for importing ORDER DETAILS.xlsx (agreed with the client 2026-10-13),
// plus one test per problem found in the real workbook (sheet!row in the test name).
import { describe, it, expect } from "vitest";
import { planOrder, paymentMethodFor, fixSpec } from "@/server/services/orderDetailsImport";
import { parseSheet, splitContact, type ParsedOrder, type SheetGrid } from "@/server/domain/import/orderBook";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
// Headers exactly as in the client's sheets.
const H = ["DATE", "CUSTOMER DETAILS", "CONTACT", "PRODUCTS", "TOTAL", "ADV", "BAL", "DELIVERY DATE", "STATUS", "ACC DETAILS", "COMMENTS"];
const parse = (rows: SheetGrid["rows"], name = "T") => parseSheet({ name, rows }, { latest: "2026-10-13" });
const one = (row: SheetGrid["rows"][number]) => parse([H, row]).orders[0]!;

describe("columns are read by header text", () => {
  it("STATUS is the STATUS column, not DELIVERY DATE; ACC DETAILS and COMMENTS are kept (Naren/Dhanushya)", () => {
    const o = one(["01.08.2026", "VEL AMUDHU", 8300832796, "BATCH CODE PRINTER", 20000, 10000, 10000, D("2026-08-03"), "PENDING ", "NAREN SIR", "call first"]);
    expect(o).toMatchObject({ status: "CONFIRMED", route: "NAREN SIR", deliveryDate: "2026-08-03", comments: "call first" });
    expect(o.sheetRow).toMatchObject({ status: "PENDING", acc: "NAREN SIR", delivery: "03/08/2026", adv: "10000", bal: "10000" });
  });
  it("Vignesh's 'DATE.' / 'DVL.TIME' headers", () => {
    const r = parse([["DATE.", "CUSTOMER DETAILS", "CONTACT", "PRODUCTS", "TOTAL", "ADV", "BAL", "DVL.TIME", "STATUS", "ACC DETAILS"],
      ["03.04.26", "THIRUMALAIKUMAR", 9629651763, "10KG TURBO STOVE", 25400, "NILL", "NILL", "13.04.26", "DELIVERD", "CASH"]]);
    expect(r.orders[0]).toMatchObject({ date: "2026-04-03", status: "DELIVERED", route: "CASH", deliveryDate: "2026-04-13" });
  });
});

describe("money: TOTAL / ADV / BAL exactly as written", () => {
  it("BAL NILL → fully paid", () => {
    expect(one(["07.01.2026", "KONGU", 9843722055, "x", 17000, "NILL", "NILL", null, "DELIVERD", "NAREN"])).toMatchObject({ paid: "17000", balance: "0" });
  });
  it("BAL number → paid = total − balance", () => {
    expect(one(["08.07.26", "HIPA", 7058053055, "x", 270000, 100000, 170000, null, null, "KFM CA"])).toMatchObject({ paid: "100000", balance: "170000" });
  });
  it("ADV given, BAL empty → ADV is what was paid (Viji R161)", () => {
    expect(one(["25/03/26", null, 9994664536, "5KG 2NO", 35400, 10000, null])).toMatchObject({ paid: "10000", balance: "25400" });
  });
  it("ADV given, BAL NILL but less than total → ADV paid, flagged (Vignesh R73 SHIV)", () => {
    const o = one(["01.04.2026", "SHIV", 8951543421, "CANDY FLOSS", 359900, 150000, "NILL", "30-45DAYS", null, "KFM CA"]);
    expect(o).toMatchObject({ paid: "150000", balance: "209900" });
    expect(o.flags).toContain("ADV_BAL_CONFLICT");
  });
  it("ADV and BAL both empty → payment not recorded (Viji)", () => {
    const o = one(["14/03/26", 9562229999, null, "TURBO STOVE", 31000, null, null, null, null, "NAREN"]);
    expect(o.paid).toBeNull();
    expect(o.flags).toContain("PAYMENT_NOT_RECORDED");
  });
  it("BAL formulas (=F5-G5, =H5) are worked out from the sheet (Mallika May)", () => {
    const r = parse([
      [null, "DATE", "CUSTOMER DETAILS", "CONTACT", "PRODUCTS", "TOTAL", "ADV", "BAL"],
      [null, "04.05.26", "Spambaivasan", 9447876673, "10kg stove", 20400, 20400, { formula: "=F2-G2" }],
      [null, "04.05.26", "Johny", 7025481023, "5kg-4nos", 43600, 43600, { formula: "=H2" }],
    ]);
    expect(r.orders.map((o) => [o.paid, o.balance])).toEqual([["20400", "0"], ["43600", "0"]]);
    expect(r.orders.every((o) => !o.flags.includes("FORMULA_UNRESOLVED"))).toBe(true);
  });
  it("no amount → left empty (amountMissing), money received still recorded (Mallika R81)", () => {
    const o = one(["25.02.26", "Nasreem", 6382672880, "25kg atta kneader", 0, 33700, "Nil"]);
    expect(o).toMatchObject({ amountMissing: true, amount: "0", paid: "33700", balance: "0" });
  });
});

describe("multi-row orders", () => {
  const M = [null, "DATE", "CUSTOMER DETAILS", "CONTACT", "PRODUCTS", "TOTAL", "ADV", "BAL"];
  it("amount on the last row is the total (Mallika R43–46)", () => {
    const r = parse([M, [null, "04.02.26", "Ram Sankar", 7601010066, "15kg atta kneader"], [null, null, null, null, "Dosa Kal"], [null, null, null, null, "Kadappa Stand", 80000, null, "Nil"]]);
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0]).toMatchObject({ amount: "80000", paid: "80000", lines: ["15kg atta kneader", "Dosa Kal", "Kadappa Stand"] });
  });
  it("separately priced lines are added up (Mallika R230–231 Fsako)", () => {
    const r = parse([M, [null, "09.05.26", "Fsako", 9090474488, "3 birds mc-15nos", 160500, 160500, 0], [null, null, null, null, "5 birds mc-5nos", 56000, 56000, 0]]);
    expect(r.orders[0]).toMatchObject({ amount: "216500", paid: "216500", balance: "0" });
    expect(r.orders[0]!.flags).toContain("AMOUNTS_ADDED");
  });
  it("the same total written again is not added twice (Mallika R129–130)", () => {
    const r = parse([M, [null, "21.03.26", "Abdul", 9772531155, "5kg", 40000], [null, null, null, null, "10 kg each 1 no", 40000]]);
    expect(r.orders[0]!.amount).toBe("40000");
  });
  it("a cancelled line's amount is not added (Mallika R161–162 Girish)", () => {
    const r = parse([M, [null, "20.03.26", "Girish Blr", 9611720086, "5KG-1", 11900], [null, null, null, null, "10kg (cancelled)", 21000, null, "Cancelled"]]);
    expect(r.orders[0]).toMatchObject({ amount: "11900", status: "DELIVERED" });
    expect(r.orders[0]!.lines).toEqual(["5KG-1", "10kg (cancelled)"]);
  });
  it("a priced row with its own payment account is a separate sale (Viji R388–389)", () => {
    const r = parse([H, ["06/08/26", 7736123105, null, "MEAT MINCER", 16000, null, null, null, null, "CASH"], [0, "  ", null, "10KG POTATO PEELER", 18000, null, null, null, null, "NAREN"]]);
    expect(r.orders.map((o) => [o.amount, o.route, o.date])).toEqual([["16000", "CASH", "2026-08-06"], ["18000", "NAREN", "2026-08-06"]]);
  });
});

describe("rows that are not orders", () => {
  it("summary table (Mallika 'Calender 26') is skipped; 'Service' rows after it are orders", () => {
    const r = parse([
      [null, "DATE", "CUSTOMER DETAILS", "CONTACT", "PRODUCTS", "TOTAL", "ADV", "BAL"],
      [null, "12.10.26", "Bipin", 9497358010, "5 birds", 17000, 5000, 12000],
      ["Calender 26", "New Clients", "Old Clients-follow up", "Total Turnover"],
      ["Jan", 1193576, 285500, 1479076],
      ["Oct", null, 2500],
      [null, "Service"],
      [null, "05.08.26", "Vijayan", 9946174743, "Idiyappam mc service", 1500, 1500, 0],
    ], "MALLIKA");
    expect(r.orders.map((o) => [o.customerName, o.date])).toEqual([["Bipin", "2026-10-12"], ["Vijayan", "2026-08-05"]]);
    expect(r.skipped!.map((s) => s.reason)).toEqual(["summary table", "summary table", "summary table"]);
  });
  it("'Old order Payment pending status' rows repeat earlier orders → not imported again (Mallika R434)", () => {
    const r = parse([
      [null, "DATE", "CUSTOMER DETAILS", "CONTACT", "PRODUCTS", "TOTAL", "ADV", "BAL", "Delivery date", "status"],
      [null, "23.01.26", "Mani Idly shop", 9842244495, "irg kalsi", 165000, 50000, 115000],
      [null, "Old order Payment pending status"],
      [null, "23.01.26", "Mani Idly shop", 9842244495, "irg kalsi", 165000, 50000, 115000, null, "Whatsapp reminder sent"],
    ], "MALLIKA");
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0]!.comments).toContain("Whatsapp reminder sent");
    expect(r.skipped).toEqual([{ ref: "MALLIKA!R4", reason: "repeat of MALLIKA!R2" }]);
  });
  it("a month-marker row of mixed dates is a marker, not an order (Dhanushya R87)", () => {
    const r = parse([H, [...Array(10).fill(D("2026-10-01")), ...Array(10).fill(D("2026-09-01"))], ["2026-10-01", "VENKATESAN", 7010400986, "6 INCH IRG", 36800, "NILL", "NILL"]]);
    expect(r.orders.map((o) => o.customerName)).toEqual(["VENKATESAN"]);
  });
  it("month names written as markers ('MAY .2026') fix typo dates in that block (Vignesh R87)", () => {
    const r = parse([[null, null, null, "MAY .2026"], H, ["09.02.2026", "PONKAVIYARASU", 9360197467, "IRG", 32000, "NILL", "NILL"]]);
    expect(r.orders[0]!.date).toBe("2026-05-09");
  });
});

describe("names and contacts as typed", () => {
  it("first valid mobile + the next one; leftover text is the name", () => {
    expect(splitContact("9965736331 / 8122774418")).toEqual({ phones: ["9965736331", "8122774418"], rest: "" });
    expect(splitContact("mohan/9600722488")).toEqual({ phones: ["9600722488"], rest: "mohan" });
    expect(splitContact(" 98429 92802")).toEqual({ phones: ["9842992802"], rest: "" });
    expect(splitContact("00966 59 767 0900").phones).toEqual([]);
  });
  it("phone under CUSTOMER and name under CONTACT (Viji R57 BENNY)", () => {
    expect(one(["11/02/26", 9562229999, "BENNY", "10BIRDS", 37000])).toMatchObject({ customerName: "BENNY", phone: "9562229999" });
  });
  it("no name, no phone → left empty, flagged", () => {
    const o = one(["16/09/26", null, null, "gearbox spare", 2800]);
    expect(o).toMatchObject({ customerName: "", phone: null });
    expect(o.flags).toEqual(expect.arrayContaining(["NO_NAME", "NO_PHONE"]));
  });
});

describe("dates", () => {
  it("an Excel date is read day/month-swapped to match the block (Snegha R3 → 9 April)", () => {
    const r = parse([H, [D("2026-09-04"), "Saastha", 8248406949, "Turbo stove", 34500, "NILL", "NIL"], ["22/04/26", "Mathiaerasan", 9444183121, "Turbo", 16000, "NILL", "NIL"]]);
    expect(r.orders.map((o) => o.date)).toEqual(["2026-04-09", "2026-04-22"]);
  });
  it("valid text dates after a section label are trusted (Mallika service rows)", () => {
    const r = parse([[null, "DATE", "CUSTOMER DETAILS", "CONTACT", "PRODUCTS", "TOTAL", "ADV", "BAL"],
      [null, "08.10.26", "Victor", 9751942324, "Oil seal", 2500, 2500, 0], [null, "Service"],
      [null, "05.08.26", "Vijayan", 9946174743, "service", 1500, 1500, 0], [null, "15.07.26", "Raja", 8072162108, "spares", 10000, 10000, 0]]);
    expect(r.orders.map((o) => o.date)).toEqual(["2026-10-08", "2026-08-05", "2026-07-15"]);
  });
});

describe("planning: what the app stores", () => {
  const base = (o: Partial<ParsedOrder>): ParsedOrder => ({
    ...one(["07.01.2026", "Kongu Kochai", 9843722055, "5 bird defeathering", 17000, "NILL", "NILL", null, "DELIVERD", "NAREN"]),
    ...o,
  });
  it("delivered + nothing left to pay → Completed", () => {
    expect(planOrder(base({}))).toMatchObject({ total: "17000.00", paid: "17000.00", balance: "0.00", status: "COMPLETED", paymentRecorded: true });
  });
  it("balance left → Pending", () => {
    expect(planOrder(base({ paid: "10000", balance: "7000" }))).toMatchObject({ paid: "10000.00", balance: "7000.00", status: "PENDING" });
  });
  it("status PENDING in the sheet stays Pending even when paid (Snegha R88)", () => {
    expect(planOrder(base({ status: "CONFIRMED" })).status).toBe("PENDING");
  });
  it("payment not recorded: unpaid by default; paid when ACC DETAILS names an account (option)", () => {
    const o = base({ paid: null, balance: "17000", flags: ["PAYMENT_NOT_RECORDED"] });
    expect(planOrder(o)).toMatchObject({ paid: "0.00", balance: "17000.00", status: "PENDING", paymentRecorded: false });
    expect(planOrder(o, { unrecordedPayment: "PAID_IF_ACCOUNT" })).toMatchObject({ paid: "17000.00", balance: "0.00", status: "COMPLETED" });
    expect(planOrder({ ...o, route: null }, { unrecordedPayment: "PAID_IF_ACCOUNT" }).paid).toBe("0.00");
  });
  it("client rule: payment not recorded but STATUS says delivered/completed → paid", () => {
    const o = base({ paid: null, balance: "17000", flags: ["PAYMENT_NOT_RECORDED"] });
    expect(planOrder(o, { unrecordedPayment: "PAID_IF_DELIVERED" })).toMatchObject({ paid: "17000.00", status: "COMPLETED" });
    const blank = { ...o, sheetRow: { ...o.sheetRow, status: null } };
    expect(planOrder(blank, { unrecordedPayment: "PAID_IF_DELIVERED" })).toMatchObject({ paid: "0.00", status: "PENDING" });
  });
  it("no amount → total empty (0, totalMissing), Pending; advance still recorded", () => {
    expect(planOrder(base({ amount: "0", amountMissing: true, paid: "33700", balance: "0" }))).toMatchObject({
      total: "0.00", totalMissing: true, paid: "33700.00", balance: "0.00", status: "PENDING",
    });
  });
  it("cancelled stays cancelled with its reason", () => {
    expect(planOrder(base({ status: "CANCELLED", cancelNote: "Cancelled" }))).toMatchObject({ status: "CANCELLED", cancelNote: "Cancelled" });
  });
  it("keeps empty name / product empty (no placeholders) and the sheet row", () => {
    const p = planOrder(base({ customerName: "", lines: [] }));
    expect(p).toMatchObject({ customerName: "", productText: "" });
    expect(p.sheetRow.sheet).toBe("T");
  });
  it("bills KFM when ACC DETAILS says KFM", () => {
    expect(planOrder(base({ route: "KFM ACC" })).entityCode).toBe("KFM");
    expect(planOrder(base({ route: "KUMAR GPAY" })).entityCode).toBe("KI");
  });
});

describe("helpers", () => {
  it("maps the payment route text to a method", () => {
    expect(paymentMethodFor("CASH")).toBe("CASH");
    expect(paymentMethodFor("KUMAR G.PAY")).toBe("UPI");
    expect(paymentMethodFor("kumaresh - gpay")).toBe("UPI");
    expect(paymentMethodFor("KFM ACC")).toBe("BANK_TRANSFER");
    expect(paymentMethodFor("KI CAC")).toBe("BANK_TRANSFER");
    expect(paymentMethodFor("CHEQUE 12345")).toBe("CHEQUE");
    expect(paymentMethodFor(null)).toBe("UPI");
  });
  it("turns an Excel-mangled HP fraction back into text", () => {
    expect(fixSpec("2026-01-04T00:00:00.000Z")).toBe("1/4 HP");
    expect(fixSpec("1/2 HP")).toBe("1/2 HP");
    expect(fixSpec(null)).toBeNull();
  });
});
