// §9 dashboard metrics — one function per metric, each matching the spec's
// definition exactly. All money values exclude CANCELLED orders unless stated.
// `entityId` narrows to one billing entity (KI / KFM); omit for both.
import Decimal from "decimal.js";
import { prisma, type CancelReason, type Prisma } from "@/server/repo/client";
import { overdueInfo } from "@/server/domain/payment/collect";
import { istDateString } from "@/server/domain/payment/record";
import { stuckInfo } from "@/server/domain/dispatch/dispatch";
import {
  AGING_BUCKETS,
  agingBucket,
  last12Months,
  pctChange,
  previousPeriod,
  type AgingBucket,
  type Period,
} from "@/server/domain/dashboard/period";

export type Scope = { tenantId: string; entityId?: string };
type Range = { from: string; to: string };

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dateIn = (r: Range): Prisma.DateTimeFilter => ({ gte: d(r.from), lte: d(r.to) });
const sumStr = (v: Prisma.Decimal | null | undefined) => (v ?? new Decimal(0)).toString();
const orderScope = (s: Scope): Prisma.OrderWhereInput => ({
  tenantId: s.tenantId,
  ...(s.entityId ? { entityId: s.entityId } : {}),
});

// ───────── Booked ─────────

/** §9 Booked: Σ order.total where orderDate in period (non-cancelled). */
export async function bookedTotal(s: Scope, r: Range): Promise<string> {
  const agg = await prisma.order.aggregate({
    where: { ...orderScope(s), status: { not: "CANCELLED" }, orderDate: dateIn(r) },
    _sum: { total: true },
  });
  return sumStr(agg._sum.total);
}

export async function booked(s: Scope, p: Period) {
  const [value, prev] = await Promise.all([bookedTotal(s, p), bookedTotal(s, previousPeriod(p))]);
  return { value, previous: prev, changePct: pctChange(Number(value), Number(prev)) };
}

// ───────── Collected (verified) ─────────

/**
 * §9 Collected (verified): Σ payment.amount (type ≠ REFUND) where status = VERIFIED
 * and paidOn in period, minus verified refunds in period.
 */
