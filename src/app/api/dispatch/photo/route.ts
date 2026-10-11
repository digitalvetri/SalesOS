// POST /api/dispatch/photo?orderId=… — body is the (client-compressed) image.
// Returns the storage path that createDispatch / markDelivered accept.
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { prisma } from "@/server/repo/client";
import { BUCKETS, uploadImage } from "@/server/storage/buckets";
import { PROOF_MAX_BYTES, isProofMime, proofPathFor, sniffImageMime } from "@/server/domain/payment/record";
import { AppError, appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    assertCan(session.role, "dispatch.updateStatus");
    const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
    const order = await prisma.order.findFirst({
      where: { tenantId: session.tenantId, id: orderId },
      select: { id: true },
    });
    if (!order) throw new AppError("NOT_FOUND", "Order not found.");

    const mime = (req.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!isProofMime(mime)) throw new AppError("VALIDATION", "Photo must be a JPEG, PNG or WebP image.");
    const body = await req.arrayBuffer();
    if (body.byteLength === 0) throw new AppError("VALIDATION", "Empty file.");
    if (body.byteLength > PROOF_MAX_BYTES) throw new AppError("VALIDATION", "Photo is larger than 2 MB.");
    if (sniffImageMime(new Uint8Array(body, 0, Math.min(16, body.byteLength))) !== mime) {
      throw new AppError("VALIDATION", "File content does not match its type.");
    }

    const path = proofPathFor(session.tenantId, order.id, crypto.randomUUID(), mime);
    await uploadImage(BUCKETS.dispatchPhotos, path, body, mime);
    return NextResponse.json({ ok: true, data: { path } });
  } catch (e) {
    if (isAppError(e)) {
      return NextResponse.json({ ok: false, error: { code: e.code, message: e.userMessage } }, { status: appErrorStatus(e.code) });
    }
    throw e;
  }
}
