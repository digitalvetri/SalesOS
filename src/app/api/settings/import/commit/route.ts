import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { commitImport, type SheetAssignment } from "@/server/services/orderBookImport";
import { AppError, appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    assertCan(session.role, "import.excel");

    const body = (await req.json()) as {
      batchId?: string;
      assignments?: Record<string, SheetAssignment>;
      routeMap?: Array<{ keyword: string; accountId?: string; userId?: string }>;
      include?: Record<string, boolean>;
    };
    if (!body.batchId) throw new AppError("VALIDATION", "Missing batchId.");
    if (!body.assignments) throw new AppError("VALIDATION", "Missing assignments.");

    const result = await commitImport({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      batchId: body.batchId,
      assignments: body.assignments,
      routeMap: body.routeMap,
      include: body.include,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    if (isAppError(e)) {
      return NextResponse.json(
        { ok: false, error: { code: e.code, message: e.userMessage } },
        { status: appErrorStatus(e.code) },
      );
    }
    console.error("[import.commit]", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Commit failed." } },
      { status: 500 },
    );
  }
}
