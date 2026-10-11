// Auto payment reminders (§5.4, §13). Called hourly by Vercel Cron
// (vercel.json) with `Authorization: Bearer $CRON_SECRET`. The job itself
// enforces Sundays-off, 10:00–19:00 IST, every-N-days, max-M and the 48 h rule.
import { assertCronSecret, runAutoReminders } from "@/server/services/whatsappService";
import { appErrorStatus, isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    assertCronSecret(req.headers.get("authorization"));
    return Response.json({ ok: true, data: await runAutoReminders() });
  } catch (e) {
    if (isAppError(e)) return Response.json({ ok: false, error: { code: e.code } }, { status: appErrorStatus(e.code) });
    console.error("[cron.whatsapp-reminders]", e);
    return Response.json({ ok: false, error: { code: "INTERNAL" } }, { status: 500 });
  }
}
