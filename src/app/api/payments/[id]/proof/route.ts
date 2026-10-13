// GET /api/payments/{id}/proof — redirects to a 60-second signed URL for the
// payment's proof screenshot. Same visibility as the order's money section.
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { prisma } from "@/server/repo/client";
import { BUCKETS, readImage } from "@/server/storage/buckets";
import { AppError, appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const payment = await prisma.payment.findFirst({
      where: { tenantId: session.tenantId, id },
      select: { proofPath: true, order: { select: { salespersonId: true } } },
    });
    if (!payment?.proofPath) throw new AppError("NOT_FOUND", "Screenshot not found.");
    assertCan(session.role, "orders.viewPrices", {
      isOwn: payment.order.salespersonId === session.userId,
    });
    const img = await readImage(BUCKETS.paymentProofs, payment.proofPath);
    return new NextResponse(new Uint8Array(img.body), {
      headers: { "Content-Type": img.contentType, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (isAppError(e)) {
      return NextResponse.json(
        { ok: false, error: { code: e.code, message: e.userMessage } },
        { status: appErrorStatus(e.code) },
      );
    }
    throw e;
  }
}
