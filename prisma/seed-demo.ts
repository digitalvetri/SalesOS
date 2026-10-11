// Demo data (spec §16): ~120 products is the real price list (import it via
// /catalogue/import); this adds a starter catalogue if none exists, 60
// customers and 200 orders across the last 6 months with realistic statuses,
// payments, dispatches and targets — deterministic (seeded RNG) so the
// dashboard looks real in demos and screenshots are reproducible.
//
// Run after `pnpm prisma:seed`:  pnpm prisma:seed:demo
// Idempotent: does nothing if the tenant already has DEMO-tagged orders.
import { PrismaClient, type OrderStatus, type PaymentMethod, type CancelReason } from "@prisma/client";
import Decimal from "decimal.js";

const prisma = new PrismaClient();

// Mulberry32 — tiny deterministic PRNG.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261011);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

const CATALOGUE = [
  ["Wet Grinders", "10L Tilting Wet Grinder", 32000],
  ["Wet Grinders", "5L Table-top Wet Grinder", 14500],
  ["Wet Grinders", "20L Tilting Wet Grinder", 52000],
  ["Peelers", "10kg Potato Peeler", 21000],
  ["Peelers", "15kg Potato Peeler", 24000],
  ["Pulverizers", '6" IRG Pulverizer', 18500],
  ["Pulverizers", '8" IRG Pulverizer', 26500],
  ["Mixers", "50kg Dough Kneader", 68000],
  ["Mixers", "Vada Machine", 38000],
  ["Stoves", "5kg Turbo Stove", 9500],
  ["Stoves", "2-burner SS Range", 16500],
  ["Cutters", "Vegetable Cutting Machine", 29000],
] as const;

const FIRST = ["Gokul", "Swaada", "Fresh Pack", "Ram", "Mathews", "Rew", "Annapoorna", "Sri Krishna", "Hotel Saravana", "Murugan", "Aachi", "Selvam", "Kovai", "Madurai", "Thalappakatti"];
const LAST = ["Caterers", "Foods", "Kitchens", "Bhavan", "Sweets", "Mess", "Hotels", "Industries", "Snacks", "Restaurant"];
const CITIES = ["Coimbatore", "Chennai", "Madurai", "Salem", "Trichy", "Erode", "Tirupur", "Bengaluru"];
const REASONS: CancelReason[] = ["DELIVERY_DELAY", "DELIVERY_DELAY", "PRICE", "FINANCIAL_ISSUE", "CUSTOMER_CHANGED_MIND"];

