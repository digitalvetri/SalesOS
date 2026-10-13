// v1.1 §4.3 (employee) / §5.3 (admin) — spreadsheet-style order list.
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import {
  listOrdersV2,
  listOrderMonths,
  countOrdersBySalesperson,
  type OrderV2Filters,
} from "@/server/repo/ordersV2";
import { prisma } from "@/server/repo/client";
import { OrderSheet } from "./_components/sheet/OrderSheet";

type SearchParams = { [k: string]: string | string[] | undefined };

const STATUS_VALUES = ["all", "pending", "completed", "balance_due"] as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  try {
    assertCan(session.role, "orders.view", { isOwn: true });
  } catch {
    redirect("/home");
  }
  const sp = await searchParams;

  const mode: "employee" | "admin" =
    session.role === "SALES" || session.role === "DISPATCH" ? "employee" : "admin";
  const salespersonScope = mode === "employee" ? session.userId : undefined;

  const month =
    typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : null;
  const status: OrderV2Filters["status"] =
    typeof sp.f === "string" && (STATUS_VALUES as readonly string[]).includes(sp.f)
      ? (sp.f as OrderV2Filters["status"])
      : "all";
  const search = typeof sp.q === "string" ? sp.q : "";
  const spFilter = mode === "admin" && typeof sp.sp === "string" ? sp.sp : null;

  const effectiveSalespersonId = salespersonScope ?? spFilter ?? undefined;

  const [rows, months, salesUsers, counts] = await Promise.all([
    listOrdersV2({
      tenantId: session.tenantId,
      salespersonId: effectiveSalespersonId,
      month,
      status,
      search: search || undefined,
      limit: 5000, // "All time" must include every order (counts + totals are computed from these rows)
    }),
    listOrderMonths({ tenantId: session.tenantId, salespersonId: salespersonScope }),
    mode === "admin"
      ? prisma.user.findMany({
          where: { tenantId: session.tenantId, role: "SALES", active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    mode === "admin"
      ? countOrdersBySalesperson({
          tenantId: session.tenantId,
          month,
          status,
          search: search || undefined,
        })
      : Promise.resolve(null),
  ]);

  // Employee picker: every active SALES user, plus anyone else who has orders
  // in this view (or is the selected one) so the chips always add up to "All".
  let employees: Array<{ id: string; name: string; count: number }> | undefined;
  if (mode === "admin" && counts) {
    const known = new Set(salesUsers.map((u) => u.id));
    const extraIds = [
      ...Object.keys(counts.bySalesperson),
      ...(spFilter ? [spFilter] : []),
    ].filter((id) => !known.has(id));
    const extras = extraIds.length
      ? await prisma.user.findMany({
          where: { tenantId: session.tenantId, id: { in: [...new Set(extraIds)] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];
    employees = [...salesUsers, ...extras].map((u) => ({
      ...u,
      count: counts.bySalesperson[u.id] ?? 0,
    }));
  }

  return (
    <OrderSheet
      mode={mode}
      rows={rows}
      months={months}
      activeMonth={month}
      activeStatus={status ?? "all"}
      search={search}
      employees={employees}
      allCount={counts?.all}
      activeSalesperson={employees?.some((e) => e.id === spFilter) ? spFilter : null}
    />
  );
}
