"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Decimal from "decimal.js";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { PhoneInput, type PhoneMatch } from "@/components/app/PhoneInput";
import { ProductPicker, type ProductHit } from "@/components/app/ProductPicker";
import { QtyStepper } from "@/components/app/QtyStepper";
import { Money, formatInr } from "@/components/app/Money";
import { parseAmount } from "@/lib/parseAmount";
import { saveDraft, loadDraft, clearDraft, formatSavedAt } from "@/lib/draft";
import { createOrderAction } from "../actions";
import { createCustomerAction } from "@/app/(app)/customers/actions";
import type { AccountKind, ChargeKind, PaymentMethod } from "@/server/repo/client";

type EntityOpt = { id: string; code: string; name: string };
type AccountOpt = { id: string; label: string; kind: AccountKind; entityId: string; entityCode: string };
type Actor = { id: string; name: string; canReceivePayments: boolean; defaultEntityId: string };
type StaffOpt = { id: string; name: string };

type Line = {
  key: string;
  productId: string | null;
  name: string;
  spec: string | null;
  listPrice: string | null; // customer price snapshot
  unitPriceRaw: string; // user input
  qty: number;
};

type Charge = {
  key: string;
  kind: ChargeKind;
  label: string;
  amountRaw: string;
};

type Advance = {
  amountRaw: string;
  method: PaymentMethod;
  receivedInto: string; // "account:ID" | "user:ID"
  reference: string;
};

type DraftShape = {
  step: 1 | 2 | 3;
  customerId: string | null;
  customerPhone: string;
  customerName: string;
  customerBusiness: string;
  customerCity: string;
  customerType: "END_CUSTOMER" | "DEALER" | "INSTITUTION";
  entityId: string;
  promisedDelivery: string;
  promisedPayment: string;
  lines: Line[];
  charges: Charge[];
  notes: string;
  advance: Advance;
  advanceEnabled: boolean;
};

const DRAFT_KEY_PREFIX = "orders.new";

