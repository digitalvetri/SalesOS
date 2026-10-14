import { GO_LIVE_YM } from "@/config/brand";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { listUsers } from "@/server/repo/users";
import { listTargets } from "@/server/repo/targets";
import { TargetGrid } from "./TargetGrid";

const MONTHS_BACK = 2;
const MONTHS_AHEAD = 3;

function firstOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export default async function TargetsPage() {
  const session = await requireSession();
  const t = await getTranslations("settings.targets");

  const now = firstOfMonthUTC(new Date());
  const months: Date[] = [];
  const goLive = new Date(`${GO_LIVE_YM}-01T00:00:00Z`);
  for (let i = -MONTHS_BACK; i <= MONTHS_AHEAD; i++) {
    const m = firstOfMonthUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)));
    if (m >= goLive) months.push(m); // nothing before the go-live month
  }

  const [users, targets] = await Promise.all([
    listUsers(session.tenantId),
    listTargets(session.tenantId, months),
  ]);

  const salespeople = users.filter((u) => u.role === "SALES" && u.active);
  if (salespeople.length === 0) {
    return (
      <section className="space-y-6">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-[color:var(--color-ink-2)]">{t("noSalespeople")}</p>
      </section>
    );
  }

  const grid: Record<string, Record<string, string>> = {};
  for (const target of targets) {
    const monthKey = `${target.month.getUTCFullYear()}-${String(target.month.getUTCMonth() + 1).padStart(2, "0")}`;
    grid[target.userId] ??= {};
    grid[target.userId]![monthKey] = target.amount.toString();
  }

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <TargetGrid
        salespeople={salespeople.map((u) => ({ id: u.id, name: u.name }))}
        months={months.map((m) => `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`)}
        values={grid}
      />
    </section>
  );
}
