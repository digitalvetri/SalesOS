// Production board (spec 2026-10-15 §4). Orders as the production team sees
// them: what to build, for whom, by when. NO money fields are selected here —
// the production login must never see totals, payments or balances.
import { prisma, type Prisma, type OrderStatusV2, type ProductionStatus } from "./client";
import { readSheetRow } from "@/server/domain/import/sheetRow";
import { realPhone, customerLabelOf, contactLabelOf, telOf } from "@/lib/orderDisplay";

export type ProductionTab = "todo" | "progress" | "finished" | "delivered";
export const PRODUCTION_TABS: readonly ProductionTab[] = ["todo", "progress", "finished", "delivered"];

export type ProductionRow = {
  id: string;
  serialNo: number | null;
  orderDate: Date;
  deliveryDate: Date | null;
  /** The sheet's DELIVERY cell as typed (imported orders) — shown when there is no date. */
  deliveryNote: string | null;
  customer: string;
  contact: string;
  tel: string | null;
  productText: string | null;
  salesperson: string;
  notes: string | null;
  productionStatus: ProductionStatus;
  simpleStatus: OrderStatusV2;
  productionUpdatedAt: Date | null;
};

const DAY = 24 * 60 * 60 * 1000;

/** Delivered orders stay on the board for this many days. */
export const DELIVERED_WINDOW_DAYS = 30;

function deliveredSince(): Date {
  // completedAt is a calendar date (@db.Date): compare against IST "today" − 30 days at UTC midnight.
  const ist = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(today - DELIVERED_WINDOW_DAYS * DAY);
}

function tabWhere(tenantId: string, tab: ProductionTab): Prisma.OrderWhereInput {
  switch (tab) {
    case "todo":
      return { tenantId, simpleStatus: "PENDING", productionStatus: "NOT_STARTED" };
    case "progress":
      return { tenantId, simpleStatus: "PENDING", productionStatus: "IN_PROGRESS" };
    case "finished":
      return { tenantId, simpleStatus: "PENDING", productionStatus: "FINISHED" };
    case "delivered":
      return { tenantId, simpleStatus: "DELIVERED", completedAt: { gte: deliveredSince() } };
  }
}

/** Ids of orders whose sheet CUSTOMER / name / CONTACT cell contains `q` (case-insensitive). */
async function sheetRowMatches(tenantId: string, q: string): Promise<string[]> {
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order"
    WHERE "tenantId" = ${tenantId}
      AND "sheetRow" IS NOT NULL
      AND ("sheetRow"->>'customer' ILIKE ${like}
        OR "sheetRow"->>'name' ILIKE ${like}
        OR "sheetRow"->>'contact' ILIKE ${like})
    LIMIT 5000
  `;
  return rows.map((r) => r.id);
}

export async function listProductionOrders(opts: {
  tenantId: string;
  tab: ProductionTab;
  q?: string;
}): Promise<ProductionRow[]> {
  const where = tabWhere(opts.tenantId, opts.tab);
  const q = opts.q?.trim();
  if (q) {
    const sheetIds = await sheetRowMatches(opts.tenantId, q);
    const digits = q.replace(/\D/g, "");
    where.OR = [
      { productText: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { phoneE164: { contains: digits.length >= 3 ? digits : q } } },
      ...(sheetIds.length > 0 ? [{ id: { in: sheetIds } }] : []),
    ];
  }

  const orderBy: Prisma.OrderOrderByWithRelationInput[] =
    opts.tab === "delivered"
      ? // Recently delivered first.
        [{ completedAt: "desc" }, { orderDate: "desc" }]
      : // Overdue first, blank delivery dates last.
        [{ promisedDeliveryDate: { sort: "asc", nulls: "last" } }, { orderDate: "asc" }, { createdAt: "asc" }];

  const rows = await prisma.order.findMany({
    where,
    orderBy,
    take: 2000,
    select: {
      id: true,
      serialNo: true,
      orderDate: true,
      promisedDeliveryDate: true,
      productText: true,
      notes: true,
      sheetRow: true,
      productionStatus: true,
      productionUpdatedAt: true,
      simpleStatus: true,
      salesperson: { select: { name: true } },
      customer: { select: { name: true, phoneE164: true } },
    },
  });

  return rows.map((r) => {
    const sheetRow = readSheetRow(r.sheetRow);
    const phone = realPhone(r.customer.phoneE164);
    return {
      id: r.id,
      serialNo: r.serialNo,
      orderDate: r.orderDate,
      deliveryDate: r.promisedDeliveryDate,
      deliveryNote: sheetRow?.delivery?.trim() || null,
      customer: customerLabelOf(sheetRow, r.customer.name),
      contact: contactLabelOf(sheetRow, phone),
      tel: telOf(sheetRow, phone),
      productText: r.productText,
      salesperson: r.salesperson.name,
      notes: r.notes ?? sheetRow?.comments ?? null,
      productionStatus: r.productionStatus,
      simpleStatus: r.simpleStatus,
      productionUpdatedAt: r.productionUpdatedAt,
    };
  });
}

/** Order counts per board tab (search not applied). */
export async function countProductionTabs(tenantId: string): Promise<Record<ProductionTab, number>> {
  const [pending, delivered] = await Promise.all([
    prisma.order.groupBy({
      by: ["productionStatus"],
      where: { tenantId, simpleStatus: "PENDING" },
      _count: { _all: true },
    }),
    prisma.order.count({ where: tabWhere(tenantId, "delivered") }),
  ]);
  const by = (s: ProductionStatus) => pending.find((g) => g.productionStatus === s)?._count._all ?? 0;
  return {
    todo: by("NOT_STARTED"),
    progress: by("IN_PROGRESS"),
    finished: by("FINISHED"),
    delivered,
  };
}
