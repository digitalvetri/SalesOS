"use client";
// §11.10 Dispatch board. Desktop: four columns. Mobile: one column at a time
// with segmented tabs. [GOLD] = the action on the oldest overdue card.
// Data arrives as the money-free Dispatch DTO (repo/dispatchBoard.ts).
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Camera, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QtyStepper } from "@/components/app/QtyStepper";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { toast } from "@/components/app/Toast";
import { compressAndUpload } from "@/lib/uploadImage";
import type { BoardCard } from "@/server/repo/dispatchBoard";
import type { BoardColumn } from "@/server/domain/dispatch/dispatch";
import {
  startProductionAction,
  markReadyAction,
  createDispatchAction,
  markDeliveredAction,
  handOverNowAction,
  sendDispatchUpdateAction,
} from "./actions";

const COLUMNS: BoardColumn[] = ["CONFIRMED", "IN_PRODUCTION", "READY", "DISPATCHED"];

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

const WaContext = React.createContext(false);

export function DispatchBoard({ columns, today, apiConfigured = false }: { columns: Record<BoardColumn, BoardCard[]>; today: string; apiConfigured?: boolean }) {
  const t = useTranslations("dispatch");
  const goldColumn = COLUMNS.find((c) => columns[c].some((card) => card.gold)) ?? "CONFIRMED";
  const [tab, setTab] = React.useState<BoardColumn>(goldColumn);

  return (
    <WaContext.Provider value={apiConfigured}>
    <div>
      <div role="tablist" aria-label={t("columnsLabel")} className="mb-4 grid grid-cols-4 gap-1 rounded-[var(--radius)] bg-[color:var(--color-surface-2)] p-1 md:hidden">
        {COLUMNS.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={tab === c}
            onClick={() => setTab(c)}
            className={cn(
              "rounded-[calc(var(--radius)-2px)] px-1 py-2 text-xs",
              tab === c ? "bg-[color:var(--color-surface)] font-medium shadow-sm" : "text-[color:var(--color-ink-2)]",
            )}
          >
            {t(`column.${c}`)} <span className="tabular-nums">{columns[c].length}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {COLUMNS.map((c) => (
          <section key={c} className={cn("min-w-0", tab !== c && "hidden md:block")} aria-label={t(`column.${c}`)}>
            <h2 className="label-caps mb-2 hidden md:block">
              {t(`column.${c}`)} ({columns[c].length})
            </h2>
            {columns[c].length === 0 ? (
              <p className="rounded-[var(--radius)] border border-dashed border-[color:var(--color-border)] p-4 text-center text-sm text-[color:var(--color-ink-3)]">
                {t("emptyColumn")}
              </p>
            ) : (
              <ul className="space-y-3">
                {columns[c].map((card) => (
                  <Card key={card.id} card={card} today={today} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
    </WaContext.Provider>
  );
}

function Card({ card, today }: { card: BoardCard; today: string }) {
  const t = useTranslations("dispatch");
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const top = card.lines[0];
  const lastDispatch = card.dispatches.at(-1);

  async function run(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, ok: string) {
    setPending(true);
    try {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error!.message);
        return;
      }
      toast.success(ok);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const gold = card.gold ? { "data-gold": "true" } : {};
  let action: React.ReactNode = null;
  if (card.column === "CONFIRMED") {
    action = (
      <Button size="sm" className="w-full" disabled={pending} {...gold}
        onClick={() => run(() => startProductionAction({ orderId: card.id }), t("startedToast", { number: card.number }))}>
        {t("start")}
      </Button>
    );
  } else if (card.column === "IN_PRODUCTION") {
    action = (
      <Button size="sm" className="w-full" disabled={pending} {...gold}
        onClick={() => run(() => markReadyAction({ orderId: card.id }), t("readyToast", { number: card.number }))}>
        {t("markReady")}
      </Button>
    );
  } else if (card.column === "READY") {
    action = <DispatchSheet card={card} today={today} gold={card.gold} />;
  } else {
    action = <DeliveredSheet card={card} today={today} gold={card.gold} />;
  }

  return (
    <li
      className={cn(
        "rounded-[var(--radius)] border bg-[color:var(--color-surface)] p-3 text-sm",
        card.stuck ? "border-[color:var(--color-danger)]" : "border-[color:var(--color-border)]",
      )}
      data-testid="board-card"
    >
      <div className="flex items-center justify-between gap-2">
        <Link href={`/orders/${card.id}`} className="font-medium hover:underline">
          {card.number}
        </Link>
        {card.column !== "DISPATCHED" && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs tabular-nums",
              card.stuck ? "bg-[color:var(--color-danger-bg)] text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-3)]",
            )}
            title={t("ageTitle", { days: card.ageDays })}
          >
            <Timer className="h-3 w-3" aria-hidden />
            {t("ageDays", { days: card.ageDays })}
          </span>
        )}
      </div>
      <div className="mt-1 truncate">{card.customer.name}</div>
      <div className="text-xs text-[color:var(--color-ink-2)]">
        {card.lines.length === 1 && top
          ? `${top.description} ×${top.qty}`
          : t("machines", { count: card.machines })}
        {card.remaining > 0 && card.remaining < card.machines && ` · ${t("leftToShip", { count: card.remaining })}`}
      </div>
      <div className={cn("mt-1 text-xs", card.late ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-3)]")}>
        {card.column === "DISPATCHED" && lastDispatch
          ? [lastDispatch.lrNumber && `LR ${lastDispatch.lrNumber}`, lastDispatch.transporter].filter(Boolean).join(" · ") || t("dispatchedOn", { date: fmtDay(lastDispatch.dispatchedOn) })
          : card.promisedDeliveryDate
            ? card.late
              ? t("dueLate", { date: fmtDay(card.promisedDeliveryDate) })
              : t("due", { date: fmtDay(card.promisedDeliveryDate) })
            : t("noDue")}
      </div>
      <div className="mt-3 space-y-2">
        {action}
        {card.column === "CONFIRMED" && (
          <ConfirmSheet
            trigger={
              <Button size="sm" variant="ghost" className="w-full" disabled={pending}>
                {t("handOver")}
              </Button>
            }
            title={t("handOverTitle", { number: card.number })}
            description={t("handOverBody")}
            confirmLabel={t("handOverConfirm")}
            onConfirm={() => run(() => handOverNowAction({ orderId: card.id, today }), t("handedOverToast", { number: card.number }))}
          />
        )}
      </div>
    </li>
  );
}

function Sheet({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("dispatch");
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[92svh] overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-2)]",
            "md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-lg)] md:border",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-[color:var(--color-ink-3)]">{description}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]" aria-label={t("close")}>
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PhotoPicker({
  orderId,
  paths,
  onChange,
  max,
  label,
}: {
  orderId: string;
  paths: string[];
  onChange: (p: string[]) => void;
  max: number;
  label: string;
}) {
  const t = useTranslations("dispatch");
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, max - paths.length);
    e.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    const added: string[] = [];
    try {
      for (const f of files) {
        const r = await compressAndUpload(f, `/api/dispatch/photo?orderId=${encodeURIComponent(orderId)}`);
        if (!r.ok) {
          toast.error(r.message);
          break;
        }
        added.push(r.path);
      }
    } finally {
      onChange([...paths, ...added]);
      setBusy(false);
    }
  }

  return (
    <div>
      <input ref={ref} type="file" accept="image/*" multiple={max > 1} className="sr-only" aria-label={label} onChange={onFiles} />
      <Button
        variant="outline"
        className="w-full justify-start"
        disabled={busy || paths.length >= max}
        onClick={() => ref.current?.click()}
      >
        <Camera className="h-4 w-4" />
        {busy ? t("uploading") : paths.length > 0 ? t("photosAdded", { count: paths.length, max }) : label}
      </Button>
    </div>
  );
}

function DispatchSheet({ card, today, gold }: { card: BoardCard; today: string; gold: boolean }) {
  const t = useTranslations("dispatch");
  const apiConfigured = React.useContext(WaContext);
  const [open, setOpen] = React.useState(false);

  // §5.3 "offer a one-tap WhatsApp update": lives in the success toast, because a
  // full dispatch moves the card to another column and unmounts this sheet.
  // The server sends via the Cloud API when configured, else returns a wa.me link.
  function onSaved(dispatchId: string) {
    setOpen(false);
    toast.success(t("dispatchedToast", { number: card.number }), {
      duration: 15_000,
      action: {
        label: t("sendWhatsapp"),
        onClick: async () => {
          const tab = apiConfigured ? null : window.open("", "_blank");
          if (tab) tab.opener = null;
          const r = await sendDispatchUpdateAction({ dispatchId });
          if (!r.ok) {
            tab?.close();
            toast.error(r.error.message);
          } else if (r.data.mode === "deeplink") {
            if (tab) tab.location.href = r.data.href;
            else window.location.href = r.data.href;
          } else {
            tab?.close();
            toast.success(t("updateSent"));
          }
        },
      },
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={t("dispatchTitle")}
      description={`${card.number} · ${card.customer.name}`}
      trigger={
        <Button size="sm" className="w-full" {...(gold && !open ? { "data-gold": "true" } : {})}>
          {t("dispatch")}
        </Button>
      }
    >
      {/* Mounted per opening so quantities/photos always start from the current card. */}
      {open && <DispatchForm card={card} today={today} onSaved={onSaved} />}
    </Sheet>
  );
}

function DispatchForm({ card, today, onSaved }: { card: BoardCard; today: string; onSaved: (dispatchId: string) => void }) {
  const t = useTranslations("dispatch");
  const left = card.lines.filter((l) => l.qty > l.dispatchedQty);
  const [qty, setQty] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(left.map((l) => [l.id, l.qty - l.dispatchedQty])),
  );
  const [date, setDate] = React.useState(today);
  const [transporter, setTransporter] = React.useState("");
  const [lr, setLr] = React.useState("");
  const [vehicle, setVehicle] = React.useState("");
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);

  const total = Object.values(qty).reduce((s, n) => s + n, 0);

  async function save() {
    setPending(true);
    try {
      const picks = left.map((l) => ({ orderLineId: l.id, qty: qty[l.id] ?? 0 })).filter((p) => p.qty > 0);
      const r = await createDispatchAction({
        orderId: card.id,
        picks,
        dispatchedOn: date,
        transporter: transporter.trim() || null,
        lrNumber: lr.trim() || null,
        vehicleNo: vehicle.trim() || null,
        photoPaths: photos,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      onSaved(r.data.dispatchId);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
          <ul className="mt-4 space-y-3">
            {left.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="truncate font-medium">{l.description}</div>
                  <div className="text-xs text-[color:var(--color-ink-3)]">
                    {t("shippedOf", { done: l.dispatchedQty, total: l.qty })}
                  </div>
                </div>
                <QtyStepper
                  value={qty[l.id] ?? 0}
                  min={0}
                  max={l.qty - l.dispatchedQty}
                  onChange={(n) => setQty((p) => ({ ...p, [l.id]: n }))}
                />
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor={`d-date-${card.id}`}>{t("date")}</Label>
              <Input id={`d-date-${card.id}`} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor={`d-tr-${card.id}`}>{t("transporter")}</Label>
              <Input id={`d-tr-${card.id}`} value={transporter} onChange={(e) => setTransporter(e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`d-lr-${card.id}`}>{t("lr")}</Label>
              <Input id={`d-lr-${card.id}`} value={lr} onChange={(e) => setLr(e.target.value)} maxLength={40} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`d-veh-${card.id}`}>{t("vehicle")}</Label>
              <Input id={`d-veh-${card.id}`} value={vehicle} onChange={(e) => setVehicle(e.target.value)} maxLength={20} />
            </div>
          </div>
          <div className="mt-4">
            <PhotoPicker orderId={card.id} paths={photos} onChange={setPhotos} max={4} label={t("photos")} />
          </div>
          <Button data-gold="true" className="mt-5 h-12 w-full text-base" disabled={pending || total === 0} onClick={save}>
            {pending ? t("saving") : t("saveDispatch", { count: total })}
          </Button>
        </>
  );
}

function DeliveredSheet({ card, today, gold }: { card: BoardCard; today: string; gold: boolean }) {
  const t = useTranslations("dispatch");
  const [open, setOpen] = React.useState(false);
  if (!card.dispatches.some((d) => !d.deliveredOn)) return null;
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={t("deliveredTitle")}
      description={`${card.number} · ${card.customer.name}`}
      trigger={
        <Button size="sm" className="w-full" {...(gold && !open ? { "data-gold": "true" } : {})}>
          {t("delivered")}
        </Button>
      }
    >
      {open && <DeliveredForm card={card} today={today} onDone={() => setOpen(false)} />}
    </Sheet>
  );
}

function DeliveredForm({ card, today, onDone }: { card: BoardCard; today: string; onDone: () => void }) {
  const t = useTranslations("dispatch");
  const router = useRouter();
  const pendingLots = card.dispatches.filter((d) => !d.deliveredOn);
  const [dispatchId, setDispatchId] = React.useState(pendingLots[0]?.id ?? "");
  const [date, setDate] = React.useState(today);
  const [photo, setPhoto] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);

  async function save() {
    setPending(true);
    try {
      const r = await markDeliveredAction({ dispatchId, deliveredOn: date, proofPath: photo[0] ?? null });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("deliveredToast", { number: card.number }));
      onDone();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="mt-4 space-y-4">
        {pendingLots.length > 1 && (
          <div className="space-y-1">
            <Label htmlFor={`dl-lot-${card.id}`}>{t("whichLot")}</Label>
            <select
              id={`dl-lot-${card.id}`}
              value={dispatchId}
              onChange={(e) => setDispatchId(e.target.value)}
              className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
            >
              {pendingLots.map((d) => (
                <option key={d.id} value={d.id}>
                  {fmtDay(d.dispatchedOn)} · {d.lines.reduce((s, l) => s + l.qty, 0)} {t("units")}
                  {d.lrNumber ? ` · LR ${d.lrNumber}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor={`dl-date-${card.id}`}>{t("deliveredOn")}</Label>
          <Input id={`dl-date-${card.id}`} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <PhotoPicker orderId={card.id} paths={photo} onChange={setPhoto} max={1} label={t("deliveryPhoto")} />
      </div>
      <Button data-gold="true" className="mt-5 h-12 w-full text-base" disabled={pending || !dispatchId} onClick={save}>
        {pending ? t("saving") : t("confirmDelivered")}
      </Button>
    </>
  );
}

/** Dispatch role's Queue (§11.0): every actionable card, most urgent first. */
export function DispatchQueue({ cards, today, apiConfigured = false }: { cards: BoardCard[]; today: string; apiConfigured?: boolean }) {
  const t = useTranslations("dispatch");
  if (cards.length === 0) {
    return <p className="py-16 text-center text-base text-[color:var(--color-ink-2)]">{t("emptyQueue")}</p>;
  }
  return (
    <WaContext.Provider value={apiConfigured}>
      <ul className="space-y-3">
        {cards.map((c) => (
          <Card key={c.id} card={c} today={today} />
        ))}
      </ul>
    </WaContext.Provider>
  );
}
