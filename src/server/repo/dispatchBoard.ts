// Dispatch-role read models (§4.2: Dispatch views orders with NO prices,
// §11.10 board). Explicit select shapes only — never spread a full Order row
// here; tests/integration/dispatch-dto.test.ts snapshots the JSON keys.
import { prisma, type Prisma } from "./client";
import {
  BOARD_COLUMNS,
  boardColumnFor,
  pickGoldCard,
  stuckInfo,
  type BoardColumn,
} from "@/server/domain/dispatch/dispatch";
import { istDateString } from "@/server/domain/payment/record";

export const DISPATCH_ORDER_SELECT = {
  id: true,
  number: true,
  status: true,
  orderDate: true,
  approvedAt: true,
  promisedDeliveryDate: true,
  notes: true,
  customer: { select: { name: true, businessName: true, phoneE164: true, city: true } },
  salesperson: { select: { name: true } },
  lines: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, description: true, qty: true, dispatchedQty: true },
  },
  dispatches: {
    orderBy: { dispatchedOn: "asc" },
    select: {
      id: true,
      dispatchedOn: true,
      transporter: true,
      lrNumber: true,
      vehicleNo: true,
      note: true,
      photoPaths: true,
      deliveredOn: true,
      lines: { select: { orderLineId: true, qty: true } },
    },
  },
} satisfies Prisma.OrderSelect;

type Row = Prisma.OrderGetPayload<{ select: typeof DISPATCH_ORDER_SELECT }>;

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type DispatchOrderDto = {
  id: string;
  number: string;
  status: string;
  orderDate: string;
  promisedDeliveryDate: string | null;
  notes: string | null;
  customer: { name: string; phoneE164: string; city: string | null };
  salespersonName: string;
  lines: { id: string; description: string; qty: number; dispatchedQty: number }[];
  dispatches: {
    id: string;
    dispatchedOn: string;
    transporter: string | null;
    lrNumber: string | null;
    vehicleNo: string | null;
    note: string | null;
    photoCount: number;
    deliveredOn: string | null;
    lines: { orderLineId: string; qty: number }[];
  }[];
};

export function toDispatchDto(o: Row): DispatchOrderDto {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    orderDate: iso(o.orderDate)!,
    promisedDeliveryDate: iso(o.promisedDeliveryDate),
    notes: o.notes,
    customer: {
      name: o.customer.businessName ?? o.customer.name,
      phoneE164: o.customer.phoneE164,
      city: o.customer.city,
    },
    salespersonName: o.salesperson.name,
    lines: o.lines,
    dispatches: o.dispatches.map((d) => ({
      id: d.id,
      dispatchedOn: iso(d.dispatchedOn)!,
      transporter: d.transporter,
      lrNumber: d.lrNumber,
      vehicleNo: d.vehicleNo,
      note: d.note,
      photoCount: d.photoPaths.length,
      deliveredOn: iso(d.deliveredOn),
      lines: d.lines,
    })),
  };
}

export async function getDispatchOrder(tenantId: string, id: string): Promise<DispatchOrderDto | null> {
  const row = await prisma.order.findFirst({ where: { tenantId, id }, select: DISPATCH_ORDER_SELECT });
  return row ? toDispatchDto(row) : null;
}

export type BoardCard = DispatchOrderDto & {
  column: BoardColumn;
  ageDays: number;
  stuck: boolean;
  late: boolean;
  daysLate: number;
  machines: number; // total qty on the order
  remaining: number; // qty still to ship
  gold: boolean;
};

export type DispatchBoard = { today: string; columns: Record<BoardColumn, BoardCard[]>; stuckCount: number };

export async function getDispatchBoard(opts: { tenantId: string; now?: Date }): Promise<DispatchBoard> {
  const today = istDateString(opts.now ?? new Date());
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: opts.tenantId },
    select: { productionAlertDays: true },
  });
  const alertDays = settings?.productionAlertDays ?? 10;

  const rows = await prisma.order.findMany({
    where: {
      tenantId: opts.tenantId,
      status: { in: ["CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_DISPATCHED", "DISPATCHED"] },
    },
    orderBy: { orderDate: "asc" },
    select: DISPATCH_ORDER_SELECT,
  });

  const cards: BoardCard[] = rows.map((r) => {
    const dto = toDispatchDto(r);
    const confirmedOn = istDateString(r.approvedAt ?? r.orderDate);
    const info = stuckInfo({ status: r.status, confirmedOn, promisedDeliveryDate: dto.promisedDeliveryDate }, today, alertDays);
    return {
      ...dto,
      column: boardColumnFor(r.status)!,
      ...info,
      machines: dto.lines.reduce((s, l) => s + l.qty, 0),
      remaining: dto.lines.reduce((s, l) => s + l.qty - l.dispatchedQty, 0),
      gold: false,
    };
  });
  const goldId = pickGoldCard(cards);
  const columns = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, [] as BoardCard[]])) as Record<BoardColumn, BoardCard[]>;
  for (const c of cards) {
    c.gold = c.id === goldId;
    columns[c.column].push(c);
  }
  // Oldest (most at risk) first inside each column.
  for (const c of BOARD_COLUMNS) columns[c].sort((a, b) => Number(b.stuck) - Number(a.stuck) || b.ageDays - a.ageDays);
  return { today, columns, stuckCount: cards.filter((c) => c.stuck).length };
}
