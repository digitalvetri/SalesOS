// v1.1 §4.3 (employee) / §5.3 (admin) — spreadsheet-style order list.
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { listOrdersV2, listOrderMonths, type OrderV2Filters } from "@/server/repo/ordersV2";
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

  const [rows, months, employees] = await Promise.all([
    listOrdersV2({
      tenantId: session.tenantId,
      salespersonId: effectiveSalespersonId,
      month,
      status,
      search: search || undefined,
      limit: 500,
    }),
    listOrderMonths({ tenantId: session.tenantId, salespersonId: salespersonScope }),
    mode === "admin"
      ? prisma.user.findMany({
          where: { tenantId: session.tenantId, role: "SALES", active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <OrderSheet
      mode={mode}
      rows={rows}
      months={months}
      activeMonth={month}
      activeStatus={status ?? "all"}
      search={search}
      employees={mode === "admin" ? employees : undefined}
      activeSalesperson={spFilter}
    />
  );
}
