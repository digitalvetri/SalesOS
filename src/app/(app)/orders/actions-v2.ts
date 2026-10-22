"use server";
// v1.1 Server Actions for the OrderSheet. Each one is a thin Zod + permission
// wrapper around a service in src/server/services/orderV2Service.ts.
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { prisma } from "@/server/repo/client";
import type { Session } from "@/server/auth/session";
import {
  createOrderV2,
  updateOrderFieldsV2,
  setOrderStatusV2,
  addPaymentV2,
  deletePaymentV2,
  updatePaymentV2,
} from "@/server/services/orderV2Service";

const PaymentMethod = z.enum(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]);
// Plain decimal rupees (the UI sends e.g. "62500.00"): no exponents, no commas.
const Money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter the amount as a number.");
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const PastIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Pick a valid date.")
  .refine((d) => d <= istToday(), "Payment date can't be in the future.");

// Ownership for "own"-scoped roles (SALES): the order must be theirs.
async function ownsOrder(orderId: string, session: Session | null) {
  if (!session) return { isOwn: false };
  const order = await prisma.order.findFirst({
    where: { tenantId: session.tenantId, id: orderId },
    select: { salespersonId: true },
  });
  return { isOwn: order?.salespersonId === session.userId };
}

async function ownsPayment(paymentId: string, session: Session | null) {
  if (!session) return { isOwn: false };
  const payment = await prisma.payment.findFirst({
    where: { tenantId: session.tenantId, id: paymentId },
    select: { order: { select: { salespersonId: true } } },
  });
  return { isOwn: payment?.order.salespersonId === session.userId };
}

const isAdminRole = (role: string) => role === "OWNER" || role === "ADMIN";


const ItemInput = z.object({
  name: z.string().max(200),
  qty: z.number().int().min(1).max(9999),
  unitPrice: Money,
  productId: z.string().nullable().optional(),
});

const CreateInput = z.object({
  productText: z.string().max(500).default(""),
  items: z.array(ItemInput).min(1).max(50).optional(),
  contactPhone: z.string().min(3),
  customerName: z.string().min(1).max(120),
  total: Money,
  paid: Money.optional(),
  paymentMethod: PaymentMethod.optional(),
  note: z.string().max(1000).optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  accDetails: z.string().max(200).nullable().optional(),
  readyStock: z.boolean().optional(),
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
      orderDate: parsed.orderDate ? new Date(`${parsed.orderDate}T00:00:00.000Z`) : undefined,
      deliveryDate: parsed.deliveryDate ?? null,
      accDetails: parsed.accDetails ?? null,
      readyStock: parsed.readyStock ?? false,
      items: parsed.items,
    });
    return { orderId: order.id, serialNo: order.serialNo, number: order.number };
  },
});

const UpdateFieldsInput = z.object({
  orderId: z.string(),
  productText: z.string().min(1).max(500).optional(),
  total: Money.optional(),
  customerName: z.string().min(1).max(120).optional(),
  contact: z.string().max(120).nullable().optional(),
  accDetails: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateOrderFieldsV2Action = makeServerAction({
  input: UpdateFieldsInput,
  action: "orders.editBeforeDispatch",
  resolveOwnership: (p, session) => ownsOrder(p.orderId, session),
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
      contact: parsed.contact,
      accDetails: parsed.accDetails,
      notes: parsed.notes,
      deliveryDate: parsed.deliveryDate,
      orderDate: parsed.orderDate,
    });
    return { orderId: row.id };
  },
});

const SetStatusInput = z.object({
  orderId: z.string(),
  status: z.enum(["PENDING", "DELIVERED", "CANCELLED"]),
  cancelReason: z.string().max(500).optional(),
});

export const setOrderStatusV2Action = makeServerAction({
  input: SetStatusInput,
  action: "orders.editBeforeDispatch",
  resolveOwnership: (p, session) => ownsOrder(p.orderId, session),
  revalidate: "/orders",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    // v1.1 §4.3: completed / cancelled orders are read-only for employees.
    if (!isAdminRole(session.role)) {
      const current = await prisma.order.findFirst({
        where: { tenantId: session.tenantId, id: parsed.orderId },
        select: { simpleStatus: true },
      });
      if (current && current.simpleStatus !== "PENDING") {
        throw new AppError("FORBIDDEN", "Only an admin can change a delivered or cancelled order.");
      }
    }
    const row = await setOrderStatusV2({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      orderId: parsed.orderId,
      status: parsed.status,
      cancelReason: parsed.cancelReason,
    });
    return { orderId: row.id };
  },
});

const AddPaymentInput = z.object({
  orderId: z.string(),
  amount: Money,
  method: PaymentMethod,
  paidOn: PastIsoDate.optional(),
  note: z.string().max(500).optional(),
});

export const addPaymentV2Action = makeServerAction({
  input: AddPaymentInput,
  action: "payments.record",
  resolveOwnership: (p, session) => ownsOrder(p.orderId, session),
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
  resolveOwnership: (p, session) => ownsPayment(p.paymentId, session),
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

const UpdatePaymentInput = z.object({
  paymentId: z.string(),
  amount: Money.optional(),
  method: z.enum(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]).optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(200).nullable().optional(),
});

export const updatePaymentV2Action = makeServerAction({
  input: UpdatePaymentInput,
  action: "payments.record",
  resolveOwnership: async (p, session) => {
    if (!session) return { isOwn: false };
    const pay = await prisma.payment.findFirst({ where: { id: p.paymentId, tenantId: session.tenantId }, select: { orderId: true } });
    return pay ? ownsOrder(pay.orderId, session) : { isOwn: false };
  },
  revalidate: "/orders",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const p = await updatePaymentV2({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      paymentId: parsed.paymentId,
      amount: parsed.amount,
      method: parsed.method,
      paidOn: parsed.paidOn,
      note: parsed.note,
    });
    return { paymentId: p.id };
  },
});

// ─── Payments on one order (the "Payments" window on the orders list) ───

const ListPaymentsInput = z.object({ orderId: z.string() });

export const listOrderPaymentsAction = makeServerAction({
  input: ListPaymentsInput,
  action: "payments.record",
  resolveOwnership: (p, session) => ownsOrder(p.orderId, session),
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const rows = await prisma.payment.findMany({
      where: { tenantId: session.tenantId, orderId: parsed.orderId, status: { not: "REJECTED" } },
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
      select: { id: true, type: true, amount: true, method: true, paidOn: true, note: true },
    });
    return {
      payments: rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount.toString(),
        method: r.method,
        paidOn: r.paidOn.toISOString().slice(0, 10),
        note: r.note ?? "",
      })),
    };
  },
});
