// Collect read model (§11.6): open balances grouped by customer, with the §5.4
// overdue rule, last follow-up and reminder cooldown per order.
import { realPhone } from "@/lib/orderDisplay";
import Decimal from "decimal.js";
import { prisma, type OrderStatus } from "./client";
import {
  overdueInfo,
  matchesFilter,
  reminderAvailableAt,
  type CollectFilter,
} from "@/server/domain/payment/collect";
import { istDateString } from "@/server/domain/payment/record";

export type CollectOrderRow = {
  id: string;
  number: string;
  status: OrderStatus;
  balanceDue: string;
  promisedPaymentDate: string | null;
  dueOn: string | null;
  overdue: boolean;
  daysOverdue: number;
  salespersonName: string;
  entityName: string;
  lastFollowUp: { channel: string; at: Date } | null;
  reminderBlockedUntil: Date | null;
};

export type CollectGroup = {
  customer: { id: string; name: string; phoneE164: string | null };
  total: string;
  overdue: boolean;
  maxDaysOverdue: number;
  lastFollowUp: { channel: string; at: Date } | null;
  orders: CollectOrderRow[];
};

export type CollectView = {
  today: string;
  generatedAt: number; // epoch ms the view was computed at (for "2d ago" labels)
  outstanding: string;
  counts: Record<CollectFilter, number>; // orders per chip
  groups: CollectGroup[];
};

export async function getCollectView(opts: {
  tenantId: string;
  salespersonScope?: string;
  filter: CollectFilter;
  now?: Date;
}): Promise<CollectView> {
  const now = opts.now ?? new Date();
  const today = istDateString(now);
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: opts.tenantId },
    select: { overdueGraceDays: true },
  });
  const grace = settings?.overdueGraceDays ?? 7;

  const orders = await prisma.order.findMany({
    where: {
      tenantId: opts.tenantId,
      ...(opts.salespersonScope ? { salespersonId: opts.salespersonScope } : {}),
      status: { not: "CANCELLED" },
      balanceDue: { gt: 0 },
    },
    orderBy: { orderDate: "asc" },
    select: {
      id: true,
      number: true,
      status: true,
      balanceDue: true,
      promisedPaymentDate: true,
      customer: { select: { id: true, name: true, businessName: true, phoneE164: true } },
      salesperson: { select: { name: true } },
      entity: { select: { name: true } },
      events: {
        where: { toStatus: "DELIVERED" },
        orderBy: { at: "asc" },
        take: 1,
        select: { at: true },
      },
      followUps: { orderBy: { at: "desc" }, take: 1, select: { channel: true, at: true } },
    },
  });

  // Latest WhatsApp reminder per order (cooldown), in one query.
  const reminders = await prisma.followUp.findMany({
    where: { orderId: { in: orders.map((o) => o.id) }, channel: "WHATSAPP" },
    orderBy: { at: "desc" },
    distinct: ["orderId"],
    select: { orderId: true, at: true },
  });
  const lastReminder = new Map(reminders.map((r) => [r.orderId, r.at]));

  const counts: Record<CollectFilter, number> = { all: 0, overdue: 0, week: 0, today: 0 };
  let outstanding = new Decimal(0);
  const groups = new Map<string, CollectGroup>();

  for (const o of orders) {
    const promised = o.promisedPaymentDate ? o.promisedPaymentDate.toISOString().slice(0, 10) : null;
    const delivered = o.events[0] ? istDateString(o.events[0].at) : null;
    const info = overdueInfo(
      { balanceDue: o.balanceDue.toString(), promisedPaymentDate: promised, deliveredOn: delivered },
      today,
      grace,
    );
    const row: CollectOrderRow = {
      id: o.id,
      number: o.number,
      status: o.status,
      balanceDue: o.balanceDue.toString(),
      promisedPaymentDate: promised,
      dueOn: info.dueOn,
      overdue: info.overdue,
      daysOverdue: info.daysOverdue,
      salespersonName: o.salesperson.name,
      entityName: o.entity.name,
      lastFollowUp: o.followUps[0] ?? null,
      reminderBlockedUntil: reminderAvailableAt(lastReminder.get(o.id) ?? null, now),
    };

    outstanding = outstanding.plus(row.balanceDue);
    for (const f of ["all", "overdue", "week", "today"] as const) {
      if (matchesFilter(f, row, today)) counts[f] += 1;
    }
    if (!matchesFilter(opts.filter, row, today)) continue;

    let g = groups.get(o.customer.id);
    if (!g) {
      g = {
        customer: {
          id: o.customer.id,
          name: o.customer.businessName ?? o.customer.name,
          phoneE164: realPhone(o.customer.phoneE164),
        },
        total: "0",
        overdue: false,
        maxDaysOverdue: 0,
        lastFollowUp: null,
        orders: [],
      };
      groups.set(o.customer.id, g);
    }
    g.total = new Decimal(g.total).plus(row.balanceDue).toString();
    g.overdue ||= row.overdue;
    g.maxDaysOverdue = Math.max(g.maxDaysOverdue, row.daysOverdue);
    if (row.lastFollowUp && (!g.lastFollowUp || row.lastFollowUp.at > g.lastFollowUp.at)) {
      g.lastFollowUp = row.lastFollowUp;
    }
    g.orders.push(row);
  }

  // Overdue customers first (most overdue on top), then by amount.
  const sorted = [...groups.values()].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      b.maxDaysOverdue - a.maxDaysOverdue ||
      new Decimal(b.total).comparedTo(a.total),
  );

  return { today, generatedAt: now.getTime(), outstanding: outstanding.toString(), counts, groups: sorted };
}
