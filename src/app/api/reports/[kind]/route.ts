// GET /api/reports/{kind}?from=YYYY-MM-DD&to=YYYY-MM-DD&entity=… → .xlsx (§11.14).
import { requireSession } from "@/server/auth/session";
import { assertCan, level } from "@/server/auth/permissions";
import { buildReport, REPORTS, type ReportKind } from "@/server/services/reportService";
import { resolvePeriod } from "@/server/domain/dashboard/period";
import { AppError, appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params;
    const session = await requireSession();
    // §4.2 "Export reports": Owner/Admin/Accounts full, Sales own, Dispatch none.
    // v1.1 §7: employees can't download Excel.
    if (session.role === "SALES" || session.role === "DISPATCH") {
      throw new AppError("FORBIDDEN", "Excel downloads are for the office team.");
    }
    assertCan(session.role, "reports.export", { isOwn: true });
    if (!REPORTS.includes(kind as ReportKind)) throw new AppError("NOT_FOUND", "Unknown report.");

    const url = new URL(req.url);
    const def = resolvePeriod("this_month", new Date());
    const from = url.searchParams.get("from") ?? def.from;
    const to = url.searchParams.get("to") ?? def.to;
    if (!YMD.test(from) || !YMD.test(to) || from > to) throw new AppError("VALIDATION", "Pick a valid date range.");
    const entityId = url.searchParams.get("entity") || undefined;

    const buf = await buildReport(kind as ReportKind, {
      tenantId: session.tenantId,
      from,
      to,
      entityId,
      salespersonScope: level(session.role, "reports.export") === "own" ? session.userId : undefined,
    });
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="SalesOS-${kind}-${from}_to_${to}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (isAppError(e)) {
      return Response.json({ ok: false, error: { code: e.code, message: e.userMessage } }, { status: appErrorStatus(e.code) });
    }
    console.error("[reports.export]", e);
    return Response.json({ ok: false, error: { code: "INTERNAL", message: "Export failed." } }, { status: 500 });
  }
}
