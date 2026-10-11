import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { parsePriceListWorkbook } from "@/server/services/priceListImport";
import { prisma } from "@/server/repo/client";
import { AppError, appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    assertCan(session.role, "priceList.edit");

    const ab = await req.arrayBuffer();
    if (ab.byteLength === 0) throw new AppError("VALIDATION", "Empty file.");
    if (ab.byteLength > 20 * 1024 * 1024) {
      throw new AppError("VALIDATION", "File larger than 20 MB.");
    }

    const workbook = new ExcelJS.Workbook();
    // ExcelJS accepts an ArrayBuffer / Uint8Array at runtime; the `.load` signature's
    // Buffer<ArrayBufferLike> can't be satisfied here under TS strict.
    await (workbook.xlsx as unknown as { load(data: ArrayBuffer): Promise<void> }).load(ab);
    const parsed = parsePriceListWorkbook(workbook);

    const batch = await prisma.importBatch.create({
      data: {
        tenantId: session.tenantId,
        fileName: `pricelist-${new Date().toISOString()}.xlsx`,
        status: "PARSED",
        summaryJson: {
          totals: parsed.totals,
          categories: parsed.categories,
        },
        rowsJson: parsed.rows.map((r) => ({
          ...r,
          dealerPriceWoMotor: r.dealerPriceWoMotor?.toString() ?? null,
          dealerPrice: r.dealerPrice?.toString() ?? null,
          customerPrice: r.customerPrice?.toString() ?? null,
        })),
        createdById: session.userId,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        totals: parsed.totals,
        categories: parsed.categories,
        sampleRows: parsed.rows.slice(0, 20).map((r) => ({
          rowIndex: r.rowIndex,
          category: r.category,
          name: r.name,
          spec: r.spec,
          dealerPriceWoMotor: r.dealerPriceWoMotor?.toString() ?? null,
          dealerPrice: r.dealerPrice?.toString() ?? null,
          customerPrice: r.customerPrice?.toString() ?? null,
          issues: r.issues,
        })),
        token: batch.id,
      },
    });
  } catch (e) {
    if (isAppError(e)) {
      return NextResponse.json(
        { ok: false, error: { code: e.code, message: e.userMessage } },
        { status: appErrorStatus(e.code) },
      );
    }
    console.error("[catalogue.import.preview]", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Could not parse the file." } },
      { status: 500 },
    );
  }
}
