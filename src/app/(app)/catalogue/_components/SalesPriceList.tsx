"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { formatInr } from "@/components/app/Money";

export type SalesProductRow = {
  id: string;
  name: string;
  spec: string | null;
  customerPrice: string | null;
  isStockItem: boolean;
  active: boolean;
  categoryId: string;
  aliases: string[];
};

export function SalesPriceList({
  categories,
  products,
}: {
  categories: Array<{ id: string; name: string }>;
  products: SalesProductRow[];
  readOnly?: boolean;
}) {
  const t = useTranslations("catalogue");
  const [filter, setFilter] = React.useState("");

  const grouped = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const byCat = new Map<string, SalesProductRow[]>();
    for (const p of products) {
      if (q) {
        const match =
          p.name.toLowerCase().includes(q) ||
          (p.spec?.toLowerCase().includes(q) ?? false) ||
          p.aliases.some((a) => a.toLowerCase().includes(q));
        if (!match) continue;
      }
      if (!byCat.has(p.categoryId)) byCat.set(p.categoryId, []);
      byCat.get(p.categoryId)!.push(p);
    }
    return categories
      .map((cat) => ({ cat, items: byCat.get(cat.id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [products, filter, categories]);

  return (
    <div className="space-y-6">
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("searchPlaceholder")}
        data-gold
        className="h-11 w-80 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)]/60"
      />
      {grouped.map(({ cat, items }) => (
        <section
          key={cat.id}
          className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
        >
          <header className="bg-[color:var(--color-surface-2)] px-4 py-2">
            <h3 className="label-caps">{cat.name}</h3>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
                <th className="px-4 py-2">{t("colName")}</th>
                <th className="px-4 py-2">{t("colSpec")}</th>
                <th className="px-4 py-2 text-right">{t("colCustomer")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-[color:var(--color-ink-2)]">{p.spec ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p.customerPrice ? formatInr(p.customerPrice) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
