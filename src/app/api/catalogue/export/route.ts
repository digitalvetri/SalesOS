import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { exportPriceList } from "@/server/services/priceListExport";
import { appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    assertCan(session.role, "priceList.viewDealer");
    const buf = await exportPriceList({ tenantId: session.tenantId });
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="SalesOS-price-list-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (e) {
    if (isAppError(e)) {
      return Response.json(
        { ok: false, error: { code: e.code, message: e.userMessage } },
        { status: appErrorStatus(e.code) },
      );
    }
    console.error("[catalogue.export]", e);
    return Response.json(
      { ok: false, error: { code: "INTERNAL", message: "Export failed." } },
      { status: 500 },
    );
  }
}
