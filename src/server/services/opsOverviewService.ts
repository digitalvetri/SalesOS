// Spec §6 — operations overview for the admin dashboard and the employee home:
// delivery follow-up, donut data, production pipeline and service summary.
//
// Definitions (business dates are IST calendar dates; `date` columns are
// compared as UTC-midnight Dates, see domain/dashboard/overview.ts):
// - Follow-up = every PENDING order (not delivered / cancelled), grouped by
//   `promisedDeliveryDate` (orders without one land in "No date").
// - Period = `monthYm` ("2026-10") or `year` (2026) when given, else the
//   current IST month. It drives:
//   · status — orders BOOKED in the period (by orderDate), split
//     Pending (not started) / On progress / Finished (awaiting delivery) /
//     Delivered / Cancelled — the same orders the period KPI tiles describe;
//   · paymentModes — net money received in the period (by paidOn), status not
//     REJECTED, refunds subtracted, non-cancelled orders, grouped by method;
//   · salesByEmployee — Σ total of non-cancelled orders booked in the period
//     per salesperson (admin only; empty when scoped to one salesperson).
// - Pipeline = live state, not period-bound: all pending orders by production
//   status, plus orders delivered (completedAt) in the current IST month.
// - Service = pending requests (all time), done this IST month (doneAt), and
//   free vs paid among requests raised this IST month. An employee sees only
//   the requests they raised (createdById).
import Decimal from "decimal.js";
import { prisma, type Prisma } from "@/server/repo/client";
import { dateOnly, displayCustomerName, ymdOf } from "@/server/domain/dashboard/overview";
import { groupFollowUps, type FollowUpGroups } from "@/server/domain/dashboard/followUp";
import type { StatusCounts } from "@/server/domain/dashboard/pies";

export type OpsOverview = {
  followUps: FollowUpGroups;
  status: StatusCounts;
  paymentModes: { mode: string; amount: string }[];
  salesByEmployee: { name: string; value: string }[];
  pipeline: { notStarted: number; inProgress: number; finishedAwaitingDelivery: number; deliveredThisMonth: number };
  service: { pending: number; doneThisMonth: number; free: number; paid: number };
};

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${ym}-01`, to: `${next}-01` };
}

/** IST midnight of a business date as an instant (for timestamp columns). */
const istInstant = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`);

