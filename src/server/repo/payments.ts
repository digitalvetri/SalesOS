// Read models for the Payments screens (§11.8): verify queue + cash with staff.
// Payment has no Prisma relations to User/Account, so names are resolved in
// one batched lookup per screen.
import Decimal from "decimal.js";
import { prisma, type PaymentMethod, type Prisma } from "./client";

export type VerifyQueueFilters = {
  receivedInto?: string; // "account:{id}" | "user:{id}"
  method?: PaymentMethod;
  salespersonId?: string;
};

export type QueueRow = {
  id: string;
  receiptNo: string;
  type: "ADVANCE" | "PART" | "FINAL" | "REFUND";
  method: PaymentMethod;
  amount: string;
  paidOn: Date;
  createdAt: Date;
  referenceNo: string | null;
  hasProof: boolean;
  into: { kind: "account" | "person"; id: string; label: string };
  order: { id: string; number: string; customerName: string };
  salesperson: { id: string; name: string };
};

export async function listVerifyQueue(opts: {
  tenantId: string;
  filters: VerifyQueueFilters;
  limit?: number;
}): Promise<{ rows: QueueRow[]; count: number; total: string }> {
  const where: Prisma.PaymentWhereInput = {
    tenantId: opts.tenantId,
    status: "PENDING_VERIFICATION",
  };
  const f = opts.filters;
  if (f.method) where.method = f.method;
  if (f.receivedInto?.startsWith("account:")) {
    where.receivedIntoAccountId = f.receivedInto.slice("account:".length);
  } else if (f.receivedInto?.startsWith("user:")) {
    where.receivedByUserId = f.receivedInto.slice("user:".length);
  }
  if (f.salespersonId) where.order = { salespersonId: f.salespersonId };

  const [payments, agg] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }], // oldest first — clear the backlog
      take: opts.limit ?? 200,
      include: {
        order: {
          select: {
            id: true,
            number: true,
            salespersonId: true,
            customer: { select: { name: true, businessName: true } },
          },
        },
      },
    }),
    prisma.payment.aggregate({ where, _count: true, _sum: { amount: true } }),
  ]);

  const names = await resolveNames(opts.tenantId, payments);
  return {
    count: agg._count,
    total: (agg._sum.amount ?? new Decimal(0)).toString(),
    rows: payments.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      type: p.type,
      method: p.method,
      amount: p.amount.toString(),
      paidOn: p.paidOn,
      createdAt: p.createdAt,
      referenceNo: p.referenceNo,
      hasProof: Boolean(p.proofPath),
      into: p.receivedIntoAccountId
        ? {
            kind: "account",
            id: p.receivedIntoAccountId,
            label: names.accounts.get(p.receivedIntoAccountId) ?? "—",
          }
        : {
            kind: "person",
            id: p.receivedByUserId!,
            label: names.users.get(p.receivedByUserId!) ?? "—",
          },
      order: {
        id: p.order.id,
        number: p.order.number,
        customerName: p.order.customer.businessName ?? p.order.customer.name,
      },
      salesperson: {
        id: p.order.salespersonId,
        name: names.users.get(p.order.salespersonId) ?? "—",
      },
    })),
  };
}

export type CashWithStaffGroup = {
  user: { id: string; name: string };
  total: string;
  payments: Array<{
    id: string;
    receiptNo: string;
    method: PaymentMethod;
    amount: string;
    paidOn: Date;
    status: "PENDING_VERIFICATION" | "VERIFIED";
    order: { id: string; number: string; entityId: string };
  }>;
};

/** §9 "Cash with staff": non-rejected payments received by a person and not yet deposited. */
export async function listCashWithStaff(tenantId: string): Promise<CashWithStaffGroup[]> {
  const payments = await prisma.payment.findMany({
    where: {
      tenantId,
      receivedByUserId: { not: null },
      depositedOn: null,
      status: { not: "REJECTED" },
      type: { not: "REFUND" },
    },
    orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
    include: { order: { select: { id: true, number: true, entityId: true } } },
  });
  const names = await resolveNames(
    tenantId,
    payments.map((p) => ({ receivedIntoAccountId: null, receivedByUserId: p.receivedByUserId })),
  );

  const groups = new Map<string, CashWithStaffGroup>();
  for (const p of payments) {
    const uid = p.receivedByUserId!;
    let g = groups.get(uid);
    if (!g) {
      g = { user: { id: uid, name: names.users.get(uid) ?? "—" }, total: "0", payments: [] };
      groups.set(uid, g);
    }
    g.total = new Decimal(g.total).plus(p.amount.toString()).toString();
    g.payments.push({
      id: p.id,
      receiptNo: p.receiptNo,
      method: p.method,
      amount: p.amount.toString(),
      paidOn: p.paidOn,
      status: p.status as "PENDING_VERIFICATION" | "VERIFIED",
      order: p.order,
    });
  }
  return [...groups.values()].sort((a, b) => new Decimal(b.total).comparedTo(a.total));
}

async function resolveNames(
  tenantId: string,
  payments: Array<{
    receivedIntoAccountId: string | null;
    receivedByUserId: string | null;
    order?: { salespersonId?: string };
  }>,
) {
  const userIds = new Set<string>();
  const accountIds = new Set<string>();
  for (const p of payments) {
    if (p.receivedByUserId) userIds.add(p.receivedByUserId);
    if (p.receivedIntoAccountId) accountIds.add(p.receivedIntoAccountId);
    if (p.order?.salespersonId) userIds.add(p.order.salespersonId);
  }
  const [users, accounts] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId, id: { in: [...userIds] } },
      select: { id: true, name: true },
    }),
    prisma.account.findMany({
      where: { tenantId, id: { in: [...accountIds] } },
      select: { id: true, label: true },
    }),
  ]);
  return {
    users: new Map(users.map((u) => [u.id, u.name])),
    accounts: new Map(accounts.map((a) => [a.id, a.label])),
  };
}

/** Verified payments with paidOn in [from, to] — the list behind §9 "Collected (verified)". */
export async function listCollected(opts: { tenantId: string; from: string; to: string; entityId?: string }) {
  const where: Prisma.PaymentWhereInput = {
    tenantId: opts.tenantId,
    status: "VERIFIED",
    paidOn: { gte: new Date(`${opts.from}T00:00:00.000Z`), lte: new Date(`${opts.to}T00:00:00.000Z`) },
    ...(opts.entityId ? { order: { entityId: opts.entityId } } : {}),
  };
  const payments = await prisma.payment.findMany({
    where,
    orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: { order: { select: { id: true, number: true, salespersonId: true, customer: { select: { name: true, businessName: true } } } } },
  });
  const names = await resolveNames(opts.tenantId, payments);
  let net = new Decimal(0);
  const rows = payments.map((p) => {
    net = p.type === "REFUND" ? net.minus(p.amount.toString()) : net.plus(p.amount.toString());
    return {
      id: p.id,
      receiptNo: p.receiptNo,
      type: p.type,
      method: p.method,
      amount: p.amount.toString(),
      paidOn: p.paidOn,
      into: p.receivedIntoAccountId
        ? (names.accounts.get(p.receivedIntoAccountId) ?? "—")
        : `${names.users.get(p.receivedByUserId!) ?? "—"} (personal)`,
      order: { id: p.order.id, number: p.order.number, customerName: p.order.customer.businessName ?? p.order.customer.name },
      salesperson: names.users.get(p.order.salespersonId) ?? "—",
    };
  });
  return { rows, net: net.toString() };
}
