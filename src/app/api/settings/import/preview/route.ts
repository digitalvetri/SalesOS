import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { previewImport, type SheetAssignment } from "@/server/services/orderBookImport";
import { AppError, appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    assertCan(session.role, "import.excel");

    const form = await req.formData();
    const file = form.get("file");
    const assignmentsRaw = form.get("assignments");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION", "File is required.");
    }
    const assignments = parseAssignments(
      typeof assignmentsRaw === "string" ? assignmentsRaw : "{}",
    );

    const buffer = await file.arrayBuffer();
    const result = await previewImport({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      fileName: file.name,
      buffer,
      assignments,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    if (isAppError(e)) {
      return NextResponse.json(
        { ok: false, error: { code: e.code, message: e.userMessage } },
        { status: appErrorStatus(e.code) },
      );
    }
    console.error("[import.preview]", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Could not parse the file." } },
      { status: 500 },
    );
  }
}

function parseAssignments(json: string): Record<string, SheetAssignment> {
  try {
    const parsed = JSON.parse(json) as Record<string, SheetAssignment>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