export async function collectedVerified(s: Scope, r: Range): Promise<string> {
  const base: Prisma.PaymentWhereInput = {
    tenantId: s.tenantId,
    status: "VERIFIED",
    paidOn: dateIn(r),
    ...(s.entityId ? { order: { entityId: s.entityId } } : {}),
  };
  const [inflow, refunds] = await Promise.all([
    prisma.payment.aggregate({ where: { ...base, type: { not: "REFUND" } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { ...base, type: "REFUND" }, _sum: { amount: true } }),
  ]);
  return new Decimal(sumStr(inflow._sum.amount)).minus(sumStr(refunds._sum.amount)).toString();
}

// ───────── Awaiting verification ─────────

/** §9 Awaiting verification: Σ amount, count of PENDING_VERIFICATION payments (all time). Refunds are money out, so excluded. */
export async function awaitingVerification(s: Scope) {
  const agg = await prisma.payment.aggregate({
    where: {
      tenantId: s.tenantId,
      status: "PENDING_VERIFICATION",
      type: { not: "REFUND" },
      ...(s.entityId ? { order: { entityId: s.entityId } } : {}),
    },
    _sum: { amount: true },
    _count: true,
  });
  return { value: sumStr(agg._sum.amount), count: agg._count };
}

// ───────── Cash with staff ─────────

/** §9 Cash with staff: non-rejected payments with receivedByUserId and depositedOn null, grouped by person (all time). */
export async function cashWithStaff(s: Scope) {
  const rows = await prisma.payment.groupBy({
    by: ["receivedByUserId"],
    where: {
      tenantId: s.tenantId,
      receivedByUserId: { not: null },
      depositedOn: null,
      status: { not: "REJECTED" },
      type: { not: "REFUND" },
      ...(s.entityId ? { order: { entityId: s.entityId } } : {}),
    },
    _sum: { amount: true },
    _count: true,
  });
  const users = await prisma.user.findMany({
    where: { tenantId: s.tenantId, id: { in: rows.map((r) => r.receivedByUserId!) } },
    select: { id: true, name: true },
  });
  const name = new Map(users.map((u) => [u.id, u.name]));
  const people = rows
    .map((r) => ({ userId: r.receivedByUserId!, name: name.get(r.receivedByUserId!) ?? "—", amount: sumStr(r._sum.amount), count: r._count }))
    .sort((a, b) => Number(b.amount) - Number(a.amount));
  const value = people.reduce((t, p) => t.plus(p.amount), new Decimal(0)).toString();
  return { value, count: people.length, people };
}

// ───────── Outstanding / overdue / refunds due ─────────

/**
 * §9 Outstanding: Σ balanceDue where balanceDue > 0, non-cancelled (all time).
 * Overdue: outstanding filtered by §5.4, with aging buckets 0–15 / 16–30 / 31–60 / 60+.
 * Refunds due: negative balances, reported separately.
 */
export async function outstanding(s: Scope, now = new Date()) {
  const today = istDateString(now);
  const [settings, open, refunds] = await Promise.all([
    prisma.tenantSettings.findUnique({ where: { tenantId: s.tenantId }, select: { overdueGraceDays: true } }),
    prisma.order.findMany({
      where: { ...orderScope(s), status: { not: "CANCELLED" }, balanceDue: { gt: 0 } },
      select: {
        balanceDue: true,
        promisedPaymentDate: true,
        events: { where: { toStatus: "DELIVERED" }, orderBy: { at: "asc" }, take: 1, select: { at: true } },
      },
    }),
    prisma.order.aggregate({ where: { ...orderScope(s), balanceDue: { lt: 0 } }, _sum: { balanceDue: true }, _count: true }),
  ]);
  const grace = settings?.overdueGraceDays ?? 7;
  let value = new Decimal(0);
  let overdue = new Decimal(0);
  let overdueCount = 0;
  const aging = Object.fromEntries(AGING_BUCKETS.map((b) => [b, new Decimal(0)])) as Record<AgingBucket, Decimal>;
  for (const o of open) {
    value = value.plus(o.balanceDue.toString());
    const info = overdueInfo(
      {
        balanceDue: o.balanceDue.toString(),
        promisedPaymentDate: o.promisedPaymentDate ? o.promisedPaymentDate.toISOString().slice(0, 10) : null,
        deliveredOn: o.events[0] ? istDateString(o.events[0].at) : null,
      },
      today,
      grace,
    );
    if (info.overdue) {
      overdue = overdue.plus(o.balanceDue.toString());
      overdueCount += 1;
      const b = agingBucket(info.daysOverdue);
      aging[b] = aging[b].plus(o.balanceDue.toString());
    }
  }
  return {
    value: value.toString(),
    count: open.length,
    overdue: overdue.toString(),
    overdueCount,
    aging: AGING_BUCKETS.map((b) => ({ bucket: b, amount: aging[b].toString() })),
    refundsDue: new Decimal(sumStr(refunds._sum.balanceDue)).abs().toString(),
    refundsDueCount: refunds._count,
  };
}

// ───────── Stuck / approvals / needs action ─────────

/** §9 Stuck orders: §5.5 rule. Count + list. */
export async function stuckOrders(s: Scope, now = new Date()) {
  const today = istDateString(now);
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId: s.tenantId }, select: { productionAlertDays: true } });
  const rows = await prisma.order.findMany({
    where: { ...orderScope(s), status: { in: ["CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_DISPATCHED"] } },
    select: { id: true, number: true, status: true, orderDate: true, approvedAt: true, promisedDeliveryDate: true, customer: { select: { name: true, businessName: true } } },
  });
  const list = rows
    .map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      customer: r.customer.businessName ?? r.customer.name,
      ...stuckInfo(
        {
          status: r.status,
          confirmedOn: istDateString(r.approvedAt ?? r.orderDate),
          promisedDeliveryDate: r.promisedDeliveryDate ? r.promisedDeliveryDate.toISOString().slice(0, 10) : null,
        },
        today,
        settings?.productionAlertDays ?? 10,
      ),
    }))
    .filter((r) => r.stuck)
    .sort((a, b) => b.ageDays - a.ageDays);
  return { count: list.length, list };
}

/** §9 Pending approvals: count PENDING_APPROVAL. */
export async function pendingApprovals(s: Scope) {
  return prisma.order.count({ where: { ...orderScope(s), status: "PENDING_APPROVAL" } });
}

/** Open cancel requests: a CANCEL_REQUEST event with no later approval/rejection or status change. */
export async function pendingCancelRequests(s: Scope) {
  const reqs = await prisma.orderEvent.findMany({
    where: { type: "CANCEL_REQUEST", order: { ...orderScope(s), status: { not: "CANCELLED" } } },
    select: { orderId: true, at: true },
  });
  if (reqs.length === 0) return 0;
  const resolved = await prisma.orderEvent.findMany({
    where: {
      orderId: { in: reqs.map((r) => r.orderId) },
      type: { in: ["CANCEL_APPROVED", "CANCEL_REJECTED"] },
    },
    select: { orderId: true, at: true },
  });
  const open = new Set<string>();
  for (const r of reqs) {
    if (!resolved.some((x) => x.orderId === r.orderId && x.at > r.at)) open.add(r.orderId);
  }
  return open.size;
}

// ───────── Leaderboard ─────────

/**
 * §9 Sales leaderboard: per salesperson — booked, target, % achieved, orders,
 * avg order value, collected (verified, on their orders) for the period.
 */
