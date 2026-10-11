import { prisma, type OrderStatus, type Prisma } from "./client";

export const ADMIN_ORDER_SELECT = {
  id: true,
  number: true,
  entityId: true,
  customerId: true,
  salespersonId: true,
  orderDate: true,
  promisedDeliveryDate: true,
  promisedPaymentDate: true,
  status: true,
  subtotal: true,
  chargesTotal: true,
  discount: true,
  total: true,
  balanceDue: true,
  needsApproval: true,
  cancelReason: true,
  cancelNote: true,
  notes: true,
  source: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrderSelect;

export type OrderListFilters = {
  statuses?: OrderStatus[];
  salespersonId?: string;
  entityId?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  hasBalance?: boolean;
  refundDue?: boolean; // negative balance (§9 "Refunds due")
  cancelRequested?: boolean; // open cancel request (CANCEL_REQUEST event, not yet cancelled)
  search?: string; // number, customer name, or phone
};

export async function listOrders(opts: {
  tenantId: string;
  filters: OrderListFilters;
  limit?: number;
  // For Sales: constrain to their own orders.
  salespersonScope?: string;
}) {
  const where: Prisma.OrderWhereInput = { tenantId: opts.tenantId };
  const f = opts.filters;

  if (f.statuses && f.statuses.length > 0) where.status = { in: f.statuses };
  if (f.salespersonId) where.salespersonId = f.salespersonId;
  // Applied after the filter so a Sales user's own-orders scope always wins.
  if (opts.salespersonScope) where.salespersonId = opts.salespersonScope;
  if (f.entityId) where.entityId = f.entityId;
  if (f.customerId) where.customerId = f.customerId;
  if (f.dateFrom || f.dateTo) {
    where.orderDate = {};
    if (f.dateFrom) (where.orderDate as Prisma.DateTimeFilter).gte = f.dateFrom;
    if (f.dateTo) (where.orderDate as Prisma.DateTimeFilter).lte = f.dateTo;
  }
  if (f.hasBalance === true) where.balanceDue = { gt: 0 };
  if (f.hasBalance === false) where.balanceDue = { lte: 0 };
  if (f.refundDue) where.balanceDue = { lt: 0 };
  if (f.cancelRequested) {
    where.events = { some: { type: "CANCEL_REQUEST" } };
    where.status = { not: "CANCELLED" };
  }

  if (f.search && f.search.trim().length > 0) {
    const q = f.search.trim();
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
      { customer: { is: { phoneE164: { contains: q } } } },
    ];
  }

  return prisma.order.findMany({
    where,
    orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
    take: opts.limit ?? 500,
    select: {
      ...ADMIN_ORDER_SELECT,
      entity: { select: { code: true } },
      customer: { select: { id: true, name: true, phoneE164: true } },
      salesperson: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
  });
}

export async function getOrderById(opts: {
  tenantId: string;
  id: string;
  salespersonScope?: string;
}) {
  const where: Prisma.OrderWhereInput = { tenantId: opts.tenantId, id: opts.id };
  if (opts.salespersonScope) where.salespersonId = opts.salespersonScope;
  return prisma.order.findFirst({
    where,
    include: {
      entity: { select: { code: true, name: true } },
      customer: true,
      salesperson: { select: { id: true, name: true } },
      lines: { orderBy: { sortOrder: "asc" } },
      charges: true,
      payments: { orderBy: { paidOn: "desc" } },
      events: { orderBy: { at: "asc" } },
      followUps: { orderBy: { at: "asc" } },
      dispatches: { orderBy: { dispatchedOn: "asc" }, include: { lines: true } },
    },
  });
}
