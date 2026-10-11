import { describe, it, expect } from "vitest";
import {
  templateParams,
  templateText,
  isWithinSendWindow,
  autoReminderDecision,
  nextStatus,
  TEMPLATES,
} from "@/server/domain/whatsapp/whatsapp";

describe("templates (§13)", () => {
  it("order_confirmation matches the spec example", () => {
    const t = {
      template: "order_confirmation" as const, name: "Gokul", orderNumber: "KI/26-27/0412", items: "15kg Potato Peeler ×1",
      total: "24000", advance: "10000", balance: "14000", deliveryDate: "2026-10-15", entityName: "Kumaar Industries",
    };
    expect(templateText(t)).toBe(
      "Hi Gokul, thank you for your order KI/26-27/0412 with Kumaar Industries: 15kg Potato Peeler ×1. Total ₹24,000, advance ₹10,000, balance ₹14,000. Expected delivery 15 Oct.",
    );
    expect(templateParams(t)).toEqual(["Gokul", "KI/26-27/0412", "15kg Potato Peeler ×1", "₹24,000", "₹10,000", "₹14,000", "15 Oct", "Kumaar Industries"]);
    expect(templateText({ ...t, deliveryDate: null })).not.toContain("Expected delivery");
    expect(templateParams({ ...t, deliveryDate: null })[6]).toBe("—");
  });
  it("payment_received", () => {
    const t = { template: "payment_received" as const, name: "Gokul", amount: "14000", receiptNo: "RCPT/26-27/01240", balance: "0" };
    expect(templateText(t)).toBe("Received ₹14,000 (RCPT/26-27/01240). Balance now ₹0. Thank you!");
    expect(templateParams(t)).toEqual(["Gokul", "₹14,000", "RCPT/26-27/01240", "₹0"]);
  });
  it("dispatch_update with and without transport", () => {
    const t = { template: "dispatch_update" as const, name: "Gokul", orderNumber: "KI/26-27/0412", items: "Peeler ×1", transporter: "ABT", lrNumber: "88213" };
    expect(templateText(t)).toBe("Your machines for KI/26-27/0412 have been dispatched via ABT, LR 88213: Peeler ×1.");
    expect(templateParams({ ...t, transporter: null, lrNumber: null })).toEqual(["Gokul", "KI/26-27/0412", "Peeler ×1", "—", "—"]);
    expect(templateText({ ...t, transporter: null, lrNumber: null })).toBe("Your machines for KI/26-27/0412 have been dispatched: Peeler ×1.");
  });
  it("payment_reminder", () => {
    const t = { template: "payment_reminder" as const, name: "Gokul", orderNumber: "KI/26-27/0412", balance: "14000", payTo: "UPI: ki@hdfc" };
    expect(templateText(t)).toBe("Gentle reminder: ₹14,000 is pending for KI/26-27/0412. UPI: ki@hdfc. Thank you.");
    expect(templateText({ ...t, payTo: null })).toBe("Gentle reminder: ₹14,000 is pending for KI/26-27/0412. Thank you.");
    expect(templateParams({ ...t, payTo: null })).toEqual(["Gokul", "KI/26-27/0412", "₹14,000", "—"]);
  });
  it("exactly four templates", () => {
    expect(TEMPLATES).toHaveLength(4);
  });
});

describe("send window (§5.4: never Sunday, 10:00–19:00 IST)", () => {
  it("weekday hours", () => {
    expect(isWithinSendWindow(new Date("2026-10-12T04:29:00Z"))).toBe(false); // Mon 09:59 IST
    expect(isWithinSendWindow(new Date("2026-10-12T04:30:00Z"))).toBe(true); // Mon 10:00 IST
    expect(isWithinSendWindow(new Date("2026-10-12T13:29:00Z"))).toBe(true); // Mon 18:59 IST
    expect(isWithinSendWindow(new Date("2026-10-12T13:30:00Z"))).toBe(false); // Mon 19:00 IST
  });
  it("never on Sunday (IST)", () => {
    expect(isWithinSendWindow(new Date("2026-10-11T06:00:00Z"))).toBe(false); // Sun 11:30 IST
    expect(isWithinSendWindow(new Date("2026-10-10T19:00:00Z"))).toBe(false); // Sat 19:00 UTC = Sun 00:30 IST
  });
});

describe("auto reminders (every N days, max M, 48 h floor)", () => {
  const now = new Date("2026-10-20T06:00:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
  it("sends when overdue and never reminded", () => {
    expect(autoReminderDecision({ overdue: true, lastReminderAt: null, autoRemindersSent: 0 }, now, 5, 3)).toEqual({ send: true });
  });
  it("blocks: not overdue, max reached, 48 h cooldown, not due yet", () => {
    expect(autoReminderDecision({ overdue: false, lastReminderAt: null, autoRemindersSent: 0 }, now, 5, 3)).toEqual({ send: false, reason: "not_overdue" });
    expect(autoReminderDecision({ overdue: true, lastReminderAt: null, autoRemindersSent: 3 }, now, 5, 3)).toEqual({ send: false, reason: "max_reached" });
    expect(autoReminderDecision({ overdue: true, lastReminderAt: ago(47), autoRemindersSent: 0 }, now, 1, 3)).toEqual({ send: false, reason: "cooldown" });
    expect(autoReminderDecision({ overdue: true, lastReminderAt: ago(72), autoRemindersSent: 1 }, now, 5, 3)).toEqual({ send: false, reason: "not_due_yet" });
  });
  it("sends again once N days have passed", () => {
    expect(autoReminderDecision({ overdue: true, lastReminderAt: ago(5 * 24), autoRemindersSent: 1 }, now, 5, 3)).toEqual({ send: true });
  });
});

describe("webhook status ordering", () => {
  it("moves forward only", () => {
    expect(nextStatus("SENT", "delivered")).toBe("DELIVERED");
    expect(nextStatus("DELIVERED", "read")).toBe("READ");
    expect(nextStatus("READ", "delivered")).toBeNull(); // late duplicate
    expect(nextStatus("SENT", "sent")).toBeNull();
  });
  it("failed is terminal; deeplink/unknown untouched", () => {
    expect(nextStatus("SENT", "failed")).toBe("FAILED");
    expect(nextStatus("FAILED", "read")).toBeNull();
    expect(nextStatus("DEEPLINK", "delivered")).toBeNull();
    expect(nextStatus("SENT", "deleted")).toBeNull();
  });
});
