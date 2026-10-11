// Historical order-book import orchestrator (spec §15).
// Reads the uploaded workbook, hands sheets to the pure parser, stores the
// result in ImportBatch for preview, and commits rows → customers + orders
// (+ a single VERIFIED payment per paid order) in one transaction per batch
// of 200.
import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import {
  prisma,
  type Prisma,
  type OrderStatus,
  type Role,
} from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";
import { allocateCounter } from "@/server/repo/counters";
import {
  orderNumber,
  orderCounterKey,
  receiptNumber,
  receiptCounterKey,
} from "@/server/domain/order/numbering";
import { fyLabelOf } from "@/server/domain/fy";
import { toDbString } from "@/server/domain/money";
import {
  parseOrderBook,
  matchSheetToUser,
  matchRoute,
  type ParsedOrder,
  type ParseResult,
  type SheetGrid,
  type RawCell,
} from "@/server/domain/import/orderBook";

const COMMIT_BATCH_SIZE = 200;

export type SheetAssignment =
  | { kind: "SALESPERSON"; salespersonId: string }
  | { kind: "SKIP" };

export type ParsePreviewInput = {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  fileName: string;
  buffer: ArrayBuffer; // raw .xlsx bytes
  assignments: Record<string, SheetAssignment>; // keyed by sheet name
};

export type CommitInput = {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  batchId: string;
  assignments: Record<string, SheetAssignment>;
  routeMap?: Array<{ keyword: string; accountId?: string; userId?: string }>;
  // Optional: only commit a subset of orders (ref → include).
  include?: Record<string, boolean>;
};

export type CommitSummary = {
  importedOrders: number;
  importedCustomers: number;
  importedPayments: number;
  skipped: number;
  errors: Array<{ ref: string; message: string }>;
};

// ───────── Preview ─────────

export async function previewImport(input: ParsePreviewInput) {
  if (input.actorRole !== "OWNER" && input.actorRole !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Only Owner or Admin can import the order book.");
  }
  if (input.buffer.byteLength === 0) {
    throw new AppError("VALIDATION", "The uploaded file is empty.");
  }
  if (input.buffer.byteLength > 20 * 1024 * 1024) {
    throw new AppError("VALIDATION", "The file is larger than 20 MB.");
  }

  const wb = new ExcelJS.Workbook();
  await (wb.xlsx as unknown as { load(data: ArrayBuffer): Promise<void> }).load(input.buffer);

  const sheets: SheetGrid[] = [];
  for (const ws of wb.worksheets) {
    const assignment = input.assignments[ws.name];
    if (assignment?.kind === "SKIP") continue;
    sheets.push({ name: ws.name, rows: worksheetToGrid(ws) });
  }

  const result = parseOrderBook(sheets);
  const summary = summarise(result);

  const batch = await prisma.importBatch.create({
    data: {
      tenantId: input.tenantId,
      fileName: input.fileName,
      status: "PARSED",
      summaryJson: summary as Prisma.InputJsonValue,
      rowsJson: serialiseOrders(result.orders) as Prisma.InputJsonValue,
      createdById: input.actorId,
    },
  });

  return { batchId: batch.id, summary, reconciliation: result.reconciliation };
}

// ───────── Commit ─────────

export async function commitImport(input: CommitInput): Promise<CommitSummary> {
  if (input.actorRole !== "OWNER" && input.actorRole !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Only Owner or Admin can import the order book.");
  }

  const batch = await prisma.importBatch.findFirst({
    where: { tenantId: input.tenantId, id: input.batchId },
  });
  if (!batch) throw new AppError("NOT_FOUND", "Import batch not found.");
  if (batch.status === "COMMITTED") {
    throw new AppError("CONFLICT", "This batch has already been committed.");
  }

  const parsed = batch.rowsJson as unknown as Array<SerialisedOrder>;
  const sheetToUser = new Map<string, string>();
  for (const [sheet, a] of Object.entries(input.assignments)) {
    if (a.kind === "SALESPERSON") sheetToUser.set(sheet, a.salespersonId);
  }

  // Default entity for the import — first active entity on the tenant.
  const defaultEntity = await prisma.billingEntity.findFirst({
    where: { tenantId: input.tenantId, active: true },
    orderBy: { code: "asc" },
  });
  if (!defaultEntity) throw new AppError("VALIDATION", "No active billing entity to attribute imported orders to.");

  const routeTargets = buildRouteTargets(input.routeMap ?? []);

  const summary: CommitSummary = {
    importedOrders: 0,
    importedCustomers: 0,
    importedPayments: 0,
    skipped: 0,
    errors: [],
  };

  const include = input.include ?? {};
  const effective = parsed.filter((o) => {
    if (include[o.ref] === false) return false;
    if (o.flags.includes("POSSIBLE_DUPLICATE") && include[o.ref] !== true) return false;
    const assignment = input.assignments[o.sheet];
    if (!assignment || assignment.kind === "SKIP") return false;
    return true;
  });

  // Batch inserts to keep each transaction small (spec §15 wizard step 4).
  for (let i = 0; i < effective.length; i += COMMIT_BATCH_SIZE) {
    const chunk = effective.slice(i, i + COMMIT_BATCH_SIZE);
    await prisma.$transaction(async (tx) => {
      for (const row of chunk) {
        try {
          const salespersonId = sheetToUser.get(row.sheet);
          if (!salespersonId) {
            summary.skipped++;
            continue;
          }
          await commitOne(tx, {
            tenantId: input.tenantId,
            actorId: input.actorId,
            entityId: defaultEntity.id,
            entityCode: defaultEntity.code,
            salespersonId,
            row,
            routeTargets,
          }, summary);
        } catch (e) {
          summary.errors.push({ ref: row.ref, message: (e as Error).message });
        }
      }
    });
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: summary.errors.length > 0 && summary.importedOrders === 0 ? "FAILED" : "COMMITTED",
      summaryJson: {
        ...(batch.summaryJson as object),
        committedAt: new Date().toISOString(),
        result: summary,
      } as Prisma.InputJsonValue,
    },
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "IMPORT_COMMIT",
    entity: "ImportBatch",
    entityId: batch.id,
    after: { summary },
  });

  return summary;
}