export async function salesLeaderboard(s: Scope, r: Range) {
  const [sales, bookedRows, collectedRows, refundRows, targets] = await Promise.all([
    prisma.user.findMany({ where: { tenantId: s.tenantId, role: "SALES", active: true }, select: { id: true, name: true } }),
    prisma.order.groupBy({
      by: ["salespersonId"],
      where: { ...orderScope(s), status: { not: "CANCELLED" }, orderDate: dateIn(r) },
      _sum: { total: true },
      _count: true,
    }),
    prisma.$queryRaw<{ salespersonId: string; amount: Prisma.Decimal }[]>`
      SELECT o."salespersonId", SUM(p.amount) AS amount
      FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
      WHERE p."tenantId" = ${s.tenantId} AND p.status = 'VERIFIED' AND p.type <> 'REFUND'
        AND p."paidOn" BETWEEN ${d(r.from)}::date AND ${d(r.to)}::date
        AND (${s.entityId ?? null}::text IS NULL OR o."entityId" = ${s.entityId ?? null})
      GROUP BY o."salespersonId"`,
    prisma.$queryRaw<{ salespersonId: string; amount: Prisma.Decimal }[]>`
      SELECT o."salespersonId", SUM(p.amount) AS amount
      FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
      WHERE p."tenantId" = ${s.tenantId} AND p.status = 'VERIFIED' AND p.type = 'REFUND'
        AND p."paidOn" BETWEEN ${d(r.from)}::date AND ${d(r.to)}::date
        AND (${s.entityId ?? null}::text IS NULL OR o."entityId" = ${s.entityId ?? null})
      GROUP BY o."salespersonId"`,
    // Targets are monthly (BR-15): sum every month that starts inside the period.
    prisma.salesTarget.groupBy({
      by: ["userId"],
      where: { tenantId: s.tenantId, month: { gte: d(`${r.from.slice(0, 7)}-01`), lte: d(r.to) } },
      _sum: { amount: true },
    }),
  ]);
  const bookedBy = new Map(bookedRows.map((b) => [b.salespersonId, { total: sumStr(b._sum.total), count: b._count }]));
  const refundBy = new Map(refundRows.map((x) => [x.salespersonId, x.amount.toString()]));
  const collectedBy = new Map(collectedRows.map((c) => [c.salespersonId, new Decimal(c.amount.toString()).minus(refundBy.get(c.salespersonId) ?? 0).toString()]));
  const targetBy = new Map(targets.map((t) => [t.userId, sumStr(t._sum.amount)]));

  return sales
    .map((u) => {
      const b = bookedBy.get(u.id) ?? { total: "0", count: 0 };
      const target = targetBy.get(u.id) ?? "0";
      return {
        userId: u.id,
        name: u.name,
        booked: b.total,
        target,
        pct: Number(target) > 0 ? Math.round((Number(b.total) / Number(target)) * 100) : null,
        orders: b.count,
        avgOrder: b.count > 0 ? new Decimal(b.total).div(b.count).toDecimalPlaces(0).toString() : "0",
        collected: collectedBy.get(u.id) ?? "0",
      };
    })
    .sort((a, b) => Number(b.booked) - Number(a.booked) || a.name.localeCompare(b.name));
}

// ───────── Trend / products / customers / cancellations ─────────

/** §9 Booked trend: booked per month, last 12 months (IST months, non-cancelled). */
export async function bookedTrend(s: Scope, now = new Date()) {
  const months = last12Months(istDateString(now));
  const rows = await prisma.$queryRaw<{ month: string; total: Prisma.Decimal }[]>`
    SELECT to_char("orderDate", 'YYYY-MM') AS month, SUM(total) AS total
    FROM "Order"
    WHERE "tenantId" = ${s.tenantId} AND status <> 'CANCELLED'
      AND "orderDate" >= ${d(`${months[0]}-01`)}::date
      AND (${s.entityId ?? null}::text IS NULL OR "entityId" = ${s.entityId ?? null})
    GROUP BY 1`;
  const by = new Map(rows.map((r) => [r.month, r.total.toString()]));
  return months.map((m) => ({ month: m, booked: by.get(m) ?? "0" }));
}