const istToday = () => new Date(new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10) + "T00:00:00.000Z");

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "ki-kfm-pilot" } });
  const tenantId = tenant.id;
  if (await prisma.order.count({ where: { tenantId, importRef: { startsWith: "DEMO" } } })) {
    console.log("Demo data already present — skipping.");
    return;
  }

  const entities = await prisma.billingEntity.findMany({ where: { tenantId } });
  const accounts = await prisma.account.findMany({ where: { tenantId, active: true } });
  const sales = await prisma.user.findMany({ where: { tenantId, role: "SALES", active: true }, orderBy: { phoneE164: "asc" } });
  const owner = await prisma.user.findFirstOrThrow({ where: { tenantId, role: "OWNER" } });
  const accountsUser = (await prisma.user.findFirst({ where: { tenantId, role: "ACCOUNTS" } })) ?? owner;

  // Starter catalogue only when the price list hasn't been imported.
  let products = await prisma.product.findMany({ where: { tenantId, active: true, customerPrice: { not: null } } });
  if (products.length < 5) {
    for (const [cat, name, price] of CATALOGUE) {
      const category =
        (await prisma.productCategory.findFirst({ where: { tenantId, name: cat } })) ??
        (await prisma.productCategory.create({ data: { tenantId, name: cat } }));
      await prisma.product.create({
        data: {
          tenantId, categoryId: category.id, name, searchText: name.toLowerCase(), aliases: [],
          customerPrice: String(price), dealerPrice: String(Math.round(price * 0.85)), gstRate: "18",
          isStockItem: price < 15000,
        },
      });
    }
    products = await prisma.product.findMany({ where: { tenantId, active: true, customerPrice: { not: null } } });
  }

  const customers = [];
  for (let i = 0; i < 60; i++) {
    const phone = `+9198${String(70000000 + i * 7919).padStart(8, "0")}`;
    customers.push(
      await prisma.customer.upsert({
        where: { tenantId_phoneE164: { tenantId, phoneE164: phone } },
        update: {},
        create: { tenantId, phoneE164: phone, name: `${pick(FIRST)} ${pick(LAST)}`, city: pick(CITIES) },
      }),
    );
  }

  // Monthly targets for the last 6 months.
  const today = istToday();
  for (let m = 0; m < 6; m++) {
    const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1));
    for (const s of sales) {
      await prisma.salesTarget.upsert({
        where: { tenantId_userId_month: { tenantId, userId: s.id, month } },
        update: {},
        create: { tenantId, userId: s.id, month, amount: String(between(4, 15) * 100000) },
      });
    }
  }

  let receipts = 0;
  const counters = new Map<string, number>();
  for (let i = 0; i < 200; i++) {
    const daysAgo = Math.floor(Math.pow(rand(), 1.4) * 180); // skew towards recent
    const orderDate = new Date(today.getTime() - daysAgo * 86_400_000);
    const entity = pick(entities);
    const fy = orderDate.getUTCMonth() >= 3 ? orderDate.getUTCFullYear() : orderDate.getUTCFullYear() - 1;
    const fyLabel = `${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
    const key = `ORDER:${entity.code}:${fyLabel}`;
    if (!counters.has(key)) {
      const existing = await prisma.documentCounter.findUnique({ where: { tenantId_key: { tenantId, key } } });
      counters.set(key, existing?.value ?? 0);
    }
    const seq = counters.get(key)! + 1;
    counters.set(key, seq);

    const lines = Array.from({ length: between(1, 3) }, (_, k) => {
      const p = pick(products);
      const qty = rand() < 0.1 ? between(4, 17) : between(1, 2);
      const unit = new Decimal(p.customerPrice!.toString()).times(rand() < 0.2 ? 0.95 : 1).toDecimalPlaces(0);
      return { productId: p.id, description: p.name, qty, listPrice: p.customerPrice!.toString(), floorPrice: p.dealerPrice?.toString() ?? null, unitPrice: unit.toString(), gstRate: "18", lineTotal: unit.times(qty).toString(), sortOrder: k };
    });
    const total = lines.reduce((s, l) => s.plus(l.lineTotal), new Decimal(0));

    // Status by age: older orders are further along.
    const r = rand();
    let status: OrderStatus;
    if (r < 0.06) status = "CANCELLED";
    else if (daysAgo < 4 && r < 0.1) status = "PENDING_APPROVAL";
    else if (daysAgo < 8) status = pick(["CONFIRMED", "IN_PRODUCTION", "CONFIRMED"] as const);
    else if (daysAgo < 20) status = pick(["IN_PRODUCTION", "READY", "DISPATCHED", "DELIVERED", "CONFIRMED"] as const);
    else status = pick(["DELIVERED", "DELIVERED", "DELIVERED", "DISPATCHED", "IN_PRODUCTION"] as const);

    const shipped = ["DISPATCHED", "DELIVERED"].includes(status);
    const salesperson = pick(sales);
    const order = await prisma.order.create({
      data: {
        tenantId, number: `${entity.code}/${fyLabel}/${String(seq).padStart(4, "0")}`, entityId: entity.id,
        customerId: pick(customers).id, salespersonId: salesperson.id, orderDate,
        promisedDeliveryDate: new Date(orderDate.getTime() + between(7, 20) * 86_400_000),
        promisedPaymentDate: rand() < 0.3 ? new Date(today.getTime() + between(-25, 10) * 86_400_000) : null,
        status, subtotal: total.toString(), total: total.toString(), balanceDue: total.toString(),
        cancelReason: status === "CANCELLED" ? pick(REASONS) : null,
        importRef: `DEMO-${i}`, createdById: salesperson.id,
        lines: { create: lines.map((l) => ({ ...l, dispatchedQty: shipped ? l.qty : 0 })) },
        events: {
          create: [
            { actorId: salesperson.id, type: "STATUS_CHANGE", toStatus: "CONFIRMED", at: orderDate },
            ...(status !== "CONFIRMED" && status !== "PENDING_APPROVAL"
              ? [{ actorId: owner.id, type: "STATUS_CHANGE", fromStatus: "CONFIRMED" as const, toStatus: status, at: new Date(orderDate.getTime() + between(2, 12) * 86_400_000) }]
              : []),
          ],
        },
      },
      include: { lines: true },
    });

    if (shipped) {
      const dispatchedOn = new Date(orderDate.getTime() + between(5, 15) * 86_400_000);
      await prisma.dispatch.create({
        data: {
          orderId: order.id, dispatchedOn: dispatchedOn > today ? today : dispatchedOn, transporter: pick(["ABT Parcel", "KPN", "VRL", "Own vehicle"]),
          lrNumber: String(between(10000, 99999)), photoPaths: [], createdById: owner.id,
          deliveredOn: status === "DELIVERED" ? (dispatchedOn > today ? today : dispatchedOn) : null,
          lines: { create: order.lines.map((l) => ({ orderLineId: l.id, qty: l.qty })) },
        },
      });
    }

    // Payments: advance on most orders; delivered orders mostly paid.
    const payments: { type: "ADVANCE" | "PART" | "FINAL"; amount: Decimal; verified: boolean; daysAfter: number }[] = [];
    if (status !== "PENDING_APPROVAL" && rand() < 0.8) {
      payments.push({ type: "ADVANCE", amount: total.times(pick([0.2, 0.3, 0.5])).div(100).floor().times(100), verified: daysAgo > 3 || rand() < 0.5, daysAfter: 0 });
    }
    if (status === "DELIVERED" && rand() < 0.7) {
      const paid = payments.reduce((s, p) => s.plus(p.amount), new Decimal(0));
      payments.push({ type: "FINAL", amount: total.minus(paid), verified: rand() < 0.85, daysAfter: between(8, 25) });
    }
    for (const p of payments) {
      if (p.amount.lte(0)) continue;
      const paidOn = new Date(Math.min(orderDate.getTime() + p.daysAfter * 86_400_000, today.getTime()));
      const method: PaymentMethod = pick(["UPI", "UPI", "BANK_TRANSFER", "CASH", "CHEQUE"]);
      const personal = method === "CASH" && rand() < 0.6;
      const fyR = paidOn.getUTCMonth() >= 3 ? paidOn.getUTCFullYear() : paidOn.getUTCFullYear() - 1;
      await prisma.payment.create({
        data: {
          tenantId, receiptNo: `RCPT/${String(fyR).slice(2)}-${String(fyR + 1).slice(2)}/${String(++receipts).padStart(5, "0")}D`,
          orderId: order.id, type: p.type, method, amount: p.amount.toString(), paidOn,
          receivedByUserId: personal ? salesperson.id : null,
          receivedIntoAccountId: personal ? null : (accounts.find((a) => a.entityId === entity.id) ?? accounts[0]!).id,
          depositedToAccountId: personal && rand() < 0.5 ? accounts[0]!.id : null,
          depositedOn: personal && rand() < 0.5 ? paidOn : null,
          referenceNo: method === "CASH" ? null : `UTR${between(100000000, 999999999)}`,
          status: p.verified ? "VERIFIED" : "PENDING_VERIFICATION",
          verifiedById: p.verified ? accountsUser.id : null, verifiedAt: p.verified ? paidOn : null,
          createdById: salesperson.id,
        },
      });
    }

    // Balance per BR-09 (pending + verified count; cancelled ⇒ effective total 0).
    const net = payments.reduce((s, p) => s.plus(p.amount.gt(0) ? p.amount : 0), new Decimal(0));
    const effective = status === "CANCELLED" ? new Decimal(0) : total;
    const balance = effective.minus(net);
    const allVerified = payments.every((p) => p.verified);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        balanceDue: balance.toString(),
        ...(status === "DELIVERED" && balance.isZero() && allVerified ? { status: "CLOSED" } : {}),
      },
    });
  }

  // Demo numbers continued each live counter; move the counters past them (BR-04: never reused).
  for (const [key, value] of counters) {
    await prisma.documentCounter.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value },
      update: { value },
    });
  }
  console.log(`Demo data: ${customers.length} customers, 200 orders, ${receipts} payments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
