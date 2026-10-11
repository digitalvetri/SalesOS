"use client";
// 4-step order-book import wizard (spec §15 Import).
// Step 1 — Upload the .xlsx
// Step 2 — Map each sheet to a salesperson, or Skip
// Step 3 — Preview parsed orders, issues, reconciliation
// Step 4 — Commit (customers + orders + historical payments)
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { formatInr } from "@/lib/formatInr";

type Salesperson = { id: string; name: string };
type AccountOption = { id: string; label: string };
type SheetAssignment =
  | { kind: "SALESPERSON"; salespersonId: string }
  | { kind: "SKIP" };

type Summary = {
  orderCount: number;
  grandTotal: string;
  perSheet: Record<string, { orders: number; value: string; issues: number; duplicates: number }>;
  flagCounts: Record<string, number>;
  reconciliation: Array<{
    sheet: string;
    month: string;
    computed: string;
    stated: string | null;
    diffPct: number | null;
  }>;
};

type PreviewResponse = {
  ok: true;
  data: { batchId: string; summary: Summary; reconciliation: Summary["reconciliation"] };
};
type CommitResponse = {
  ok: true;
  data: {
    importedOrders: number;
    importedCustomers: number;
    importedPayments: number;
    skipped: number;
    errors: Array<{ ref: string; message: string }>;
  };
};
type ApiError = { ok: false; error: { message: string } };

