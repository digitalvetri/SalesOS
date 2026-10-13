// GET /api/dispatch/{dispatchId}/photo?i=0 — 60-second signed URL redirect for
// a dispatch photo (i = 0..3) or the delivery proof (i = "delivery").
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { prisma } from "@/server/repo/client";
import { BUCKETS, readImage } from "@/server/storage/buckets";
import { AppError, appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const d = await prisma.dispatch.findFirst({
      where: { id, order: { tenantId: session.tenantId } },
      select: { photoPaths: true, deliveryProofPath: true, order: { select: { salespersonId: true } } },
    });
    if (!d) throw new AppError("NOT_FOUND", "Photo not found.");
    assertCan(session.role, "orders.view", { isOwn: d.order.salespersonId === session.userId });
    const i = new URL(req.url).searchParams.get("i") ?? "0";
    const path = i === "delivery" ? d.deliveryProofPath : d.photoPaths[Number(i)];
    if (!path) throw new AppError("NOT_FOUND", "Photo not found.");
    const img = await readImage(BUCKETS.dispatchPhotos, path);
    return new NextResponse(new Uint8Array(img.body), {
      headers: { "Content-Type": img.contentType, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (isAppError(e)) {
      return NextResponse.json({ ok: false, error: { code: e.code, message: e.userMessage } }, { status: appErrorStatus(e.code) });
    }
    throw e;
  }
}
