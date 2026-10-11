"use server";
// v1.1 Server Actions for the OrderSheet. Each one is a thin Zod + permission
// wrapper around a service in src/server/services/orderV2Service.ts.
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import {
  createOrderV2,
  updateOrderFieldsV2,
  setOrderStatusV2,
  addPaymentV2,
  deletePaymentV2,
} from "@/server/services/orderV2Service";

const PaymentMethod = z.enum(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]);

const CreateInput = z.object({
  productText: z.string().min(1).max(500),
  contactPhone: z.string().min(3),
  customerName: z.string().min(1).max(120),
  total: z.string().min(1),
  paid: z.string().optional(),
  paymentMethod: PaymentMethod.optional(),
  note: z.string().max(1000).optional(),
});

export const createOrderV2Action = makeServerAction({
  input: CreateInput,
  action: "orders.create",
  resolveOwnership: () => ({ isOwn: true }),
  revalidate: "/orders",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const { order } = await createOrderV2({
      tenantId: session.tenantId,
      actorId: session.userId,
      salespersonId: session.userId,
      productText: parsed.productText,
      contactPhone: parsed.contactPhone,
      customerName: parsed.customerName,
      total: parsed.total,
      paid: parsed.paid,
      paymentMethod: parsed.paymentMethod,
      note: parsed.note,
    });
    return { orderId: order.id, serialNo: order.serialNo, number: order.number };
  },
});

const UpdateFieldsInput = z.object({
  orderId: z.string(),
  productText: z.string().min(1).max(500).optional(),
  total: z.string().optional(),
  customerName: z.string().min(1).max(120).optional(),
});

export const updateOrderFieldsV2Action = makeServerAction({
  input: UpdateFieldsInput,
  action: "orders.editBeforeDispatch",
  resolveOwnership: () => ({ isOwn: true }),
  revalidate: "/orders",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await updateOrderFieldsV2({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      orderId: parsed.orderId,
      productText: parsed.productText,
      total: parsed.total,
      customerName: parsed.customerName,
    });
    return { orderId: row.id };
  },
});

const SetStatusInput = z.object({
  orderId: z.string(),
  status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]),
  cancelReason: z.string().max(500).optional(),
});

export const setOrderStatusV2Action = makeServerAction({
  input: SetStatusInput,
  action: "orders.editBeforeDispatch",
  resolveOwnership: () => ({ isOwn: true }),
  revalidate: "/orders",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await setOrderStatusV2({
      tenantId: session.tenantId,
      actorId: session.userId,
      orderId: parsed.orderId,
      status: parsed.status,
      cancelReason: parsed.cancelReason,
    });
    return { orderId: row.id };
  },
});

const AddPaymentInput = z.object({
  orderId: z.string(),
  amount: z.string(),
  method: PaymentMethod,
  paidOn: z.string().optional(), // ISO date
  note: z.string().max(500).optional(),
});

export const addPaymentV2Action = makeServerAction({
  input: AddPaymentInput,
  action: "payments.record",
  resolveOwnership: () => ({ isOwn: true }),
  revalidate: "/orders",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const p = await addPaymentV2({
      tenantId: session.tenantId,
      actorId: session.userId,
      orderId: parsed.orderId,
      amount: parsed.amount,
      method: parsed.method,
      paidOn: parsed.paidOn ? new Date(`${parsed.paidOn}T00:00:00.000Z`) : undefined,
      note: parsed.note,
    });
    return { paymentId: p.id };
  },
});

const DeletePaymentInput = z.object({ paymentId: z.string() });

export const deletePaymentV2Action = makeServerAction({
  input: DeletePaymentInput,
  action: "payments.record",
  resolveOwnership: () => ({ isOwn: true }),
  revalidate: "/orders",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    await deletePaymentV2({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      paymentId: parsed.paymentId,
    });
    return { ok: true };
  },
});