// ───────── Per-order commit ─────────

async function commitOne(
  tx: Prisma.TransactionClient,
  ctx: {
    tenantId: string;
    actorId: string;
    entityId: string;
    entityCode: string;
    salespersonId: string;
    row: SerialisedOrder;
    routeTargets: RouteTargets;
  },
  summary: CommitSummary,
): Promise<void> {
  const { row } = ctx;
  // Customer upsert by phone (fallback to synthetic phone when none).
  const phone = row.phone
    ? normaliseImportedPhone(row.phone)
    : `+91-import-${ctx.tenantId.slice(-6)}-${row.ref.replace(/[^A-Za-z0-9]/g, "")}`;
  let customer = await tx.customer.findUnique({
    where: { tenantId_phoneE164: { tenantId: ctx.tenantId, phoneE164: phone } },
  });
  if (!customer) {
    customer = await tx.customer.create({
      data: {
        tenantId: ctx.tenantId,
        phoneE164: phone,
        name: row.customerName,
        ownerUserId: ctx.salespersonId,
      },
    });
    summary.importedCustomers++;
  }

  const orderDate = new Date(`${row.date}T00:00:00.000Z`);
  const fy = fyLabelOf(orderDate);
  const seq = await allocateCounter(tx, {
    tenantId: ctx.tenantId,
    key: orderCounterKey(ctx.entityCode, fy),
  });
  const number = orderNumber(ctx.entityCode, fy, seq);

  const amount = new Decimal(row.amount);
  const advance = new Decimal(row.advance);
  const balance = new Decimal(row.balance);

  const importedStatus = statusForImport(row.status);
  const order = await tx.order.create({
    data: {
      tenantId: ctx.tenantId,
      number,
      entityId: ctx.entityId,
      customerId: customer.id,
      salespersonId: ctx.salespersonId,
      orderDate,
      status: importedStatus,
      subtotal: toDbString(amount),
      chargesTotal: "0",
      discount: "0",
      total: toDbString(amount),
      balanceDue: toDbString(balance),
      notes: row.flags.length > 0 ? `Imported — flags: ${row.flags.join(", ")}` : null,
      source: "IMPORT",
      importRef: row.ref,
      cancelReason: row.status === "CANCELLED" ? "OTHER" : null,
      cancelNote: row.cancelNote ?? null,
      createdById: ctx.actorId,
      lines: {
        create: (row.lines.length > 0 ? row.lines : ["Imported — details not itemised"]).map(
          (description, idx) => ({
            description: description.slice(0, 240),
            qty: 1,
            unitPrice:
              idx === 0 ? toDbString(amount) : "0", // put the whole value on the first line
            gstRate: "18",
            lineTotal: idx === 0 ? toDbString(amount) : "0",
            sortOrder: idx,
          }),
        ),
      },
      events: {
        create: [
          {
            actorId: ctx.actorId,
            type: "STATUS_CHANGE",
            toStatus: importedStatus,
            note: `Imported from ${row.ref}`,
          },
        ],
      },
    },
    select: { id: true, orderDate: true },
  });
  summary.importedOrders++;

  if (advance.gt(0)) {
    const route = matchRoute(row.route, ctx.routeTargets.list);
    const receiptSeq = await allocateCounter(tx, {
      tenantId: ctx.tenantId,
      key: receiptCounterKey(fy),
    });
    await tx.payment.create({
      data: {
        tenantId: ctx.tenantId,
        receiptNo: receiptNumber(fy, receiptSeq),
        orderId: order.id,
        type: balance.lte(0) ? "FINAL" : "ADVANCE",
        method: route?.method ?? "CASH",
        amount: toDbString(advance),
        paidOn: order.orderDate,
        receivedIntoAccountId: route?.accountId ?? null,
        receivedByUserId: route?.accountId ? null : route?.userId ?? ctx.salespersonId,
        referenceNo: row.route ?? null,
        // Spec §15.1: imported payments are VERIFIED when balance > 0 is still
        // PENDING, otherwise VERIFIED. Interpreting "imported payments are VERIFIED
        // (historical) except where balance > 0 and status is PENDING" literally.
        status: balance.gt(0) && row.status === "CONFIRMED" ? "PENDING_VERIFICATION" : "VERIFIED",
        verifiedById: ctx.actorId,
        verifiedAt: new Date(),
        note: "Imported — historical",
        createdById: ctx.actorId,
      },
    });
    summary.importedPayments++;
  }
}

