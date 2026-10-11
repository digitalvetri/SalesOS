// v1.1 §6 — polling fallback for the admin Overview "Latest orders" feed.
// Returns the newest 8 orders in the viewer's tenant. Admin / Owner / Accounts
// only; everyone else gets 403.
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { adminOverview } from "@/server/services/adminOverviewService";

export async function GET() {
  try {
    const s = await requireSession();
    if (s.role !== "OWNER" && s.role !== "ADMIN" && s.role !== "ACCOUNTS") {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    const o = await adminOverview({ tenantId: s.tenantId });
    return NextResponse.json({
      ok: true,
      data: {
        latestOrders: o.latestOrders,
        serverTime: new Date().toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
}
