// Service requests (spec §5). Sales/Admin log a customer complaint; Production
// (and Admin) mark it Done or reopen it. Number SR-0001 per tenant.
import { prisma, type Prisma } from "@/server/repo/client";
import { allocateCounter } from "@/server/repo/counters";
import { writeAudit } from "@/server/repo/audit";
import { normalizePhone, PhoneParseError } from "@/server/domain/phone";
import { AppError } from "@/lib/errors";
import type { ActorRole } from "@/server/domain/v1_1/workflow";

export type ServiceInput = {
  customerName: string;
  phone: string;
  address?: string | null;
  product?: string | null;
  complaint: string;
  serviceType: "FREE" | "PAID";
  notes?: string | null;
};

export type ServiceStatusValue = "PENDING" | "DONE";

/** Indian mobile as E.164 (+91XXXXXXXXXX), or null if it isn't one. */
function indianMobileE164(raw: string): string | null {
  try {
    const { e164 } = normalizePhone(raw);
    return /^\+91\d{10}$/.test(e164) ? e164 : null;
  } catch (e) {
    if (e instanceof PhoneParseError) return null;
    throw e;
  }
}

/** First problem with the form, in field order, or null when it can be saved. */
export function validateServiceInput(i: ServiceInput): string | null {
  if (!i.customerName?.trim()) return "Enter the customer's name.";
  if (!indianMobileE164(i.phone ?? "")) return "Enter a 10-digit mobile number.";
  if (!i.complaint?.trim()) return "Describe the complaint.";
  return null;
}

const blankToNull = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

export async function createServiceRequest(ctx: { tenantId: string; actorId: string }, i: ServiceInput) {
  const problem = validateServiceInput(i);
  if (problem) throw new AppError("VALIDATION", problem);
  const phone = indianMobileE164(i.phone)!;

  return prisma.$transaction(
    async (tx) => {
      const n = await allocateCounter(tx, { tenantId: ctx.tenantId, key: "SR" });
      const sr = await tx.serviceRequest.create({
        data: {
          tenantId: ctx.tenantId,
          number: `SR-${String(n).padStart(4, "0")}`,
          customerName: i.customerName.trim(),
          phone,
          address: blankToNull(i.address),
          product: blankToNull(i.product),
          complaint: i.complaint.trim(),
          serviceType: i.serviceType,
          notes: blankToNull(i.notes),
          createdById: ctx.actorId,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        action: "SERVICE_CREATE",
        entity: "ServiceRequest",
        entityId: sr.id,
        after: { number: sr.number, customerName: sr.customerName, serviceType: sr.serviceType },
      });
      return sr;
    },
    { isolationLevel: "Serializable" },
  );
}

const CAN_UPDATE: ReadonlySet<ActorRole> = new Set<ActorRole>(["PRODUCTION", "OWNER", "ADMIN"]);

export async function setServiceStatus(
  ctx: { tenantId: string; actorId: string; actorRole: ActorRole },
  id: string,
  status: ServiceStatusValue,
) {
  if (!CAN_UPDATE.has(ctx.actorRole)) {
    throw new AppError("FORBIDDEN", "Only Production or Admin can update a service request.");
  }
  return prisma.$transaction(async (tx) => {
    const before = await tx.serviceRequest.findFirst({
      where: { tenantId: ctx.tenantId, id },
      select: { id: true, status: true, doneAt: true, doneById: true },
    });
    if (!before) throw new AppError("NOT_FOUND", "Service request not found.");
    const done = status === "DONE";
    const sr = await tx.serviceRequest.update({
      where: { id },
      data: { status, doneAt: done ? new Date() : null, doneById: done ? ctx.actorId : null },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      actorId: ctx.actorId,
      action: "SERVICE_STATUS",
      entity: "ServiceRequest",
      entityId: id,
      before: { status: before.status },
      after: { status },
    });
    return sr;
  });
}

export async function listServiceRequests(opts: {
  tenantId: string;
  createdById?: string;
  status?: ServiceStatusValue;
  q?: string;
}) {
  const where: Prisma.ServiceRequestWhereInput = { tenantId: opts.tenantId };
  if (opts.createdById) where.createdById = opts.createdById;
  if (opts.status) where.status = opts.status;
  const q = opts.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { product: { contains: q, mode: "insensitive" } },
      { complaint: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ];
  }
  const rows = await prisma.serviceRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });

  const userIds = [...new Set(rows.flatMap((r) => [r.createdById, r.doneById]).filter((x): x is string => !!x))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { tenantId: opts.tenantId, id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    ...r,
    createdByName: nameOf.get(r.createdById) ?? "—",
    doneByName: r.doneById ? (nameOf.get(r.doneById) ?? "—") : null,
  }));
}

export type ServiceRequestRow = Awaited<ReturnType<typeof listServiceRequests>>[number];

/** Start of the current calendar month in IST (UTC+05:30, no DST), as a UTC instant. */
export function istMonthStart(now: Date = new Date()): Date {
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(now);
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return new Date(Date.UTC(y, m - 1, 1) - 330 * 60_000);
}

export async function serviceCounts(tenantId: string, opts: { createdById?: string } = {}) {
  const base: Prisma.ServiceRequestWhereInput = { tenantId, ...(opts.createdById ? { createdById: opts.createdById } : {}) };
  const [pending, doneThisMonth, free, paid] = await Promise.all([
    prisma.serviceRequest.count({ where: { ...base, status: "PENDING" } }),
    prisma.serviceRequest.count({ where: { ...base, status: "DONE", doneAt: { gte: istMonthStart() } } }),
    prisma.serviceRequest.count({ where: { ...base, serviceType: "FREE" } }),
    prisma.serviceRequest.count({ where: { ...base, serviceType: "PAID" } }),
  ]);
  return { pending, doneThisMonth, free, paid };
}
