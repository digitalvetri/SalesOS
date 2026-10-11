"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";

type PreviewResponse = {
  ok: true;
  data: {
    totals: { rows: number; withPrices: number; issues: Record<string, number> };
    categories: string[];
    sampleRows: Array<{
      rowIndex: number;
      category: string;
      name: string;
      spec: string | null;
      dealerPriceWoMotor: string | null;
      dealerPrice: string | null;
      customerPrice: string | null;
      issues: string[];
    }>;
    token: string;
  };
};

type CommitResponse = { ok: true; data: { created: number; updated: number; totalRows: number } };

export function ImportForm() {
  const t = useTranslations("catalogue.import");
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [preview, setPreview] = React.useState<PreviewResponse["data"] | null>(null);

  async function previewFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    setPending(true);
    try {
      const res = await fetch("/api/catalogue/import/preview", {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: buf,
      });
      const json = (await res.json()) as PreviewResponse | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setPreview(json.data);
    } finally {
      setPending(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setPending(true);
    try {
      const res = await fetch("/api/catalogue/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: preview.token }),
      });
      const json = (await res.json()) as CommitResponse | { ok: false; error: { message: string } };
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      toast.success(
        t("committed", {
          created: json.data.created,
          updated: json.data.updated,
        }),
      );
      router.push("/catalogue");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <Label htmlFor="file">{t("fileLabel")}</Label>
        <input
          id="file"
          type="file"
          accept=".xlsx"
          onChange={previewFile}
          disabled={pending}
          className="mt-2 block w-full text-sm"
        />
      </div>

      {preview && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Stat label={t("rowsFound")} value={preview.totals.rows} />
            <Stat label={t("withPrices")} value={preview.totals.withPrices} />
            <Stat label={t("categoriesFound")} value={preview.categories.length} />
          </div>

          {Object.entries(preview.totals.issues).some(([, n]) => n > 0) && (
            <div className="rounded-[var(--radius)] border border-[color:var(--color-warn)]/40 bg-[color:var(--color-warn-bg)] p-4 text-sm">
              <div className="label-caps mb-2">{t("issues")}</div>
              <ul className="space-y-1">
                {Object.entries(preview.totals.issues)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => (
                    <li key={k}>
                      <span className="font-medium">{n}</span> × {k}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-surface-2)] text-left text-xs uppercase text-[color:var(--color-ink-3)]">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">Spec</th>
                  <th className="px-4 py-2 text-right">Dealer</th>
                  <th className="px-4 py-2 text-right">Customer</th>
                </tr>
              </thead>
              <tbody>
                {preview.sampleRows.map((r) => (
                  <tr key={r.rowIndex} className="border-t border-[color:var(--color-border)]">
                    <td className="px-4 py-2 text-[color:var(--color-ink-3)]">{r.rowIndex}</td>
                    <td className="px-4 py-2">{r.category}</td>
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2">{r.spec ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.dealerPrice ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.customerPrice ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            gold
            disabled={pending}
            onClick={commit}
            className="h-12 w-full md:w-auto md:min-w-[240px]"
          >
            {pending ? "…" : t("commit", { total: preview.totals.rows })}
          </Button>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <div className="label-caps">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
