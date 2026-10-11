import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { searchCustomersByPhonePrefix } from "@/server/repo/customers";
import { appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    assertCan(session.role, "customers.manage", { isOwn: true });

    const url = new URL(req.url);
    const q = (url.searchParams.get("phone") ?? "").trim();
    if (q.length < 3) {
      return NextResponse.json({ ok: true, data: { hits: [] } });
    }

    const hits = await searchCustomersByPhonePrefix({
      tenantId: session.tenantId,
      prefix: q,
      limit: 5,
    });

    return NextResponse.json({
      ok: true,
      data: {
        hits: hits.map((h) => ({
          id: h.id,
          name: h.name,
          businessName: h.businessName,
          phoneE164: h.phoneE164,
          city: h.city,
          ordersCount: h._count.orders,
        })),
      },
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