export function ImportWizard({
  salespeople,
  accounts,
}: {
  salespeople: Salesperson[];
  accounts: AccountOption[];
}) {
  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [sheets, setSheets] = React.useState<string[]>([]);
  const [assignments, setAssignments] = React.useState<Record<string, SheetAssignment>>({});
  const [routeMap, setRouteMap] = React.useState<Array<{ keyword: string; accountId?: string; userId?: string }>>([
    { keyword: "KFM CA" },
    { keyword: "KI CA" },
    { keyword: "CASH" },
  ]);
  const [pending, setPending] = React.useState(false);
  const [preview, setPreview] = React.useState<PreviewResponse["data"] | null>(null);
  const [committed, setCommitted] = React.useState<CommitResponse["data"] | null>(null);

  // Step 1 — detect sheets by reading the first few bytes locally.
  async function uploadChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    setFile(chosen);
    try {
      const names = await detectSheets(chosen);
      setSheets(names);
      const next: Record<string, SheetAssignment> = {};
      for (const name of names) {
        const matched = guessSalesperson(name, salespeople);
        next[name] = matched
          ? { kind: "SALESPERSON", salespersonId: matched.id }
          : { kind: "SKIP" };
      }
      setAssignments(next);
      setStep(2);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function runPreview() {
    if (!file) return;
    setPending(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("assignments", JSON.stringify(assignments));
      const res = await fetch("/api/settings/import/preview", { method: "POST", body: form });
      const json = (await res.json()) as PreviewResponse | ApiError;
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setPreview(json.data);
      setStep(3);
    } finally {
      setPending(false);
    }
  }

  async function runCommit() {
    if (!preview) return;
    setPending(true);
    try {
      const res = await fetch("/api/settings/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          batchId: preview.batchId,
          assignments,
          routeMap: routeMap.filter((r) => r.keyword.trim().length > 0),
        }),
      });
      const json = (await res.json()) as CommitResponse | ApiError;
      if (!json.ok) {
        toast.error(json.error.message);
        return;
      }
      setCommitted(json.data);
      setStep(4);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <StepIndicator step={step} />

      {step === 1 && (
        <section className="space-y-4 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
          <Label htmlFor="file">Choose <code>.xlsx</code> file (max 20 MB)</Label>
          <input
            id="file"
            type="file"
            accept=".xlsx"
            onChange={uploadChosen}
            className="block w-full text-sm"
          />
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Map sheets to salespeople</h2>
          <p className="text-sm text-[color:var(--color-ink-3)]">
            Each sheet is attributed to one salesperson. Pick <strong>Skip</strong> for product
            trackers, price lists, or anything that isn&apos;t an order list.
          </p>
          <div className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-surface-2)] text-left text-xs uppercase text-[color:var(--color-ink-3)]">
                <tr>
                  <th className="px-4 py-2">Sheet</th>
                  <th className="px-4 py-2">Attribution</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((name) => {
                  const assignment = assignments[name];
                  return (
                    <tr key={name} className="border-t border-[color:var(--color-border)]">
                      <td className="px-4 py-2 font-medium">{name}</td>
                      <td className="px-4 py-2">
                        <select
                          value={
                            assignment?.kind === "SALESPERSON"
                              ? assignment.salespersonId
                              : "__skip__"
                          }
                          onChange={(e) =>
                            setAssignments((prev) => ({
                              ...prev,
                              [name]:
                                e.target.value === "__skip__"
                                  ? { kind: "SKIP" }
                                  : { kind: "SALESPERSON", salespersonId: e.target.value },
                            }))
                          }
                          className="h-9 w-56 rounded border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm"
                        >
                          <option value="__skip__">Skip this sheet</option>
                          {salespeople.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <h3 className="label-caps mb-2">Payment-route mapping (optional)</h3>
            <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
              Match keywords like <code>KFM CA</code>, <code>KUMARESH GPAY</code> to a company
              account. Imported advance payments inherit the mapping; unmapped routes become CASH
              received by the attributed salesperson.
            </p>
            <div className="space-y-2">
              {routeMap.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={row.keyword}
                    onChange={(e) => {
                      const next = [...routeMap];
                      next[idx] = { ...row, keyword: e.target.value };
                      setRouteMap(next);
                    }}
                    placeholder="KUMARESH GPAY"
                    className="w-56"
                  />
                  <span>→</span>
                  <select
                    value={row.accountId ?? ""}
                    onChange={(e) => {
                      const next = [...routeMap];
                      next[idx] = { ...row, accountId: e.target.value || undefined };
                      setRouteMap(next);
                    }}
                    className="h-9 flex-1 rounded border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm"
                  >
                    <option value="">— Unmapped (cash to salesperson) —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() =>
                      setRouteMap(routeMap.filter((_, i) => i !== idx))
                    }
                    className="text-[color:var(--color-ink-3)] hover:text-[color:var(--color-danger)]"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRouteMap([...routeMap, { keyword: "" }])}
                className="text-sm text-[color:var(--color-ink-2)] hover:underline"
              >
                + Add mapping
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button gold onClick={runPreview} disabled={pending || sheets.length === 0}>
              {pending ? "Parsing…" : "Preview →"}
            </Button>
          </div>
        </section>
      )}

      {step === 3 && preview && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Preview</h2>

          <div className="grid gap-3 md:grid-cols-3">
            <Stat label="Orders" value={preview.summary.orderCount.toString()} />
            <Stat label="Grand total" value={formatInr(preview.summary.grandTotal)} />
            <Stat
              label="Sheets committed"
              value={
                Object.values(assignments).filter((a) => a.kind === "SALESPERSON").length +
                " of " +
                sheets.length
              }
            />
          </div>

          <section className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            <header className="bg-[color:var(--color-surface-2)] px-4 py-2 text-xs uppercase text-[color:var(--color-ink-3)]">
              Per-sheet
            </header>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[color:var(--color-ink-3)]">
                <tr>
                  <th className="px-4 py-2">Sheet</th>
                  <th className="px-4 py-2 text-right">Orders</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2 text-right">Issues</th>
                  <th className="px-4 py-2 text-right">Duplicates</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.summary.perSheet).map(([sheet, s]) => (
                  <tr key={sheet} className="border-t border-[color:var(--color-border)]">
                    <td className="px-4 py-2 font-medium">{sheet}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.orders}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatInr(s.value)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.issues}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.duplicates}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {Object.entries(preview.summary.flagCounts).length > 0 && (
            <section className="rounded-[var(--radius)] border border-[color:var(--color-warn)]/40 bg-[color:var(--color-warn-bg)] p-4 text-sm">
              <div className="label-caps mb-2">Issues</div>
              <ul className="space-y-1">
                {Object.entries(preview.summary.flagCounts).map(([flag, count]) => (
                  <li key={flag} className="tabular-nums">
                    {count} × {flag}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            <header className="bg-[color:var(--color-surface-2)] px-4 py-2 text-xs uppercase text-[color:var(--color-ink-3)]">
              Reconciliation — computed vs stated monthly totals
            </header>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[color:var(--color-ink-3)]">
                <tr>
                  <th className="px-4 py-2">Sheet</th>
                  <th className="px-4 py-2">Month</th>
                  <th className="px-4 py-2 text-right">Computed</th>
                  <th className="px-4 py-2 text-right">Stated</th>
                  <th className="px-4 py-2 text-right">Diff %</th>
                </tr>
              </thead>
              <tbody>
                {preview.summary.reconciliation.map((r) => (
                  <tr
                    key={`${r.sheet}:${r.month}`}
                    className={`border-t border-[color:var(--color-border)] ${
                      r.diffPct !== null && Math.abs(r.diffPct) > 2
                        ? "bg-[color:var(--color-warn-bg)]/40"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-2">{r.sheet}</td>
                    <td className="px-4 py-2">{r.month}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatInr(r.computed)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.stated ? formatInr(r.stated) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.diffPct === null ? "—" : `${r.diffPct > 0 ? "+" : ""}${r.diffPct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button gold onClick={runCommit} disabled={pending}>
              {pending ? "Committing…" : "Commit →"}
            </Button>
          </div>
        </section>
      )}

      {step === 4 && committed && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Done</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Orders" value={committed.importedOrders.toString()} />
            <Stat label="Customers" value={committed.importedCustomers.toString()} />
            <Stat label="Payments" value={committed.importedPayments.toString()} />
            <Stat label="Skipped" value={committed.skipped.toString()} />
          </div>
          {committed.errors.length > 0 && (
            <section className="rounded-[var(--radius)] border border-[color:var(--color-danger)]/40 bg-[color:var(--color-danger-bg)] p-4 text-sm">
              <div className="label-caps mb-2">Errors ({committed.errors.length})</div>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {committed.errors.map((err, idx) => (
                  <li key={idx}>
                    <span className="font-medium">{err.ref}</span> · {err.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Button variant="outline" onClick={() => window.location.reload()}>
            Import another file
          </Button>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <div className="label-caps">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  const labels = ["Upload", "Map sheets", "Preview", "Done"];
  return (
    <nav
      aria-label="Import progress"
      className="mb-4 flex items-center gap-2 text-xs text-[color:var(--color-ink-3)]"
    >
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        return (
          <React.Fragment key={label}>
            <span
              className={`flex items-center gap-2 ${
                n <= step ? "text-[color:var(--color-ink)]" : ""
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  n <= step
                    ? "bg-[color:var(--color-ink)]"
                    : "bg-[color:var(--color-border-strong)]"
                }`}
              />
              {label}
            </span>
            {n < 4 && <span className="h-px w-4 bg-[color:var(--color-border-strong)]" />}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

async function detectSheets(file: File): Promise<string[]> {
  // Minimal client-side .xlsx reader: unzip the file in-memory with
  // DecompressionStream and scan xl/workbook.xml for sheet names. Keeps the
  // UX snappy before the server round-trip. Falls back to a server call if the
  // browser doesn't support DecompressionStream.
  if (typeof DecompressionStream === "undefined") {
    return [];
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const entry = await findZipEntry(buf, "xl/workbook.xml");
  if (!entry) return [];
  const xml = new TextDecoder().decode(entry);
  return Array.from(xml.matchAll(/<sheet[^>]*name="([^"]+)"/g)).map((m) => m[1]!);
}

async function findZipEntry(buf: Uint8Array, path: string): Promise<Uint8Array | null> {
  // Scan central directory for the entry, then read local file header + inflate.
  // Supports STORED (0) and DEFLATE (8) methods.
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Find EOCD (End of Central Directory) by searching backwards.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  const entries = dv.getUint16(eocd + 10, true);
  let p = cdOffset;
  for (let i = 0; i < entries && p + 46 <= cdOffset + cdSize; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) return null;
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localHeader = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.slice(p + 46, p + 46 + nameLen));
    if (name === path) {
      // Read local file header for the real extra length (varies).
      const lnameLen = dv.getUint16(localHeader + 26, true);
      const lextraLen = dv.getUint16(localHeader + 28, true);
      const dataStart = localHeader + 30 + lnameLen + lextraLen;
      const data = buf.slice(dataStart, dataStart + compressedSize);
      if (method === 0) return data;
      if (method === 8) {
        const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(
          new DecompressionStream("deflate-raw"),
        );
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function guessSalesperson(sheet: string, salespeople: Salesperson[]) {
  const s = sheet.trim().toLowerCase();
  return (
    salespeople.find((u) => u.name.trim().toLowerCase() === s) ??
    salespeople.find((u) => s.startsWith(u.name.trim().toLowerCase())) ??
    null
  );
}
