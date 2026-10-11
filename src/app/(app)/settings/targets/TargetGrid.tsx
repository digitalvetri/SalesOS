"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import Decimal from "decimal.js";
import { toast } from "@/components/app/Toast";
import { setTargetAction } from "./actions";
import { formatInr } from "@/components/app/Money";

export type TargetGridProps = {
  salespeople: Array<{ id: string; name: string }>;
  months: string[]; // YYYY-MM
  values: Record<string, Record<string, string>>;
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function toNumber(s: string): Decimal | null {
  if (!s.trim()) return null;
  // Forgiving input: "1,50,000", "15k", "1.5l"
  const normalized = s
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/₹/g, "")
    .trim();
  if (/^(\d+(\.\d+)?)([kl])?$/.test(normalized)) {
    const match = /^(\d+(?:\.\d+)?)([kl])?$/.exec(normalized);
    if (!match) return null;
    const value = new Decimal(match[1]!);
    const suffix = match[2];
    if (suffix === "k") return value.mul(1000);
    if (suffix === "l") return value.mul(100000);
    return value;
  }
  return null;
}

export function TargetGrid({ salespeople, months, values }: TargetGridProps) {
  const t = useTranslations("settings.targets");
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState<string | null>(null);

  // Current-month cell gets a gold accent — the "focus for this screen" element.
  const nowYm = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();

  const cellValue = (userId: string, month: string): string => {
    const key = `${userId}:${month}`;
    if (draft[key] !== undefined) return draft[key]!;
    const raw = values[userId]?.[month];
    return raw ? new Decimal(raw).toFixed(0) : "";
  };

  async function save(userId: string, month: string, raw: string) {
    const key = `${userId}:${month}`;
    const stored = values[userId]?.[month];
    const incoming = toNumber(raw);
    if (raw.trim() !== "" && !incoming) {
      toast.error("Enter a valid amount (e.g. 1,50,000 or 1.5l)");
      return;
    }
    const equal =
      (stored && incoming && new Decimal(stored).equals(incoming)) ||
      (!stored && (!incoming || incoming.isZero()));
    if (equal) {
      setDraft((d) => {
        const n = { ...d };
        delete n[key];
        return n;
      });
      return;
    }

    setPending(key);
    try {
      const r = await setTargetAction({
        userId,
        month,
        amount: (incoming ?? new Decimal(0)).toString(),
      });
      if (!r.ok) toast.error(r.error.message);
      else {
        values[userId] ??= {};
        values[userId]![month] = incoming?.toString() ?? "0";
        setDraft((d) => {
          const n = { ...d };
          delete n[key];
          return n;
        });
      }
    } finally {
      setPending(null);
    }
  }

  function totalFor(userId: string): Decimal {
    const rowValues = values[userId] ?? {};
    return Object.values(rowValues).reduce(
      (sum, v) => sum.plus(new Decimal(v || 0)),
      new Decimal(0),
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
          <tr>
            <th className="px-4 py-3">{t("colSalesperson")}</th>
            {months.map((m) => {
              const isNow = m === nowYm;
              return (
                <th
                  key={m}
                  {...(isNow ? { "data-gold": "true" } : {})}
                  className={`px-4 py-3 text-right ${isNow ? "rounded-sm" : ""}`}
                >
                  {monthLabel(m)}
                </th>
              );
            })}
            <th className="px-4 py-3 text-right">{t("colTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {salespeople.map((u) => (
            <tr key={u.id} className="border-t border-[color:var(--color-border)]">
              <td className="px-4 py-3 font-medium">{u.name}</td>
              {months.map((m) => {
                const key = `${u.id}:${m}`;
                const isDirty = draft[key] !== undefined;
                return (
                  <td key={m} className="px-2 py-2 text-right">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cellValue(u.id, m)}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [key]: e.target.value }))
                      }
                      onBlur={(e) => save(u.id, m, e.target.value)}
                      placeholder={t("placeholder")}
                      className={`h-9 w-28 rounded border bg-transparent px-2 text-right tabular-nums ${
                        isDirty
                          ? "border-[color:var(--color-warn)]"
                          : "border-[color:var(--color-border)]"
                      } ${pending === key ? "opacity-50" : ""}`}
                      disabled={pending === key}
                    />
                  </td>
                );
              })}
              <td className="px-4 py-3 text-right tabular-nums font-semibold">
                {formatInr(totalFor(u.id))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
