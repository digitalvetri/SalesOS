// Business rules for importing ORDER DETAILS.xlsx (agreed with the client 2026-10-13).
import { describe, it, expect } from "vitest";
import { planOrder, paymentMethodFor, fixSpec } from "@/server/services/orderDetailsImport";
import type { ParsedOrder } from "@/server/domain/import/orderBook";

const base = (o: Partial<ParsedOrder>): ParsedOrder => ({
  ref: "NAREN!R3", sheet: "NAREN", date: "2026-01-07", month: "2026-01",
  customerName: "Kongu Kochai", phone: "9843722055", lines: ["5 bird defeathering"],
  amount: "17000", advance: "0", balance: "0", balanceStated: true,
  status: "CLOSED", cancelNote: null, route: "NAREN", flags: [], ...o,
});
const plan = (o: Partial<ParsedOrder>) => planOrder(base(o), { placeholderTotal: "1" });

describe("ORDER DETAILS import rules", () => {
  it("BAL NILL → fully paid and Completed when delivered", () => {
    const p = plan({ balance: "0", balanceStated: true, status: "DELIVERED" });
    expect(p).toMatchObject({ total: "17000.00", paid: "17000.00", balance: "0.00", status: "COMPLETED" });
  });

  it("BAL number → paid = total − balance", () => {
    const p = plan({ amount: "60000", balance: "20000", balanceStated: true, status: "CONFIRMED" });
    expect(p).toMatchObject({ paid: "40000.00", balance: "20000.00", status: "PENDING" });
  });

  it("BAL blank → fully unpaid and Pending, even if the status says delivered", () => {
    const p = plan({ balanceStated: false, status: "DELIVERED" });
    expect(p).toMatchObject({ paid: "0.00", balance: "17000.00", status: "PENDING" });
  });

  it("no amount → ₹1 placeholder, Pending, with a note to fix the price", () => {
    const p = plan({ amount: "0", balanceStated: true, balance: "0" });
    expect(p).toMatchObject({ total: "1.00", paid: "0.00", status: "PENDING", priceMissing: true });
    expect(p.note).toMatch(/price missing/i);
  });

  it("a balance larger than the total never makes Paid negative", () => {
    expect(plan({ amount: "5000", balance: "9000", balanceStated: true })).toMatchObject({ paid: "0.00", balance: "5000.00" });
  });

  it("keeps cancelled orders cancelled with the reason in the note", () => {
    const p = plan({ status: "CANCELLED", cancelNote: "price", balanceStated: true });
    expect(p.status).toBe("CANCELLED");
    expect(p.note).toContain("Cancelled: price");
  });

  it("only real 10-digit mobiles become the customer phone", () => {
    expect(plan({ phone: "9843722055" }).phone).toBe("9843722055");
    expect(plan({ phone: "919843722055" }).phone).toBe("9843722055");
    expect(plan({ phone: "766126113" }).phone).toBeNull();
    expect(plan({ phone: null }).phone).toBeNull();
  });

  it("joins product lines and bills KFM when the route says KFM", () => {
    const p = plan({ lines: ["10LTR TILTING", "3HP GRAVY"], route: "KFM ACC" });
    expect(p.productText).toBe("10LTR TILTING, 3HP GRAVY");
    expect(p.entityCode).toBe("KFM");
    expect(plan({ route: "KUMAR GPAY" }).entityCode).toBe("KI");
  });

  it("maps the payment route text to a method", () => {
    expect(paymentMethodFor("CASH")).toBe("CASH");
    expect(paymentMethodFor("KUMAR G.PAY")).toBe("UPI");
    expect(paymentMethodFor("kumaresh - gpay")).toBe("UPI");
    expect(paymentMethodFor("KFM ACC")).toBe("BANK_TRANSFER");
    expect(paymentMethodFor("CHEQUE 12345")).toBe("CHEQUE");
    expect(paymentMethodFor(null)).toBe("UPI");
  });

  it("turns an Excel-mangled HP fraction back into text", () => {
    expect(fixSpec("2026-01-04T00:00:00.000Z")).toBe("1/4 HP");
    expect(fixSpec("1/2 HP")).toBe("1/2 HP");
    expect(fixSpec(null)).toBeNull();
  });
});