// ───────── Helpers ─────────

type SerialisedOrder = Omit<ParsedOrder, "flags"> & { flags: ParsedOrder["flags"] };

function serialiseOrders(orders: ParsedOrder[]): SerialisedOrder[] {
  return orders.map((o) => ({ ...o }));
}

function summarise(result: ParseResult) {
  const perSheet: Record<string, { orders: number; value: string; issues: number; duplicates: number }> = {};
  const flagCounts: Record<string, number> = {};
  let grandTotal = new Decimal(0);
  for (const o of result.orders) {
    const amount = new Decimal(o.amount);
    grandTotal = grandTotal.plus(amount);
    perSheet[o.sheet] ??= { orders: 0, value: "0", issues: 0, duplicates: 0 };
    perSheet[o.sheet]!.orders++;
    perSheet[o.sheet]!.value = new Decimal(perSheet[o.sheet]!.value).plus(amount).toString();
    if (o.flags.length > 0) perSheet[o.sheet]!.issues++;
    if (o.flags.includes("POSSIBLE_DUPLICATE")) perSheet[o.sheet]!.duplicates++;
    for (const f of o.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  }
  return {
    orderCount: result.orders.length,
    grandTotal: grandTotal.toString(),
    perSheet,
    flagCounts,
    reconciliation: result.reconciliation,
  };
}

function statusForImport(s: ParsedOrder["status"]): OrderStatus {
  switch (s) {
    case "DELIVERED":
    case "CANCELLED":
    case "CONFIRMED":
    case "CLOSED":
    case "PARTIALLY_DISPATCHED":
      return s;
    default:
      return "CONFIRMED";
  }
}

type RouteTargets = {
  list: Array<{
    keyword: string;
    target: { accountId?: string; userId?: string; method: "CASH" | "UPI" | "BANK_TRANSFER" };
  }>;
};

function buildRouteTargets(mapping: CommitInput["routeMap"]): RouteTargets {
  const list = (mapping ?? []).map((m) => ({
    keyword: m.keyword,
    target: {
      accountId: m.accountId,
      userId: m.userId,
      method: /gpay|upi/i.test(m.keyword) ? ("UPI" as const) : m.accountId ? ("BANK_TRANSFER" as const) : ("CASH" as const),
    },
  }));
  return { list };
}

function normaliseImportedPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits || "0"}`;
}

function worksheetToGrid(ws: ExcelJS.Worksheet): RawCell[][] {
  const rows: RawCell[][] = [];
  const max = Math.max(ws.rowCount, ws.actualRowCount ?? 0);
  for (let r = 1; r <= max; r++) {
    const row = ws.getRow(r);
    const out: RawCell[] = [];
    const cols = Math.max(row.actualCellCount ?? 0, ws.actualColumnCount ?? 0);
    for (let c = 1; c <= cols; c++) {
      out.push(cellToRaw(row.getCell(c)));
    }
    rows.push(out);
  }
  return rows;
}

function cellToRaw(cell: ExcelJS.Cell): RawCell {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "formula" in v) {
    const result = (v as { formula: string; result?: unknown }).result;
    return {
      formula: (v as { formula: string }).formula,
      result:
        result === null || result === undefined
          ? null
          : result instanceof Date
            ? result
            : typeof result === "string" || typeof result === "number" || typeof result === "boolean"
              ? result
              : null,
    };
  }
  if (typeof v === "object" && "text" in v) return (v as { text: string }).text;
  if (typeof v === "object" && "richText" in v) {
    return (v as { richText: Array<{ text: string }> }).richText.map((p) => p.text).join("");
  }
  return null;
}
