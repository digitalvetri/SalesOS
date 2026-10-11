import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { prisma } from "@/server/repo/client";
import { ImportWizard } from "./ImportWizard";

export default async function OrderBookImportPage() {
  const session = await requireSession();
  try {
    assertCan(session.role, "import.excel");
  } catch {
    redirect("/home");
  }

  const [salespeople, accounts] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: session.tenantId, active: true, role: "SALES" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.account.findMany({
      where: { tenantId: session.tenantId, active: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true, entity: { select: { code: true } } },
    }),
  ]);

  return (
    <div className="px-6 py-6">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Import order book</h1>
      <p className="mb-6 max-w-2xl text-sm text-[color:var(--color-ink-2)]">
        Upload the existing <code>ORDER_DETAILS.xlsx</code>. We detect sheets, parse rows, show a
        preview with issues, then commit customers + orders + historical payments. Spec §15.
      </p>
      <ImportWizard
        salespeople={salespeople}
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.entity.code} · ${a.label}` }))}
      />
    </div>
  );
}
