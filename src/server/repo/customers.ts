import { realPhone } from "@/lib/orderDisplay";
import { prisma, type CustomerType } from "./client";

export type CustomerListRow = {
  id: string;
  name: string;
  businessName: string | null;
  phoneE164: string | null;
  type: CustomerType;
  city: string | null;
  ordersCount: number;
};

// Lists live customers (merged-away rows hidden).
export async function listCustomers(tenantId: string, opts?: { limit?: number }) {
  const rows = await prisma.customer.findMany({
    where: { tenantId, mergedIntoId: null },
    orderBy: [{ createdAt: "desc" }],
    take: opts?.limit ?? 500,
    select: {
      id: true,
      name: true,
      businessName: true,
      phoneE164: true,
      type: true,
      city: true,
      _count: { select: { orders: true } },
    },
  });
  return rows.map(
    (r): CustomerListRow => ({
      id: r.id,
      name: r.name,
      businessName: r.businessName,
      phoneE164: realPhone(r.phoneE164),
      type: r.type,
      city: r.city,
      ordersCount: r._count.orders,
    }),
  );
}

export async function getCustomerByPhone(tenantId: string, phoneE164: string) {
  // Follow mergedIntoId to the surviving row.
  const first = await prisma.customer.findUnique({
    where: { tenantId_phoneE164: { tenantId, phoneE164 } },
  });
  if (!first) return null;
  let row: typeof first = first;
  // Up to 5 hops just in case; mergedInto chains should be flat in practice.
  for (let i = 0; i < 5 && row.mergedIntoId; i++) {
    const next: typeof first | null = await prisma.customer.findFirst({
      where: { tenantId, id: row.mergedIntoId },
    });
    if (!next) break;
    row = next;
  }
  return row;
}

export async function getCustomerById(tenantId: string, id: string) {
  return prisma.customer.findFirst({
    where: { tenantId, id },
    include: {
      orders: {
        orderBy: { orderDate: "desc" },
        take: 50,
        select: {
          id: true,
          number: true,
          orderDate: true,
          status: true,
          total: true,
          balanceDue: true,
        },
      },
      mergedFrom: {
        select: { id: true, name: true, phoneE164: true, mergedAt: true },
      },
    },
  });
}

// Lightweight live search used by PhoneInput (debounced).
export async function searchCustomersByPhonePrefix(opts: {
  tenantId: string;
  prefix: string;
  limit?: number;
}) {
  const limit = opts.limit ?? 5;
  const q = opts.prefix.replace(/\s+/g, "");
  if (q.length < 3) return [];
  return prisma.customer.findMany({
    where: {
      tenantId: opts.tenantId,
      mergedIntoId: null,
      phoneE164: { contains: q },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      businessName: true,
      phoneE164: true,
      city: true,
      _count: { select: { orders: true } },
    },
  });
}
