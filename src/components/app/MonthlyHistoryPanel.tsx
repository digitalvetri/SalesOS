import Link from "next/link";
import { Money } from "@/components/app/Money";
import { cn } from "@/lib/utils";

type Cell = { month: string; orders: number; value: string };
type Row = {
  userId: string;
  name: string;
  months: Cell[];
  totalOrders: number;
  totalValue: string;
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

function cellHref(month: string, salespersonId?: string): string {
  const p = new URLSearchParams();
  p.set("from", `${month}-01`);
  p.set("to", monthEnd(month));
  p.set("status", "delivered");
  if (salespersonId) p.set("sp", salespersonId);
  return `/orders?${p.toString()}`;
}

/**
 * Matrix view: one row per salesperson, one column per month, cells link to
 * the matching filtered /orders page. Scope with `singleUser` on the Sales
 * home (hides the Salesperson column + Total row).
 */
export function MonthlyHistoryPanel({
  months,
  salespersons,
  singleUser,
  className,
}: {
  months: string[];
  salespersons: Row[];
  singleUser?: boolean;
  className?: string;
}) {
  // Column totals (so Owner/Admin can see monthly team-wide completed value).
  const colTotals = months.map((m) => {
    const orders = salespersons.reduce(
      (n, r) => n + (r.months.find((x) => x.month === m)?.orders ?? 0),
      0,
    );
    const value = salespersons.reduce((t, r) => {
      const c = r.months.find((x) => x.month === m);
      return t + Number(c?.value ?? 0);
    }, 0);
    return { month: m, orders, value: value.toString() };
  });

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
          <tr>
            {!singleUser && <th className="py-2 pr-3">Salesperson</th>}
            {months.map((m) => (
              <th key={m} className="py-2 pr-3 text-right">
                {monthLabel(m)}
              </th>
            ))}
            {!singleUser && <th className="py-2 text-right">Total</th>}
          </tr>
        </thead>
        <tbody>
          {salespersons.map((r) => (
            <tr key={r.userId} className="border-t border-[color:var(--color-border)]">
              {!singleUser && (
                <td className="py-2 pr-3 font-medium">
                  <Link
                    href={`/orders?sp=${r.userId}`}
                    className="hover:underline"
                  >
                    {r.name}
                  </Link>
                </td>
              )}
              {r.months.map((c) => (
                <td key={c.month} className="py-2 pr-3 text-right align-top">
                  {c.orders === 0 ? (
                    <span className="text-[color:var(--color-ink-3)]">—</span>
                  ) : (
                    <Link
                      href={cellHref(c.month, singleUser ? undefined : r.userId)}
                      className="group inline-block hover:underline"
                    >
                      <Money value={c.value} className="tabular-nums" />
                      <div className="text-[11px] text-[color:var(--color-ink-3)]">
                        {c.orders} {c.orders === 1 ? "order" : "orders"}
                      </div>
                    </Link>
                  )}
                </td>
              ))}
              {!singleUser && (
                <td className="py-2 text-right align-top">
                  <Money value={r.totalValue} className="tabular-nums font-medium" />
                  <div className="text-[11px] text-[color:var(--color-ink-3)]">
                    {r.totalOrders} {r.totalOrders === 1 ? "order" : "orders"}
                  </div>
                </td>
              )}
            </tr>
          ))}
          {!singleUser && salespersons.length > 1 && (
            <tr className="border-t-2 border-[color:var(--color-border-strong)] text-sm">
              <td className="py-2 pr-3 label-caps">Team</td>
              {colTotals.map((c) => (
                <td key={c.month} className="py-2 pr-3 text-right">
                  <Money value={c.value} className="tabular-nums font-medium" />
                  <div className="text-[11px] text-[color:var(--color-ink-3)]">
                    {c.orders} {c.orders === 1 ? "order" : "orders"}
                  </div>
                </td>
              ))}
              <td className="py-2 text-right">
                <Money
                  value={salespersons.reduce((t, r) => t + Number(r.totalValue), 0).toString()}
                  className="tabular-nums font-medium"
                />
                <div className="text-[11px] text-[color:var(--color-ink-3)]">
                  {salespersons.reduce((n, r) => n + r.totalOrders, 0)} orders
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-[color:var(--color-ink-3)]">
        Completed = order status is Delivered or Closed. Click any cell to open the matching orders list.
      </p>
    </div>
  );
}
