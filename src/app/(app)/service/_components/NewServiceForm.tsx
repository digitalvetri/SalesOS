"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/app/Toast";
import { cn } from "@/lib/utils";
import { createServiceRequestAction } from "../actions";

type ServiceType = "FREE" | "PAID";
const EMPTY = { customerName: "", phone: "", address: "", product: "", complaint: "", notes: "" };

const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]";
const textareaCls =
  "w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2.5 text-base text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)]/60";

export function NewServiceForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false); // phones only — always open from sm up
  const [v, setV] = React.useState(EMPTY);
  const [serviceType, setServiceType] = React.useState<ServiceType | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    setError(null);
    const raw = v.phone.replace(/\D/g, "");
    // Accept pasted "+91 98765 43210" / "098765 43210" too.
    const digits = raw.length === 12 && raw.startsWith("91") ? raw.slice(2) : raw.length === 11 && raw.startsWith("0") ? raw.slice(1) : raw;
    if (!v.customerName.trim()) return setError("Enter the customer's name.");
    if (digits.length !== 10) return setError("Enter a 10-digit mobile number.");
    if (!v.complaint.trim()) return setError("Describe the complaint.");
    if (!serviceType) return setError("Choose Free or Paid service.");
    setPending(true);
    try {
      const r = await createServiceRequestAction({
        customerName: v.customerName,
        phone: digits,
        address: v.address || null,
        product: v.product || null,
        complaint: v.complaint,
        serviceType,
        notes: v.notes || null,
      });
      if (!r.ok) {
        setError(r.error.message);
        toast.error(r.error.message);
        return;
      }
      toast.success(`Service request ${r.data.number} saved`);
      setV(EMPTY);
      setServiceType(null);
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mb-6">
      <Button
        type="button"
        variant="outline"
        className={cn("w-full sm:hidden", open && "hidden")}
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        <Plus className="h-4 w-4" aria-hidden /> New service request
      </Button>

      <form
        className={cn("surface-card p-4 sm:block sm:p-5", open ? "block" : "hidden")}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">New service request</h2>
            <p className="text-xs text-[color:var(--color-ink-3)]">Production will see it straight away.</p>
          </div>
          <button
            type="button"
            className="-m-1 rounded p-1 text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] sm:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close form"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>Customer name</span>
            <Input value={v.customerName} onChange={set("customerName")} maxLength={120} autoComplete="off" placeholder="e.g. Ravi Kumar" />
          </label>
          <label className="block">
            <span className={fieldLabel}>Mobile</span>
            <div className="flex">
              <span className="inline-flex h-11 items-center rounded-l-[var(--radius)] border border-r-0 border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] px-3 text-sm text-[color:var(--color-ink-2)]">
                +91
              </span>
              <Input
                value={v.phone}
                onChange={set("phone")}
                inputMode="numeric"
                autoComplete="off"
                maxLength={14}
                placeholder="98765 43210"
                className="rounded-l-none"
              />
            </div>
          </label>
          <label className="block">
            <span className={fieldLabel}>Product <span className="font-normal normal-case tracking-normal">(optional)</span></span>
            <Input value={v.product} onChange={set("product")} maxLength={200} placeholder="Machine / model" />
          </label>
          <label className="block">
            <span className={fieldLabel}>Address <span className="font-normal normal-case tracking-normal">(optional)</span></span>
            <textarea value={v.address} onChange={set("address")} maxLength={500} rows={2} className={textareaCls} placeholder="Shop / town" />
          </label>
          <label className="block md:col-span-2">
            <span className={fieldLabel}>Complaint</span>
            <textarea value={v.complaint} onChange={set("complaint")} maxLength={2000} rows={3} className={textareaCls} placeholder="What is wrong with the machine?" />
          </label>

          <div className="md:col-span-2">
            <span className={fieldLabel} id="svc-type-label">Service type</span>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="svc-type-label">
              {(["FREE", "PAID"] as const).map((t) => {
                const on = serviceType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setServiceType(t)}
                    className={cn(
                      "h-14 rounded-[var(--radius)] border-2 text-base font-semibold transition-colors",
                      !on && "border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]",
                      on && t === "FREE" && "border-[color:var(--color-ok)] bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]",
                      on && t === "PAID" && "border-[color:var(--color-warn-fill)] bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]",
                    )}
                  >
                    {t === "FREE" ? "Free service" : "Paid service"}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block md:col-span-2">
            <span className={fieldLabel}>Notes <span className="font-normal normal-case tracking-normal">(optional)</span></span>
            <Input value={v.notes} onChange={set("notes")} maxLength={1000} placeholder="Warranty, visit time, anything else" />
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-[var(--radius)] bg-[color:var(--color-danger-bg)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <Button type="submit" gold disabled={pending} className="w-full sm:w-auto">
            {pending ? "Saving…" : "Save service request"}
          </Button>
        </div>
      </form>
    </section>
  );
}
