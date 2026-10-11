// POST /api/payments/proof?orderId=… — body is the (client-compressed) image,
// Content-Type image/jpeg|png|webp. Returns the storage path the record sheet
// then passes to recordPaymentAction. The service re-checks that the path was
// minted for this tenant + order.
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { prisma } from "@/server/repo/client";
import { uploadProof } from "@/server/storage/paymentProofs";
import {
  PROOF_MAX_BYTES,
  isProofMime,
  proofPathFor,
  sniffImageMime,
} from "@/server/domain/payment/record";
import { AppError, appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
    const order = await prisma.order.findFirst({
      where: { tenantId: session.tenantId, id: orderId },
      select: { id: true, salespersonId: true },
    });
    if (!order) throw new AppError("NOT_FOUND", "Order not found.");
    assertCan(session.role, "payments.record", {
      isOwn: order.salespersonId === session.userId,
    });

    const mime = (req.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!isProofMime(mime)) {
      throw new AppError("VALIDATION", "Screenshot must be a JPEG, PNG or WebP image.");
    }
    const body = await req.arrayBuffer();
    if (body.byteLength === 0) throw new AppError("VALIDATION", "Empty file.");
    if (body.byteLength > PROOF_MAX_BYTES) {
      throw new AppError("VALIDATION", "Screenshot is larger than 2 MB.");
    }
    if (sniffImageMime(new Uint8Array(body, 0, Math.min(16, body.byteLength))) !== mime) {
      throw new AppError("VALIDATION", "File content does not match its type.");
    }

    const path = proofPathFor(session.tenantId, order.id, crypto.randomUUID(), mime);
    await uploadProof(path, body, mime);
    return NextResponse.json({ ok: true, data: { path } });
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