export async function opsOverview(opts: {
  tenantId: string;
  salespersonId?: string;
  todayYmd: string;
  monthYm?: string;
  year?: number;
}): Promise<OpsOverview> {
  const { tenantId, salespersonId, todayYmd } = opts;
  const scope: Prisma.OrderWhereInput = { tenantId, ...(salespersonId ? { salespersonId } : {}) };

  const period = opts.monthYm
    ? monthRange(opts.monthYm)
    : opts.year
      ? { from: `${opts.year}-01-01`, to: `${opts.year + 1}-01-01` }
      : monthRange(todayYmd.slice(0, 7));
  const periodDates = { gte: dateOnly(period.from), lt: dateOnly(period.to) };
  const cur = monthRange(todayYmd.slice(0, 7));
  const curDates = { gte: dateOnly(cur.from), lt: dateOnly(cur.to) };
  const curInstants = { gte: istInstant(cur.from), lt: istInstant(cur.to) };
  const serviceScope: Prisma.ServiceRequestWhereInput = { tenantId, ...(salespersonId ? { createdById: salespersonId } : {}) };

  const [pendingOrders, statusGroups, payGroups, empGroups, deliveredThisMonth, svcPending, svcDone, svcTypes] = await Promise.all([
    prisma.order.findMany({
      where: { ...scope, simpleStatus: "PENDING" },
      orderBy: [{ promisedDeliveryDate: "asc" }, { orderDate: "asc" }],
      select: {
        id: true,
        promisedDeliveryDate: true,
        productText: true,
        productionStatus: true,
        sheetRow: true,
        customer: { select: { name: true } },
        salesperson: { select: { name: true } },
      },
    }),
    prisma.order.groupBy({
      by: ["simpleStatus", "productionStatus"],
      where: { ...scope, orderDate: periodDates },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ["method", "type"],
      where: {
        tenantId,
        status: { not: "REJECTED" },
        paidOn: periodDates,
        order: { simpleStatus: { not: "CANCELLED" }, ...(salespersonId ? { salespersonId } : {}) },
      },
      _sum: { amount: true },
    }),
    salespersonId
      ? Promise.resolve([])
      : prisma.order.groupBy({
          by: ["salespersonId"],
          where: { ...scope, simpleStatus: { not: "CANCELLED" }, orderDate: periodDates },
          _sum: { total: true },
        }),
    prisma.order.count({ where: { ...scope, simpleStatus: "DELIVERED", completedAt: curDates } }),
    prisma.serviceRequest.count({ where: { ...serviceScope, status: "PENDING" } }),
    prisma.serviceRequest.count({ where: { ...serviceScope, status: "DONE", doneAt: curInstants } }),
    prisma.serviceRequest.groupBy({
      by: ["serviceType"],
      where: { ...serviceScope, createdAt: curInstants },
      _count: { _all: true },
    }),
  ]);

  // ── Follow-up ──
  const followUps = groupFollowUps(
    pendingOrders.map((o) => ({
      id: o.id,
      deliveryDate: o.promisedDeliveryDate ? ymdOf(o.promisedDeliveryDate) : null,
      customer: displayCustomerName(o.sheetRow, o.customer.name),
      productText: o.productText,
      salesperson: o.salesperson.name,
      productionStatus: o.productionStatus,
    })),
    todayYmd,
  );

  // ── Status split (orders booked in the period) ──
  const status: StatusCounts = { pending: 0, inProgress: 0, finished: 0, delivered: 0, cancelled: 0 };
  for (const g of statusGroups) {
    const n = g._count._all;
    if (g.simpleStatus === "DELIVERED") status.delivered += n;
    else if (g.simpleStatus === "CANCELLED") status.cancelled += n;
    else if (g.productionStatus === "IN_PROGRESS") status.inProgress += n;
    else if (g.productionStatus === "FINISHED") status.finished += n;
    else status.pending += n;
  }

  // ── Payment modes (received in the period, refunds subtract) ──
  const byMode = new Map<string, Decimal>();
  for (const g of payGroups) {
    const amt = new Decimal(g._sum.amount?.toString() ?? "0");
    byMode.set(g.method, (byMode.get(g.method) ?? new Decimal(0)).plus(g.type === "REFUND" ? amt.neg() : amt));
  }
  const paymentModes = [...byMode].map(([mode, amount]) => ({ mode, amount: amount.toFixed(2) }));

  // ── Sales by employee (admin) ──
  let salesByEmployee: { name: string; value: string }[] = [];
  if (empGroups.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: empGroups.map((g) => g.salespersonId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    salesByEmployee = empGroups.map((g) => ({
      name: nameOf.get(g.salespersonId) ?? "—",
      value: g._sum.total?.toString() ?? "0",
    }));
  }

  // ── Pipeline (live) ──
  const pipeline = { notStarted: 0, inProgress: 0, finishedAwaitingDelivery: 0, deliveredThisMonth };
  for (const o of pendingOrders) {
    if (o.productionStatus === "IN_PROGRESS") pipeline.inProgress += 1;
    else if (o.productionStatus === "FINISHED") pipeline.finishedAwaitingDelivery += 1;
    else pipeline.notStarted += 1;
  }

  const typeCount = (t: "FREE" | "PAID") => svcTypes.find((g) => g.serviceType === t)?._count._all ?? 0;

  return {
    followUps,
    status,
    paymentModes,
    salesByEmployee,
    pipeline,
    service: { pending: svcPending, doneThisMonth: svcDone, free: typeCount("FREE"), paid: typeCount("PAID") },
  };
}
