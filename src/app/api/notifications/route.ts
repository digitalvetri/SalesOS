import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import {
  listMyNotifications,
  countUnread,
  markRead,
  markAllRead,
} from "@/server/repo/notifications";
import { AppError, appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    const [items, unread] = await Promise.all([
      listMyNotifications({ tenantId: session.tenantId, userId: session.userId }),
      countUnread({ tenantId: session.tenantId, userId: session.userId }),
    ]);
    return NextResponse.json({ ok: true, data: { items, unread } });
  } catch (e) {
    return handle(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = (await req.json()) as { action: "read" | "read-all"; id?: string };
    if (body.action === "read-all") {
      await markAllRead({ tenantId: session.tenantId, userId: session.userId });
    } else if (body.action === "read" && body.id) {
      await markRead({ tenantId: session.tenantId, userId: session.userId, id: body.id });
    } else {
      throw new AppError("VALIDATION", "Unsupported notification action.");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}

function handle(e: unknown) {
  if (isAppError(e)) {
    return NextResponse.json(
      { ok: false, error: { code: e.code, message: e.userMessage } },
      { status: appErrorStatus(e.code) },
    );
  }
  console.error("[notifications]", e);
  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL", message: "Something went wrong." } },
    { status: 500 },
  );
}
