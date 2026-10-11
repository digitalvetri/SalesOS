import { NextResponse } from "next/server";
import Decimal from "decimal.js";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { prisma } from "@/server/repo/client";
import { commitPriceList } from "@/server/services/priceListImport";
import { AppError, appErrorStatus, isAppError } from "@/lib/errors";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    assertCan(session.role, "priceList.edit");

    const { token } = (await req.json()) as { token?: string };
    if (!token) throw new AppError("VALIDATION", "Missing import token.");

    const batch = await prisma.importBatch.findFirst({
      where: { id: token, tenantId: session.tenantId, status: "PARSED" },
    });
    if (!batch) throw new AppError("NOT_FOUND", "Import batch not found or already committed.");

    const stored = batch.rowsJson as Array<{
      rowIndex: number;
      category: string;
      name: string;
      spec: string | null;
      dealerPriceWoMotor: string | null;
      dealerPrice: string | null;
      customerPrice: string | null;
      issues: string[];
    }>;
    const summary = batch.summaryJson as {
      totals: {
        rows: number;
        withPrices: number;
        issues: Record<string, number>;
      };
      categories: string[];
    };

    const rows = stored.map((r) => ({
      rowIndex: r.rowIndex,
      category: r.category,
      name: r.name,
      spec: r.spec,
      dealerPriceWoMotor: r.dealerPriceWoMotor ? new Decimal(r.dealerPriceWoMotor) : null,
      dealerPrice: r.dealerPrice ? new Decimal(r.dealerPrice) : null,
      customerPrice: r.customerPrice ? new Decimal(r.customerPrice) : null,
      issues: r.issues as never,
    }));

    const result = await commitPriceList({
      tenantId: session.tenantId,
      actorId: session.userId,
      parsed: {
        rows,
        categories: summary.categories,
        totals: summary.totals as never,
      },
    });

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "COMMITTED" },
    });

    revalidatePath("/catalogue");

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (e) {
    if (isAppError(e)) {
      return NextResponse.json(
        { ok: false, error: { code: e.code, message: e.userMessage } },
        { status: appErrorStatus(e.code) },
      );
    }
    console.error("[catalogue.import.commit]", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Could not commit the import." } },
      { status: 500 },
    );
  }
}
