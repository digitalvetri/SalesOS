"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/server/repo/client";
import { recordPayment } from "@/server/services/paymentService";

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