export function NewOrderWizard({
  actor,
  entities,
  accounts,
  receiveStaff,
}: {
  actor: Actor;
  entities: EntityOpt[];
  accounts: AccountOpt[];
  receiveStaff: StaffOpt[];
}) {
  const t = useTranslations("orderWizard");
  const router = useRouter();
  const draftKey = `${DRAFT_KEY_PREFIX}:${actor.id}`;

  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [pending, setPending] = React.useState(false);
  const [resumeOffer, setResumeOffer] = React.useState<{ at: number; draft: DraftShape } | null>(null);

  // Customer state
  const [customerPhoneRaw, setCustomerPhoneRaw] = React.useState("");
  const [customerPhoneE164, setCustomerPhoneE164] = React.useState<string | null>(null);
  const [customerMatch, setCustomerMatch] = React.useState<PhoneMatch | null>(null);
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [customerName, setCustomerName] = React.useState("");
  const [customerBusiness, setCustomerBusiness] = React.useState("");
  const [customerCity, setCustomerCity] = React.useState("Coimbatore");
  const [customerType, setCustomerType] = React.useState<"END_CUSTOMER" | "DEALER" | "INSTITUTION">(
    "END_CUSTOMER",
  );

  // Order state
  const [entityId, setEntityId] = React.useState(actor.defaultEntityId);
  const [promisedDelivery, setPromisedDelivery] = React.useState("");
  const [promisedPayment, setPromisedPayment] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [charges, setCharges] = React.useState<Charge[]>([]);
  const [notes, setNotes] = React.useState("");

  // Advance payment
  const [advanceEnabled, setAdvanceEnabled] = React.useState(false);
  const [advance, setAdvance] = React.useState<Advance>({
    amountRaw: "",
    method: "CASH",
    receivedInto: actor.canReceivePayments ? `user:${actor.id}` : accounts[0] ? `account:${accounts[0].id}` : "",
    reference: "",
  });

  // Load draft on mount.
  React.useEffect(() => {
    (async () => {
      const row = await loadDraft<DraftShape>(draftKey);
      if (row) setResumeOffer({ at: row.savedAt, draft: row.value });
    })();
  }, [draftKey]);

  // Save draft on every state change (debounced).
  const draft: DraftShape = React.useMemo(
    () => ({
      step,
      customerId,
      customerPhone: customerPhoneRaw,
      customerName,
      customerBusiness,
      customerCity,
      customerType,
      entityId,
      promisedDelivery,
      promisedPayment,
      lines,
      charges,
      notes,
      advance,
      advanceEnabled,
    }),
    [
      step,
      customerId,
      customerPhoneRaw,
      customerName,
      customerBusiness,
      customerCity,
      customerType,
      entityId,
      promisedDelivery,
      promisedPayment,
      lines,
      charges,
      notes,
      advance,
      advanceEnabled,
    ],
  );
  React.useEffect(() => {
    const touched =
      customerPhoneRaw.length > 0 || lines.length > 0 || charges.length > 0;
    if (!touched) return;
    const t = setTimeout(() => void saveDraft(draftKey, draft), 400);
    return () => clearTimeout(t);
  }, [draft, draftKey, customerPhoneRaw, lines, charges]);

  function restoreDraft(d: DraftShape) {
    setStep(d.step);
    setCustomerId(d.customerId);
    setCustomerPhoneRaw(d.customerPhone);
    setCustomerName(d.customerName);
    setCustomerBusiness(d.customerBusiness);
    setCustomerCity(d.customerCity);
    setCustomerType(d.customerType);
    setEntityId(d.entityId || actor.defaultEntityId);
    setPromisedDelivery(d.promisedDelivery);
    setPromisedPayment(d.promisedPayment);
    setLines(d.lines);
    setCharges(d.charges);
    setNotes(d.notes);
    setAdvance(d.advance);
    setAdvanceEnabled(d.advanceEnabled);
    setResumeOffer(null);
  }
  function discardDraft() {
    void clearDraft(draftKey);
    setResumeOffer(null);
  }

  // Derived money
  const subtotal = React.useMemo(() => {
    let s = new Decimal(0);
    for (const l of lines) {
      const p = parseAmount(l.unitPriceRaw);
      if (p) s = s.plus(p.mul(l.qty));
    }
    return s;
  }, [lines]);
  const chargesTotal = React.useMemo(() => {
    let s = new Decimal(0);
    for (const c of charges) {
      const p = parseAmount(c.amountRaw);
      if (p) s = s.plus(p);
    }
    return s;
  }, [charges]);
  const total = subtotal.plus(chargesTotal);
  const advanceAmount = parseAmount(advance.amountRaw) ?? new Decimal(0);
  const balanceAfterAdvance = total.minus(advanceEnabled ? advanceAmount : new Decimal(0));

  const belowListCount = React.useMemo(() => {
    let n = 0;
    for (const l of lines) {
      if (!l.listPrice) continue;
      const u = parseAmount(l.unitPriceRaw);
      if (u && u.lessThan(l.listPrice)) n++;
    }
    return n;
  }, [lines]);

  // ───── Step 1 handlers ─────
  function pickExistingCustomer() {
    if (!customerMatch) return;
    setCustomerId(customerMatch.id);
    setCustomerName(customerMatch.name);
    setCustomerBusiness(customerMatch.businessName ?? "");
    setStep(2);
  }

  async function createCustomerAndContinue() {
    if (!customerPhoneE164 || !customerName.trim()) {
      toast.error(t("step1.needPhoneAndName"));
      return;
    }
    setPending(true);
    try {
      const r = await createCustomerAction({
        phone: customerPhoneE164,
        name: customerName.trim(),
        businessName: customerBusiness.trim() || null,
        type: customerType,
        city: customerCity.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setCustomerId(r.data.id);
      setStep(2);
    } finally {
      setPending(false);
    }
  }

  // ───── Step 2 handlers ─────
  function addLineFromProduct(hit: ProductHit) {
    setLines((prev) => [
      ...prev,
      {
        key: cryptoKey(),
        productId: hit.id,
        name: hit.name,
        spec: hit.spec,
        listPrice: hit.customerPrice,
        unitPriceRaw: hit.customerPrice ?? "",
        qty: 1,
      },
    ]);
  }
  function addCustomLine() {
    setLines((prev) => [
      ...prev,
      {
        key: cryptoKey(),
        productId: null,
        name: "",
        spec: null,
        listPrice: null,
        unitPriceRaw: "",
        qty: 1,
      },
    ]);
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }
  function patchLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addCharge(kind: ChargeKind) {
    const defaultLabel: Record<ChargeKind, string> = {
      FREIGHT: "Freight",
      INSTALLATION: "Installation",
      PACKING: "Packing",
      OTHER: "Other",
    };
    setCharges((prev) => [
      ...prev,
      { key: cryptoKey(), kind, label: defaultLabel[kind], amountRaw: "" },
    ]);
  }
  function removeCharge(key: string) {
    setCharges((prev) => prev.filter((c) => c.key !== key));
  }

  // ───── Submit ─────
  async function submit() {
    if (pending) return;
    if (!customerId) {
      toast.error(t("step3.needCustomer"));
      return;
    }
    if (lines.length === 0) {
      toast.error(t("step3.needLines"));
      return;
    }
    const validLines = lines.every((l) => {
      const u = parseAmount(l.unitPriceRaw);
      return (
        l.name.trim().length > 0 && u !== null && u.isPositive() && l.qty > 0
      );
    });
    if (!validLines) {
      toast.error(t("step3.lineErrors"));
      return;
    }

    const linesPayload = lines.map((l) => {
      const u = parseAmount(l.unitPriceRaw)!;
      return {
        productId: l.productId,
        description: l.name,
        qty: l.qty,
        listPrice: l.listPrice,
        unitPrice: u.toString(),
      };
    });
    const chargesPayload = charges
      .map((c) => {
        const amt = parseAmount(c.amountRaw);
        if (!amt) return null;
        return { kind: c.kind, label: c.label, amount: amt.toString() };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const advancePayload = advanceEnabled && advanceAmount.isPositive()
      ? {
          amount: advanceAmount.toString(),
          method: advance.method,
          paidOn: new Date().toISOString(),
          receivedIntoAccountId: advance.receivedInto.startsWith("account:")
            ? advance.receivedInto.slice("account:".length)
            : null,
          receivedByUserId: advance.receivedInto.startsWith("user:")
            ? advance.receivedInto.slice("user:".length)
            : null,
          referenceNo: advance.reference.trim() || null,
        }
      : null;

    // UUID required by the server-action schema (z.string().uuid()).
    const idempotencyKey = crypto.randomUUID();

    setPending(true);
    try {
      const r = await createOrderAction({
        idempotencyKey,
        entityId,
        customerId,
        orderDate: new Date().toISOString(),
        promisedDeliveryDate: promisedDelivery ? new Date(promisedDelivery).toISOString() : null,
        promisedPaymentDate: promisedPayment ? new Date(promisedPayment).toISOString() : null,
        lines: linesPayload,
        charges: chargesPayload,
        notes: notes.trim() || null,
        advance: advancePayload,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      await clearDraft(draftKey);
      toast.success(
        r.data.needsApproval
          ? t("submittedPending", { number: r.data.number })
          : t("submitted", { number: r.data.number }),
      );
      router.push(`/orders/${r.data.id}`);
    } finally {
      setPending(false);
    }
  }

  // ───── UI ─────
  return (
    <div className="flex flex-1 flex-col px-4 py-4">
      {resumeOffer && (
        <div className="mb-4 rounded-[var(--radius)] border border-[color:var(--color-info)]/40 bg-[color:var(--color-info-bg)] p-3 text-sm">
          <div className="mb-2">
            {t("resume.title", { time: formatSavedAt(resumeOffer.at) })}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => restoreDraft(resumeOffer.draft)}>
              {t("resume.continue")}
            </Button>
            <Button size="sm" variant="outline" onClick={discardDraft}>
              {t("resume.discard")}
            </Button>
          </div>
        </div>
      )}

      <StepIndicator step={step} />

      {step === 1 && (
        <section className="space-y-5">
          <h2 className="text-lg font-semibold">{t("step1.title")}</h2>
          <PhoneInput
            value={customerPhoneRaw}
            onChange={setCustomerPhoneRaw}
            onNormalized={setCustomerPhoneE164}
            onMatch={setCustomerMatch}
            autoFocus
          />
          {customerMatch ? (
            <Button
              data-gold
              className="h-12 w-full"
              onClick={pickExistingCustomer}
            >
              {t("step1.useExisting", { name: customerMatch.name })} →
            </Button>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="cust-name">{t("step1.name")}</Label>
                <Input
                  id="cust-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-biz">{t("step1.business")}</Label>
                <Input
                  id="cust-biz"
                  value={customerBusiness}
                  onChange={(e) => setCustomerBusiness(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cust-city">{t("step1.city")}</Label>
                  <Input
                    id="cust-city"
                    value={customerCity}
                    onChange={(e) => setCustomerCity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cust-type">{t("step1.type")}</Label>
                  <select
                    id="cust-type"
                    value={customerType}
                    onChange={(e) =>
                      setCustomerType(e.target.value as typeof customerType)
                    }
                    className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
                  >
                    <option value="END_CUSTOMER">Customer</option>
                    <option value="DEALER">Dealer</option>
                    <option value="INSTITUTION">Institution</option>
                  </select>
                </div>
              </div>
              <Button
                data-gold
                className="h-12 w-full"
                disabled={!customerPhoneE164 || !customerName.trim() || pending}
                onClick={createCustomerAndContinue}
              >
                {pending ? "…" : t("step1.next")} →
              </Button>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t("step2.title")}</h2>

          {lines.map((l) => {
            const unit = parseAmount(l.unitPriceRaw);
            const belowList =
              l.listPrice && unit && unit.lessThan(l.listPrice) ? true : false;
            const lineTotal = unit ? unit.mul(l.qty) : null;
            return (
              <div
                key={l.key}
                className="space-y-3 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    {l.productId ? (
                      <>
                        <div className="font-medium">{l.name}</div>
                        {l.spec && (
                          <div className="text-xs text-[color:var(--color-ink-3)]">
                            {l.spec}
                          </div>
                        )}
                      </>
                    ) : (
                      <Input
                        placeholder={t("step2.customLabel")}
                        value={l.name}
                        onChange={(e) => patchLine(l.key, { name: e.target.value })}
                      />
                    )}
                    {l.listPrice && (
                      <div className="mt-1 text-xs text-[color:var(--color-ink-3)]">
                        {t("step2.listPrice")} {formatInr(l.listPrice)}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    aria-label="Remove line"
                    className="text-[color:var(--color-ink-3)] hover:text-[color:var(--color-danger)]"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor={`price-${l.key}`} className="text-xs">
                      {t("step2.price")}
                    </Label>
                    <Input
                      id={`price-${l.key}`}
                      value={l.unitPriceRaw}
                      onChange={(e) => patchLine(l.key, { unitPriceRaw: e.target.value })}
                      inputMode="numeric"
                      placeholder="29,500"
                      className="w-32 tabular-nums"
                    />
                  </div>
                  <QtyStepper value={l.qty} onChange={(q) => patchLine(l.key, { qty: q })} />
                  <div className="min-w-[90px] text-right">
                    <div className="text-xs text-[color:var(--color-ink-3)]">{t("step2.lineTotal")}</div>
                    <div className="tabular-nums">
                      {lineTotal ? formatInr(lineTotal) : "—"}
                    </div>
                  </div>
                </div>
                {belowList && (
                  <p className="text-xs text-[color:var(--color-warn)]">
                    {t("step2.belowList")}
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2">
            <ProductPicker
              trigger={
                <Button variant="outline" className="h-11">+ {t("step2.addMachine")}</Button>
              }
              onPick={addLineFromProduct}
            />
            <Button variant="outline" className="h-11" onClick={addCustomLine}>
              + {t("step2.addCustom")}
            </Button>
          </div>

          {charges.map((c) => (
            <div
              key={c.key}
              className="flex items-end gap-3 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3"
            >
              <div className="flex-1">
                <Label htmlFor={`charge-${c.key}`} className="text-xs">
                  {c.label}
                </Label>
                <Input
                  id={`charge-${c.key}`}
                  value={c.amountRaw}
                  onChange={(e) =>
                    setCharges((prev) =>
                      prev.map((x) => (x.key === c.key ? { ...x, amountRaw: e.target.value } : x)),
                    )
                  }
                  inputMode="numeric"
                  placeholder="500"
                  className="w-32 tabular-nums"
                />
              </div>
              <button
                type="button"
                onClick={() => removeCharge(c.key)}
                aria-label="Remove charge"
                className="pb-2 text-[color:var(--color-ink-3)] hover:text-[color:var(--color-danger)]"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => addCharge("FREIGHT")}
              className="text-[color:var(--color-ink-2)] hover:underline"
            >
              + {t("step2.addFreight")}
            </button>
            <button
              type="button"
              onClick={() => addCharge("INSTALLATION")}
              className="text-[color:var(--color-ink-2)] hover:underline"
            >
              + {t("step2.addInstallation")}
            </button>
            <button
              type="button"
              onClick={() => addCharge("PACKING")}
              className="text-[color:var(--color-ink-2)] hover:underline"
            >
              + {t("step2.addPacking")}
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-[color:var(--color-border)] pt-3">
            <span className="text-sm text-[color:var(--color-ink-2)]">{t("step2.subtotal")}</span>
            <Money value={subtotal.toString()} size="lg" />
          </div>

          <Button
            data-gold
            className="h-12 w-full"
            disabled={lines.length === 0}
            onClick={() => setStep(3)}
          >
            {t("step2.next")} →
          </Button>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full py-2 text-xs text-[color:var(--color-ink-3)]"
          >
            ← {t("back")}
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t("step3.title")}</h2>

          <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <div className="label-caps mb-1">{t("step3.customer")}</div>
            <div className="font-medium">{customerName || customerMatch?.name}</div>
            <div className="text-sm text-[color:var(--color-ink-3)] tabular-nums">
              {customerPhoneE164 ?? customerPhoneRaw}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entity">{t("step3.billFrom")}</Label>
            <div className="flex gap-2">
              {entities.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEntityId(e.id)}
                  className={`h-11 flex-1 rounded-[var(--radius)] border text-sm ${
                    entityId === e.id
                      ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] font-medium"
                      : "border-[color:var(--color-border-strong)]"
                  }`}
                >
                  {e.code}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pdd">{t("step3.deliveryBy")}</Label>
            <Input
              id="pdd"
              type="date"
              value={promisedDelivery}
              onChange={(e) => setPromisedDelivery(e.target.value)}
            />
          </div>

          <div className="space-y-2 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={advanceEnabled}
                onChange={(e) => setAdvanceEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="font-medium">{t("step3.advanceToggle")}</span>
            </label>

            {advanceEnabled && (
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="adv-amount">{t("step3.amount")}</Label>
                  <Input
                    id="adv-amount"
                    value={advance.amountRaw}
                    onChange={(e) => setAdvance((p) => ({ ...p, amountRaw: e.target.value }))}
                    inputMode="numeric"
                    placeholder="20,000"
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("step3.method")}</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"] as PaymentMethod[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAdvance((p) => ({ ...p, method: m }))}
                        className={`h-10 rounded-[var(--radius)] border text-xs ${
                          advance.method === m
                            ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] font-medium"
                            : "border-[color:var(--color-border-strong)]"
                        }`}
                      >
                        {m.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adv-into">{t("step3.receivedInto")}</Label>
                  <select
                    id="adv-into"
                    value={advance.receivedInto}
                    onChange={(e) =>
                      setAdvance((p) => ({ ...p, receivedInto: e.target.value }))
                    }
                    className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
                  >
                    {accounts
                      .filter((a) => a.entityId === entityId)
                      .map((a) => (
                        <option key={a.id} value={`account:${a.id}`}>
                          {a.label}
                        </option>
                      ))}
                    {receiveStaff.map((u) => (
                      <option key={u.id} value={`user:${u.id}`}>
                        {u.id === actor.id ? `Me (${u.name})` : u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adv-ref">{t("step3.reference")}</Label>
                  <Input
                    id="adv-ref"
                    value={advance.reference}
                    onChange={(e) =>
                      setAdvance((p) => ({ ...p, reference: e.target.value }))
                    }
                    placeholder="UTR / cheque no."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ppd">{t("step3.payBalanceBy")}</Label>
                  <Input
                    id="ppd"
                    type="date"
                    value={promisedPayment}
                    onChange={(e) => setPromisedPayment(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t("step3.note")}</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-sm"
              maxLength={1000}
            />
          </div>

          <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-4">
            <div className="flex justify-between text-sm">
              <span>{t("step3.total")}</span>
              <Money value={total.toString()} />
            </div>
            {advanceEnabled && (
              <div className="mt-1 flex justify-between text-sm">
                <span>{t("step3.advance")}</span>
                <Money value={advanceAmount.toString()} muted />
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-[color:var(--color-border)] pt-2">
              <span className="font-medium">{t("step3.balanceAfterAdvance")}</span>
              <Money value={balanceAfterAdvance.toString()} size="lg" />
            </div>
          </div>

          {belowListCount > 0 && (
            <div className="rounded-[var(--radius)] border border-[color:var(--color-warn)]/40 bg-[color:var(--color-warn-bg)] p-3 text-xs">
              {t("step3.approvalNote")}
            </div>
          )}

          <Button
            data-gold
            className="h-12 w-full"
            onClick={submit}
            disabled={pending}
          >
            {pending ? "…" : t("step3.confirm")}
          </Button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full py-2 text-xs text-[color:var(--color-ink-3)]"
          >
            ← {t("back")}
          </button>
        </section>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div
      className="mb-6 flex items-center justify-center gap-2 text-xs text-[color:var(--color-ink-3)]"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={3}
    >
      {[1, 2, 3].map((n) => (
        <span key={n} className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              n <= step ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-border-strong)]"
            }`}
          />
          {n < 3 && <span className="h-px w-6 bg-[color:var(--color-border-strong)]" />}
        </span>
      ))}
      <span className="ml-2 tabular-nums">
        {step} of 3
      </span>
    </div>
  );
}

function cryptoKey(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
