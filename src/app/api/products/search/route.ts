import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { searchProducts } from "@/server/repo/products";
import { appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    // Everyone who can create orders can search products. SALES is "own" scope,
    // but search doesn't take ownership of anything — we gate by orders.create.
    assertCan(session.role, "orders.create", { isOwn: true });

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ ok: true, data: { hits: [] } });
    }

    const hits = await searchProducts({
      tenantId: session.tenantId,
      query: q,
      limit: 10,
    });

    return NextResponse.json({
      ok: true,
      data: {
        hits: hits.map((h) => ({
          id: h.id,
          name: h.name,
          spec: h.spec,
          customerPrice: h.customerPrice ? String(h.customerPrice) : null,
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
