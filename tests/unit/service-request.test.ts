// Task 8 — service request input validation (pure; no DB).
import { describe, it, expect } from "vitest";
import { validateServiceInput, type ServiceInput } from "@/server/services/serviceRequestService";

const ok: ServiceInput = {
  customerName: "Ravi Kumar",
  phone: "98765 43210",
  address: null,
  product: "Dosa batter grinder",
  complaint: "Motor not starting",
  serviceType: "FREE",
  notes: null,
};

describe("validateServiceInput", () => {
  it("accepts a complete request", () => {
    expect(validateServiceInput(ok)).toBeNull();
  });

  it("accepts +91 / 0-prefixed numbers and optional fields left out", () => {
    expect(validateServiceInput({ ...ok, phone: "+91 98765 43210", product: undefined, address: undefined })).toBeNull();
    expect(validateServiceInput({ ...ok, phone: "09876543210", serviceType: "PAID" })).toBeNull();
  });

  it("requires the customer's name", () => {
    expect(validateServiceInput({ ...ok, customerName: "" })).toBe("Enter the customer's name.");
    expect(validateServiceInput({ ...ok, customerName: "   " })).toBe("Enter the customer's name.");
  });

  it("requires a 10-digit Indian mobile number", () => {
    for (const phone of ["", "12345", "98765432", "987654321012", "1234567890", "+14155551234", "abcdefghij"]) {
      expect(validateServiceInput({ ...ok, phone })).toBe("Enter a 10-digit mobile number.");
    }
  });

  it("requires the complaint", () => {
    expect(validateServiceInput({ ...ok, complaint: "" })).toBe("Describe the complaint.");
    expect(validateServiceInput({ ...ok, complaint: "  \n " })).toBe("Describe the complaint.");
  });

  it("reports the first problem in form order", () => {
    expect(validateServiceInput({ ...ok, customerName: "", phone: "1", complaint: "" })).toBe("Enter the customer's name.");
    expect(validateServiceInput({ ...ok, phone: "1", complaint: "" })).toBe("Enter a 10-digit mobile number.");
  });
});
