"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/server/repo/client";
import {
  recordPayment,
  verifyPayments,
  rejectPayment,
  markDeposited,
  recordRefund,
} from "@/server/services/paymentService";

const PaymentMethod = z.enum(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD"]);

const DecimalStr = z.union([z.string(), z.number()]).transform((v) =>
  typeof v === "string" ? v.replace(/,/g, "") : String(v),
);

// "account:{id}" | "user:{id}" — same encoding as the new-order wizard.
const ReceivedInto = z
  .string()
  .regex(/^(account|user):[A-Za-z0-9_-]+$/, "Pick where the money was received.");

const RecordInput = z.object({
  idempotencyKey: z.string().uuid(),
  orderId: z.string().min(1),
  amount: DecimalStr,
  method: PaymentMethod,
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receivedInto: ReceivedInto,
  referenceNo: z.string().trim().max(80).nullable().optional(),
  proofPath: z.string().max(300).nullable().optional(),
  note: z.string().trim().max(400).nullable().optional(),
});

export const recordPaymentAction = makeServerAction({
  input: RecordInput,
  action: "payments.record",
  async resolveOwnership(parsed, session) {
    if (!session) return { isOwn: false };
    const order = await prisma.order.findFirst({
      where: { tenantId: session.tenantId, id: parsed.orderId },
      select: { salespersonId: true },
    });
    return { isOwn: order?.salespersonId === session.userId };
  },
  revalidate: ["/orders", "/home"],
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const [kind, id] = parsed.receivedInto.split(":") as ["account" | "user", string];

    const result = await withIdempotency({
      key: parsed.idempotencyKey,
      tenantId: session.tenantId,
      userId: session.userId,
      scope: "payments.record",
      work: () =>
        recordPayment({
          tenantId: session.tenantId,
          actorId: session.userId,
          actorRole: session.role,
          orderId: parsed.orderId,
          method: parsed.method,
          amount: parsed.amount,
          paidOn: new Date(`${parsed.paidOn}T00:00:00.000Z`),
          receivedIntoAccountId: kind === "account" ? id : null,
          receivedByUserId: kind === "user" ? id : null,
          referenceNo: parsed.referenceNo || null,
          proofPath: parsed.proofPath || null,
          note: parsed.note || null,
        }),
    });
    return { ...result.value, replay: result.kind === "replay" };
  },
});

const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const toDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

const VerifyInput = z.object({ paymentIds: z.array(z.string().min(1)).min(1).max(200) });

export const verifyPaymentsAction = makeServerAction({
  input: VerifyInput,
  action: "payments.verify",
  revalidate: ["/payments", "/orders", "/home"],
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    return verifyPayments({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      paymentIds: parsed.paymentIds,
    });
  },
});

const RejectInput = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().min(1).max(400),
});

export const rejectPaymentAction = makeServerAction({
  input: RejectInput,
  action: "payments.verify",
  revalidate: ["/payments", "/orders", "/home"],
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    return rejectPayment({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      paymentId: parsed.paymentId,
      reason: parsed.reason,
    });
  },
});

const DepositInput = z.object({
  paymentId: z.string().min(1),
  accountId: z.string().min(1),
  depositedOn: BusinessDate,
});

export const markDepositedAction = makeServerAction({
  input: DepositInput,
  action: "payments.verify",
  revalidate: ["/payments", "/orders"],
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await markDeposited({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      paymentId: parsed.paymentId,
      depositedToAccountId: parsed.accountId,
      depositedOn: toDate(parsed.depositedOn),
    });
    return { id: row.id };
  },
});

const RefundInput = z.object({
  idempotencyKey: z.string().uuid(),
  orderId: z.string().min(1),
  amount: DecimalStr,
  method: PaymentMethod,
  paidOn: BusinessDate,
  accountId: z.string().min(1),
  referenceNo: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(400).nullable().optional(),
});

export const recordRefundAction = makeServerAction({
  input: RefundInput,
  action: "payments.recordRefund",
  revalidate: ["/payments", "/orders", "/home"],
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const result = await withIdempotency({
      key: parsed.idempotencyKey,
      tenantId: session.tenantId,
      userId: session.userId,
      scope: "payments.refund",
      work: () =>
        recordRefund({
          tenantId: session.tenantId,
          actorId: session.userId,
          actorRole: session.role,
          orderId: parsed.orderId,
          amount: parsed.amount,
          method: parsed.method,
          paidOn: toDate(parsed.paidOn),
          receivedIntoAccountId: parsed.accountId,
          referenceNo: parsed.referenceNo || null,
          note: parsed.note || null,
        }),
    });
    return { ...result.value, replay: result.kind === "replay" };
  },
});
