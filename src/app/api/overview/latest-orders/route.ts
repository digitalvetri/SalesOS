// v1.1 §6 — polling fallback for the admin Overview "Latest orders" feed.
// Returns the 8 most recent orders by order date (tie-break: newest entry) in
// the viewer's tenant. Admin / Owner / Accounts only; everyone else gets 403.
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { latestOrders } from "@/server/services/adminOverviewService";

export async function GET() {
  let s: Awaited<ReturnType<typeof requireSession>>;
  try {
    s = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (s.role !== "OWNER" && s.role !== "ADMIN" && s.role !== "ACCOUNTS") {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  const rows = await latestOrders({ tenantId: s.tenantId });
  return NextResponse.json({
    ok: true,
    data: { latestOrders: rows, serverTime: new Date().toISOString() },
  });
}
