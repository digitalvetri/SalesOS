// Order workflow (2026-10-15): production marks On progress / Finished; sales mark Delivered after Finished.
import { describe, it, expect } from "vitest";
import {
  deliveredBlockReason, canUpdateProduction, productionEditable, PRODUCTION_LABEL, ORDER_STATUS_LABEL,
} from "@/server/domain/v1_1/workflow";

describe("order workflow", () => {
  it("sales can mark Delivered only after production Finished", () => {
    expect(deliveredBlockReason({ productionStatus: "NOT_STARTED", role: "SALES" })).toMatch(/production/i);
    expect(deliveredBlockReason({ productionStatus: "IN_PROGRESS", role: "SALES" })).toMatch(/production/i);
    expect(deliveredBlockReason({ productionStatus: "FINISHED", role: "SALES" })).toBeNull();
  });
  it("owner / admin may override", () => {
    expect(deliveredBlockReason({ productionStatus: "NOT_STARTED", role: "ADMIN" })).toBeNull();
    expect(deliveredBlockReason({ productionStatus: "IN_PROGRESS", role: "OWNER" })).toBeNull();
  });
  it("only production / owner / admin update production, and only while the order is pending", () => {
    expect(canUpdateProduction("PRODUCTION")).toBe(true);
    expect(canUpdateProduction("ADMIN")).toBe(true);
    expect(canUpdateProduction("SALES")).toBe(false);
    expect(productionEditable({ simpleStatus: "PENDING" })).toBe(true);
    expect(productionEditable({ simpleStatus: "DELIVERED" })).toBe(false);
    expect(productionEditable({ simpleStatus: "CANCELLED" })).toBe(false);
  });
  it("labels", () => {
    expect(PRODUCTION_LABEL.IN_PROGRESS).toBe("On progress");
    expect(ORDER_STATUS_LABEL.DELIVERED).toBe("Delivered");
  });
});
