"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MapPin, Phone, RotateCcw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/app/Toast";
import { setServiceStatusAction } from "../actions";

export type ServiceRowDTO = {
  id: string;
  number: string;
  createdAt: string;
  customerName: string;
  phone: string; // E.164
  address: string | null;
  product: string | null;
  complaint: string;
  notes: string | null;
  serviceType: "FREE" | "PAID";
  status: "PENDING" | "DONE";
  doneAt: string | null;
  createdByName: string;
  doneByName: string | null;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const fmtPhone = (e164: string) => {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
};

function TypePill({ t }: { t: ServiceRowDTO["serviceType"] }) {
  return t === "FREE" ? (
    <Badge tone="ok">Free</Badge>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-warn-fill)]/40 bg-[color:var(--color-warn-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-warn)]">
      Paid
    </span>
  );
}

function StatusPill({ s }: { s: ServiceRowDTO["status"] }) {
  return s === "DONE" ? <Badge tone="ok">Done</Badge> : <Badge tone="warn">Pending</Badge>;
}

export function ServiceList({
  rows,
  canUpdate,
  showCreator,
  emptyText,
}: {
  rows: ServiceRowDTO[];
  canUpdate: boolean;
  showCreator: boolean;
  emptyText: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function setStatus(r: ServiceRowDTO, status: "PENDING" | "DONE") {
    setBusyId(r.id);
    try {
      const res = await setServiceStatusAction({ id: r.id, status });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(status === "DONE" ? `${r.number} marked done` : `${r.number} reopened`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="surface-card flex flex-col items-center gap-2 px-4 py-12 text-center text-[color:var(--color-ink-3)]">
        <Wrench className="h-6 w-6" aria-hidden />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {rows.map((r) => {
        const busy = busyId === r.id;
        return (
          <li key={r.id} className="surface-card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums">{r.number}</span>
              <span className="text-xs text-[color:var(--color-ink-3)]">{fmtDate(r.createdAt)}</span>
              <span className="ml-auto flex items-center gap-1.5">
                <TypePill t={r.serviceType} />
                <StatusPill s={r.status} />
              </span>
            </div>

            <div className="min-w-0">
              <div className="text-base font-semibold">{r.customerName}</div>
              <a
                href={`tel:${r.phone}`}
                className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-accent)] hover:underline"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {fmtPhone(r.phone)}
              </a>
              {r.address && (
                <p className="mt-1 flex items-start gap-1.5 text-sm text-[color:var(--color-ink-2)]">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="whitespace-pre-line break-words">{r.address}</span>
                </p>
              )}
            </div>

            <div className="rounded-[var(--radius)] bg-[color:var(--color-surface-2)] px-3 py-2.5 text-sm">
              {r.product && <div className="mb-1 font-medium text-[color:var(--color-ink)]">{r.product}</div>}
              <p className="whitespace-pre-line break-words text-[color:var(--color-ink-2)]">{r.complaint}</p>
              {r.notes && <p className="mt-1.5 text-xs text-[color:var(--color-ink-3)]">Note: {r.notes}</p>}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[color:var(--color-border)] pt-3 text-xs text-[color:var(--color-ink-3)]">
              <div className="min-w-0 flex-1">
                {showCreator && <div>Logged by {r.createdByName}</div>}
                {r.status === "DONE" && r.doneAt ? (
                  <div className="text-[color:var(--color-ok)]">
                    Done {fmtDate(r.doneAt)}
                    {r.doneByName ? ` · ${r.doneByName}` : ""}
                  </div>
                ) : !canUpdate ? (
                  <div>Production will update this</div>
                ) : null}
              </div>
              {canUpdate &&
                (r.status === "PENDING" ? (
                  <Button size="sm" disabled={busy} onClick={() => void setStatus(r, "DONE")} className="h-10 px-4">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {busy ? "Saving…" : "Mark done"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus(r, "PENDING")} className="h-10 px-4">
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {busy ? "Saving…" : "Reopen"}
                  </Button>
                ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
