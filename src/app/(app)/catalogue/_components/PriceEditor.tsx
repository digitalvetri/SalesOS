"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import Decimal from "decimal.js";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "@/components/app/Toast";
import { updateProductPricesAction, updateProductMetaAction } from "../actions";
import { formatInr } from "@/components/app/Money";
import { ProductFormSheet, type EditableProduct } from "./ProductFormSheet";

type Category = { id: string; name: string; sortOrder: number };

export type AdminProductRow = {
  id: string;
  name: string;
  spec: string | null;
  aliases: string[];
  customerPrice: string | null;
  dealerPrice: string | null;
  dealerPriceWoMotor: string | null;
  gstRate: string | null;
  isStockItem: boolean;
  active: boolean;
  categoryId: string;
  searchText: string;
};

type Draft = {
  dealerPriceWoMotor?: string;
  dealerPrice?: string;
  customerPrice?: string;
};

function parse(input: string): Decimal | null {
  const t = input.replace(/[₹,\s]/g, "");
  if (!t) return null;
  const d = new Decimal(t);
  return d.isNaN() ? null : d;
}

function fmtInput(v: string | null): string {
  if (!v) return "";
  return new Decimal(v).toFixed(0);
}

function toEditable(p: AdminProductRow): EditableProduct {
  return {
    id: p.id,
    name: p.name,
    spec: p.spec,
    aliases: p.aliases,
    categoryId: p.categoryId,
    isStockItem: p.isStockItem,
    dealerPriceWoMotor: p.dealerPriceWoMotor,
    dealerPrice: p.dealerPrice,
    customerPrice: p.customerPrice,
  };
}

