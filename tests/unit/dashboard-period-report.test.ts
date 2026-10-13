// Admin Overview period report: one period (year or month), every figure for the orders booked in it.
import { describe, it, expect } from "vitest";
import {
  parsePeriod, periodLabel, monthsOfYear, sumCells, inPeriod, monthlyRows, employeeRows, previousPeriod, type PeriodCell,
} from "@/server/domain/dashboard/periodReport";

const cell = (ym: string, sp: string, o: Partial<PeriodCell>): PeriodCell => ({
  ym, salespersonId: sp, orders: 0, cancelled: 0, value: "0", completed: 0, completedValue: "0", pending: 0,
  pendingPayment: 0, pendingDelivery: 0, noAmount: 0, balance: "0", paidOnOrders: "0", received: "0", ...o,
});
const cells = [
  cell("2026-09", "a", { orders: 10, value: "100000", completed: 6, pending: 4, pendingPayment: 3, pendingDelivery: 1, balance: "20000", paidOnOrders: "80000", received: "70000" }),
  cell("2026-10", "a", { orders: 4, value: "40000", completed: 1, pending: 3, balance: "30000", paidOnOrders: "10000", received: "15000", noAmount: 1 }),
  cell("2026-10", "b", { orders: 2, value: "60000", completed: 2, paidOnOrders: "60000", received: "60000" }),
  cell("2025-10", "b", { orders: 1, value: "5000" }),
];

describe("period report", () => {
  it("parses ?p= (year, month, default = this month)", () => {
    expect(parsePeriod("2026", "2026-10-13")).toEqual({ kind: "year", year: 2026 });
    expect(parsePeriod("2026-09", "2026-10-13")).toEqual({ kind: "month", year: 2026, month: 9 });
    expect(parsePeriod("junk", "2026-10-13")).toEqual({ kind: "month", year: 2026, month: 10 });
    expect(periodLabel({ kind: "month", year: 2026, month: 10 })).toBe("October 2026");
    expect(monthsOfYear(2026, "2026-10-13")).toHaveLength(10);
    expect(monthsOfYear(2025, "2026-10-13")).toHaveLength(12);
  });
  it("completed + pending always equal the orders booked in the same period", () => {
    const oct = sumCells(inPeriod(cells, { kind: "month", year: 2026, month: 10 }));
    expect(oct).toMatchObject({ orders: 6, completed: 3, pending: 3, value: "100000", balance: "30000", received: "75000", completionPct: 50 });
    expect(oct.avgOrder).toBe("20000"); // 100000 / 5 priced orders
    const year = sumCells(inPeriod(cells, { kind: "year", year: 2026 }));
    expect(year).toMatchObject({ orders: 16, completed: 9, pending: 7, value: "200000" });
  });
  it("month rows and team rows (biggest sales first, share of sales)", () => {
    expect(monthlyRows(cells, ["2026-09", "2026-10"]).map((r) => [r.ym, r.orders])).toEqual([["2026-09", 10], ["2026-10", 6]]);
    const team = employeeRows(inPeriod(cells, { kind: "month", year: 2026, month: 10 }), [{ id: "a", name: "Asha" }, { id: "b", name: "Bala" }]);
    expect(team.map((r) => [r.name, r.sharePct])).toEqual([["Bala", 60], ["Asha", 40]]);
  });
  it("previous period", () => {
    expect(previousPeriod({ kind: "month", year: 2026, month: 1 })).toEqual({ kind: "month", year: 2025, month: 12 });
    expect(previousPeriod({ kind: "year", year: 2026 })).toEqual({ kind: "year", year: 2025 });
  });
});