/** §9 Top products: by qty and by value in period (non-cancelled orders). Custom lines group by description. */
export async function topProducts(s: Scope, r: Range, limit = 5) {
  const rows = await prisma.$queryRaw<{ key: string; name: string; qty: bigint; value: Prisma.Decimal }[]>`
    SELECT COALESCE(l."productId", 'custom:' || l.description) AS key,
           COALESCE(MAX(p.name), l.description) AS name,
           SUM(l.qty) AS qty, SUM(l."lineTotal") AS value
    FROM "OrderLine" l
    JOIN "Order" o ON o.id = l."orderId"
    LEFT JOIN "Product" p ON p.id = l."productId"
    WHERE o."tenantId" = ${s.tenantId} AND o.status <> 'CANCELLED'
      AND o."orderDate" BETWEEN ${d(r.from)}::date AND ${d(r.to)}::date
      AND (${s.entityId ?? null}::text IS NULL OR o."entityId" = ${s.entityId ?? null})
    GROUP BY COALESCE(l."productId", 'custom:' || l.description), l."productId", l.description`;
  // Merge rows that split on description for the same product.
  const merged = new Map<string, { key: string; name: string; qty: number; value: Decimal }>();
  for (const x of rows) {
    const m = merged.get(x.key) ?? { key: x.key, name: x.name, qty: 0, value: new Decimal(0) };
    m.qty += Number(x.qty);
    m.value = m.value.plus(x.value.toString());
    merged.set(x.key, m);
  }
  const all = [...merged.values()].map((m) => ({ ...m, value: m.value.toString() }));
  return {
    byQty: [...all].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)).slice(0, limit),
    byValue: [...all].sort((a, b) => Number(b.value) - Number(a.value) || a.name.localeCompare(b.name)).slice(0, limit),
  };
}

/** §9 Top customers: by booked value in period; repeat customers = ≥ 2 orders all time. */
export async function topCustomers(s: Scope, r: Range, limit = 5) {
  const [rows, repeat] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerId"],
      where: { ...orderScope(s), status: { not: "CANCELLED" }, orderDate: dateIn(r) },
      _sum: { total: true },
      _count: true,
    }),
    prisma.order.groupBy({
      by: ["customerId"],
      where: { ...orderScope(s), status: { not: "CANCELLED" } },
      _count: true,
      having: { customerId: { _count: { gte: 2 } } },
    }),
  ]);
  const top = rows.sort((a, b) => Number(b._sum.total ?? 0) - Number(a._sum.total ?? 0)).slice(0, limit);
  const customers = await prisma.customer.findMany({
    where: { id: { in: top.map((t) => t.customerId) } },
    select: { id: true, name: true, businessName: true },
  });
  const name = new Map(customers.map((c) => [c.id, c.businessName ?? c.name]));
  return {
    top: top.map((t) => ({ customerId: t.customerId, name: name.get(t.customerId) ?? "—", booked: sumStr(t._sum.total), orders: t._count })),
    repeatCustomers: repeat.length,
  };
}

/** §9 Cancellations: count + value by reason, for orders cancelled in the period. */
export async function cancellations(s: Scope, r: Range) {
  const events = await prisma.orderEvent.findMany({
    where: {
      type: "STATUS_CHANGE",
      toStatus: "CANCELLED",
      at: { gte: d(r.from), lt: new Date(d(r.to).getTime() + 86_400_000) },
      order: orderScope(s),
    },
    select: { order: { select: { id: true, total: true, cancelReason: true } } },
  });
  const seen = new Set<string>();
  const by = new Map<CancelReason | "UNKNOWN", { count: number; value: Decimal }>();
  for (const e of events) {
    if (seen.has(e.order.id)) continue;
    seen.add(e.order.id);
    const k = e.order.cancelReason ?? "UNKNOWN";
    const cur = by.get(k) ?? { count: 0, value: new Decimal(0) };
    by.set(k, { count: cur.count + 1, value: cur.value.plus(e.order.total.toString()) });
  }
  const reasons = [...by.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, value: v.value.toString() }))
    .sort((a, b) => b.count - a.count || Number(b.value) - Number(a.value));
  return { count: seen.size, value: reasons.reduce((t, x) => t.plus(x.value), new Decimal(0)).toString(), reasons };
}

// ───────── Everything for §11.7 ─────────

export async function adminDashboard(s: Scope, p: Period, now = new Date()) {
  const [bookedM, collected, awaiting, cash, out, stuck, approvals, cancelReqs, leaderboard, trend, products, customers, cancels] =
    await Promise.all([
      booked(s, p),
      collectedVerified(s, p),
      awaitingVerification(s),
      cashWithStaff(s),
      outstanding(s, now),
      stuckOrders(s, now),
      pendingApprovals(s),
      pendingCancelRequests(s),
      salesLeaderboard(s, p),
      bookedTrend(s, now),
      topProducts(s, p),
      topCustomers(s, p),
      cancellations(s, p),
    ]);
  return {
    period: p,
    booked: bookedM,
    collected,
    awaiting,
    cash,
    outstanding: out,
    needsAction: { approvals, toVerify: awaiting.count, stuck: stuck.count, cancelRequests: cancelReqs, refundsDue: out.refundsDueCount },
    stuck,
    leaderboard,
    trend,
    products,
    customers,
    cancellations: cancels,
  };
}
export type AdminDashboard = Awaited<ReturnType<typeof adminDashboard>>;
