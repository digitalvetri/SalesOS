// Order workflow: production marks On progress / Finished; sales mark Delivered.
// Since 2026-10-16 sales may deliver any time — unfinished orders go out from ready stock.
import { describe, it, expect } from "vitest";
import {
  productionAfterDelivery, canUpdateProduction, productionEditable, PRODUCTION_LABEL, ORDER_STATUS_LABEL,
} from "@/server/domain/v1_1/workflow";

describe("order workflow", () => {
  it("delivering keeps production's Finished; anything else was from ready stock", () => {
    expect(productionAfterDelivery("FINISHED")).toBe("FINISHED");
    expect(productionAfterDelivery("NOT_STARTED")).toBe("NOT_NEEDED");
    expect(productionAfterDelivery("IN_PROGRESS")).toBe("NOT_NEEDED");
    expect(productionAfterDelivery("NOT_NEEDED")).toBe("NOT_NEEDED");
  });
  it("only production / owner / admin update production, and only on pending orders that need it", () => {
    expect(canUpdateProduction("PRODUCTION")).toBe(true);
    expect(canUpdateProduction("ADMIN")).toBe(true);
    expect(canUpdateProduction("SALES")).toBe(false);
    expect(productionEditable({ simpleStatus: "PENDING" })).toBe(true);
    expect(productionEditable({ simpleStatus: "PENDING", productionStatus: "IN_PROGRESS" })).toBe(true);
    expect(productionEditable({ simpleStatus: "PENDING", productionStatus: "NOT_NEEDED" })).toBe(false);
    expect(productionEditable({ simpleStatus: "DELIVERED" })).toBe(false);
    expect(productionEditable({ simpleStatus: "CANCELLED" })).toBe(false);
  });
  it("labels", () => {
    expect(PRODUCTION_LABEL.IN_PROGRESS).toBe("On progress");
    expect(PRODUCTION_LABEL.NOT_NEEDED).toBe("Ready stock");
    expect(ORDER_STATUS_LABEL.DELIVERED).toBe("Delivered");
  });
});
