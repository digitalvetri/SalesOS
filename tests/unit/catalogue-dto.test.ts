// Confirms that the Prisma select used for Sales reads of the catalogue cannot
// leak dealer-price fields. If anyone adds "dealerPrice" to SALES_PRODUCT_SELECT,
// this test fails loudly.
import { describe, it, expect } from "vitest";
import { SALES_PRODUCT_SELECT, ADMIN_PRODUCT_SELECT } from "@/server/repo/products";

describe("catalogue DTO shapes — Sales never sees dealer prices", () => {
  it("SALES_PRODUCT_SELECT does NOT include dealer price fields", () => {
    const keys = Object.keys(SALES_PRODUCT_SELECT);
    expect(keys).not.toContain("dealerPrice");
    expect(keys).not.toContain("dealerPriceWoMotor");
    // Still includes customerPrice, since Sales must see it.
    expect(keys).toContain("customerPrice");
  });

  it("ADMIN_PRODUCT_SELECT includes dealer price fields", () => {
    const keys = Object.keys(ADMIN_PRODUCT_SELECT);
    expect(keys).toContain("dealerPrice");
    expect(keys).toContain("dealerPriceWoMotor");
    expect(keys).toContain("customerPrice");
  });

  it("ADMIN select is a strict superset of SALES select", () => {
    const salesKeys = new Set(Object.keys(SALES_PRODUCT_SELECT));
    const adminKeys = new Set(Object.keys(ADMIN_PRODUCT_SELECT));
    for (const k of salesKeys) {
      expect(adminKeys.has(k)).toBe(true);
    }
  });
});
