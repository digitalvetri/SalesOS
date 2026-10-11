"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { createOrder, cancelOrder } from "@/server/services/orderService";

const PaymentMethod = z.enum(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD"]);
const ChargeKind = z.enum(["FREIGHT", "INSTALLATION", "PACKING", "OTHER"]);
const CancelReason = z.enum([
  "DELIVERY_DELAY",
  "PRICE",
  "CUSTOMER_CHANGED_MIND",
  "FINANCIAL_ISSUE",
  "WRONG_SPEC",
  "DUPLICATE_ENTRY",
  "OTHER",
]);

const DecimalStr = z.union([z.string(), z.number()]).transform((v) =>
  typeof v === "string" ? v.replace(/,/g, "") : String(v),
);

const Line = z.object({
  productId: z.string().nullable().optional(),
  description: z.string().min(1).max(240),
  qty: z.number().int().positive(),
  listPrice: DecimalStr.nullable().optional(),
  floorPrice: DecimalStr.nullable().optional(),
  unitPrice: DecimalStr,
  gstRate: DecimalStr.optional(),
});

const Charge = z.object({
  kind: ChargeKind,
  label: z.string().min(1).max(80),
  amount: DecimalStr,
});

const Advance = z.object({
  amount: DecimalStr,
  method: PaymentMethod,
  paidOn: z.coerce.date(),
  receivedIntoAccountId: z.string().nullable().optional(),
  receivedByUserId: z.string().nullable().optional(),
  referenceNo: z.string().max(80).nullable().optional(),
  note: z.string().max(400).nullable().optional(),
});

const CreateInput = z.object({
  idempotencyKey: z.string().uuid(),
  entityId: z.string(),
  customerId: z.string(),
  salespersonId: z.string().optional(), // defaults to self for SALES
  orderDate: z.coerce.date(),
  promisedDeliveryDate: z.coerce.date().nullable().optional(),
  promisedPaymentDate: z.coerce.date().nullable().optional(),
  lines: z.array(Line).min(1).max(50),
  charges: z.array(Charge).max(10).optional(),
  discount: DecimalStr.optional(),
  notes: z.string().max(1000).nullable().optional(),
  advance: Advance.nullable().optional(),
});

export const createOrderAction = makeServerAction({
  input: CreateInput,
  action: "orders.create",
  resolveOwnership: () => ({ isOwn: true }),
  revalidate: "/orders",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const salespersonId = parsed.salespersonId ?? session.userId;

    const result = await withIdempotency({
      key: parsed.idempotencyKey,
      tenantId: session.tenantId,
      userId: session.userId,
      scope: "orders.create",
      work: () =>
        createOrder({
          tenantId: session.tenantId,
          actorId: session.userId,
          actorRole: session.role,
          entityId: parsed.entityId,
          customerId: parsed.customerId,
          salespersonId,
          orderDate: parsed.orderDate,
          promisedDeliveryDate: parsed.promisedDeliveryDate ?? null,
          promisedPaymentDate: parsed.promisedPaymentDate ?? null,
          lines: parsed.lines,
          charges: parsed.charges,
          discount: parsed.discount,
          notes: parsed.notes ?? null,
          advance: parsed.advance ?? null,
        }),
    });
    return { ...result.value, replay: result.kind === "replay" };
  },
});

const CancelInput = z.object({
  id: z.string(),
  reason: CancelReason,
  note: z.string().max(400).nullable().optional(),
});

export const cancelOrderAction = makeServerAction({
  input: CancelInput,
  action: "orders.cancel",
  revalidate: "/orders",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await cancelOrder({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      id: parsed.id,
      reason: parsed.reason,
      note: parsed.note ?? null,
    });
    return { id: row.id, status: row.status };
  },
});