export function PriceEditor({
  categories,
  products,
}: {
  categories: Category[];
  products: AdminProductRow[];
}) {
  const t = useTranslations("catalogue");
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [pending, setPending] = React.useState<string | null>(null);
  const [productMap, setProductMap] = React.useState<Record<string, AdminProductRow>>(
    () => Object.fromEntries(products.filter((p) => p.active).map((p) => [p.id, p])),
  );
  const [filter, setFilter] = React.useState("");

  const grouped = React.useMemo(() => {
    const byCat = new Map<string, AdminProductRow[]>();
    const q = filter.trim().toLowerCase();
    for (const p of Object.values(productMap)) {
      if (!p.active) continue;
      if (q) {
        const match =
          p.searchText.includes(q) || p.aliases.some((a) => a.toLowerCase().includes(q));
        if (!match) continue;
      }
      if (!byCat.has(p.categoryId)) byCat.set(p.categoryId, []);
      byCat.get(p.categoryId)!.push(p);
    }
    return categories
      .map((cat) => ({ cat, items: byCat.get(cat.id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [productMap, filter, categories]);

  function patchDraft(id: string, patch: Draft) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function save(id: string) {
    const d = drafts[id];
    if (!d) return;
    const current = productMap[id]!;
    const payload: Record<string, string | null | undefined> = {};
    if (d.dealerPriceWoMotor !== undefined) {
      const n = parse(d.dealerPriceWoMotor);
      payload.dealerPriceWoMotor = n?.toString() ?? null;
    }
    if (d.dealerPrice !== undefined) {
      const n = parse(d.dealerPrice);
      payload.dealerPrice = n?.toString() ?? null;
    }
    if (d.customerPrice !== undefined) {
      const n = parse(d.customerPrice);
      payload.customerPrice = n?.toString() ?? null;
    }

    setPending(id);
    try {
      const r = await updateProductPricesAction({ id, ...payload });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setProductMap((m) => ({
        ...m,
        [id]: {
          ...current,
          dealerPriceWoMotor:
            payload.dealerPriceWoMotor === undefined
              ? current.dealerPriceWoMotor
              : payload.dealerPriceWoMotor ?? null,
          dealerPrice:
            payload.dealerPrice === undefined
              ? current.dealerPrice
              : payload.dealerPrice ?? null,
          customerPrice:
            payload.customerPrice === undefined
              ? current.customerPrice
              : payload.customerPrice ?? null,
        },
      }));
      setDrafts((all) => {
        const n = { ...all };
        delete n[id];
        return n;
      });
    } finally {
      setPending(null);
    }
  }

  async function archive(p: AdminProductRow) {
    if (pending === p.id) return;
    const ok = window.confirm(
      `Delete "${p.name}"?\n\nIt disappears from the catalogue and from the new-order search. Past orders keep this product — nothing is lost there.`,
    );
    if (!ok) return;
    setPending(p.id);
    try {
      const r = await updateProductMetaAction({ id: p.id, active: false });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Product deleted.");
      setProductMap((m) => {
        const n = { ...m };
        delete n[p.id];
        return n;
      });
      setDrafts((all) => {
        const n = { ...all };
        delete n[p.id];
        return n;
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-11 w-80 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)]/60"
        />
        <span className="text-xs text-[color:var(--color-ink-3)]">
          {Object.keys(productMap).length} {t("totalProducts")}
        </span>
      </div>

      {grouped.map(({ cat, items }, catIdx) => (
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
                <th className="px-4 py-2 w-[36%]">{t("colName")}</th>
                <th className="px-4 py-2">{t("colSpec")}</th>
                <th className="px-4 py-2 text-right">{t("colDealerWoMotor")}</th>
                <th className="px-4 py-2 text-right">{t("colDealer")}</th>
                <th className="px-4 py-2 text-right">{t("colCustomer")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const draft = drafts[p.id];
                const dirty = draft !== undefined;
                return (
                  <tr
                    key={p.id}
                    className={`group border-t border-[color:var(--color-border)] ${
                      dirty ? "bg-[color:var(--color-warn-bg)]/40" : ""
                    }`}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="font-medium">{p.name}</div>
                          {p.aliases.length > 0 && (
                            <div className="text-xs text-[color:var(--color-ink-3)]">
                              {p.aliases.join(" · ")}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <ProductFormSheet
                            mode="edit"
                            categories={categories}
                            product={toEditable(p)}
                            onSaved={(next) =>
                              setProductMap((m) => ({
                                ...m,
                                [p.id]: {
                                  ...m[p.id]!,
                                  name: next.name,
                                  spec: next.spec,
                                  aliases: next.aliases,
                                  categoryId: next.categoryId,
                                  isStockItem: next.isStockItem,
                                  dealerPriceWoMotor: next.dealerPriceWoMotor,
                                  dealerPrice: next.dealerPrice,
                                  customerPrice: next.customerPrice,
                                },
                              }))
                            }
                            trigger={
                              <button
                                type="button"
                                aria-label={`Edit ${p.name}`}
                                className="rounded p-1 text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)] focus-visible:ring-2"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            }
                          />
                          <button
                            type="button"
                            aria-label={`Delete ${p.name}`}
                            onClick={() => archive(p)}
                            disabled={pending === p.id}
                            className="rounded p-1 text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-danger-bg)] hover:text-[color:var(--color-danger)] focus-visible:ring-2 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-[color:var(--color-ink-2)]">{p.spec ?? "—"}</td>
                    {(["dealerPriceWoMotor", "dealerPrice", "customerPrice"] as const).map(
                      (field, i) => (
                        <td key={field} className="px-2 py-2 text-right">
                          <input
                            type="text"
                            inputMode="numeric"
                            data-gold={catIdx === 0 && i === 2 ? "true" : undefined}
                            value={
                              draft?.[field] !== undefined ? draft[field]! : fmtInput(p[field])
                            }
                            onChange={(e) => patchDraft(p.id, { [field]: e.target.value })}
                            onBlur={() => dirty && save(p.id)}
                            placeholder="—"
                            disabled={pending === p.id}
                            className={`h-9 w-28 rounded border bg-transparent px-2 text-right tabular-nums ${
                              dirty && draft?.[field] !== undefined
                                ? "border-[color:var(--color-warn)]"
                                : "border-[color:var(--color-border)]"
                            }`}
                          />
                        </td>
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export { formatInr };
