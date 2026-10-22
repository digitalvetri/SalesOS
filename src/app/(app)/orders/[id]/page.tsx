// One order: what the app knows (numbers, payments) next to exactly what the
// client's Excel order book said for it ("From the Excel sheet").
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, Phone, Table2 } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { getOrderV2WithPayments } from "@/server/repo/ordersV2";
import { readSheetRow, type SheetRow } from "@/server/domain/import/sheetRow";
import { formatInr } from "@/lib/formatInr";
import { amountMissing, contactLabelOf, customerLabelOf, istMonthKey, realPhone, telOf } from "@/lib/orderDisplay";
import { fmtDate, deliveryText, PILL_STYLE } from "../_components/sheet/sheetFormat";
import { OrderEditable, PaymentRow } from "./OrderEditor";
import { ProductionBadge } from "@/components/app/ProductionBadge";

const ymdOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

const STATUS_LABEL = { PENDING: "Pending", DELIVERED: "Delivered", CANCELLED: "Cancelled" } as const;
const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank",
  CHEQUE: "Cheque",
  CARD: "Card",
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const order = await getOrderV2WithPayments({ tenantId: session.tenantId, orderId: id });
  if (!order) notFound();

  // Employees (SALES, and DISPATCH like the list page) only see their own orders.
  const isOwn = order.salespersonId === session.userId;
  const scopedToOwn = session.role === "SALES" || session.role === "DISPATCH";
  if ((scopedToOwn && !isOwn) || !can(session.role, "orders.view", { isOwn })) notFound();
  const showMoney = can(session.role, "orders.viewPrices", { isOwn });

  const sheetRow = readSheetRow(order.sheetRow);
  const phone = realPhone(order.customer.phoneE164);
  const customerLabel = customerLabelOf(sheetRow, order.customer.name);
  const contactLabel = contactLabelOf(sheetRow, phone);
  const tel = telOf(sheetRow, phone);
  const blank = amountMissing({ totalMissing: order.totalMissing, total: order.total.toString() });
  const delivery = deliveryText({ sheetRow, promisedDeliveryDate: order.promisedDeliveryDate });
  // The order's month in its employee's sheet (where edits / payments happen).
  const sheetHref = `${scopedToOwn ? "/orders?" : `/orders?sp=${encodeURIComponent(order.salespersonId)}&`}m=${istMonthKey(order.orderDate)}`;
  const backHref = scopedToOwn ? "/orders" : `/orders?sp=${encodeURIComponent(order.salespersonId)}`;
  // Same rule as the server: admins edit any order; employees their own pending ones.
  const isAdmin = session.role === "OWNER" || session.role === "ADMIN";
  const canEdit = isAdmin || (isOwn && order.simpleStatus === "PENDING" && can(session.role, "orders.editBeforeDispatch", { isOwn }));
  const canEditPayments = showMoney && (isAdmin || session.role === "ACCOUNTS" || (isOwn && order.simpleStatus === "PENDING"));
  const accDetails = order.accDetails?.trim() || sheetRow?.acc?.trim() || "";
  const editable = {
    id: order.id,
    customerName: customerLabel === "—" ? "" : customerLabel,
    contact: sheetRow ? (sheetRow.contact ?? "") : (phone ?? "").replace(/^\+91/, ""),
    productText: order.productText ?? "",
    total: blank ? "" : order.total.toString().replace(/\.00$/, ""),
    deliveryDate: ymdOf(order.promisedDeliveryDate),
    orderDate: ymdOf(order.orderDate),
    accDetails,
    notes: order.notes ?? "",
  };

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 px-4 py-5 md:px-6 md:py-7">
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[color:var(--color-ink-2)] hover:text-[color:var(--color-gold)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Orders
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{customerLabel}</h1>
          <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">
            {order.serialNo !== null && <>S.No {order.serialNo} · </>}
            {fmtDate(order.orderDate)} · {order.salesperson.name} · <span className="tabular-nums">{order.number}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {order.simpleStatus !== "CANCELLED" && <ProductionBadge status={order.productionStatus} className="h-8 px-3 text-sm" />}
          <span className={`inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold ${PILL_STYLE[order.simpleStatus]}`}>
            {STATUS_LABEL[order.simpleStatus]}
          </span>
          <Link
            href={sheetHref}
            data-gold
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold"
          >
            <Table2 className="h-4 w-4" aria-hidden />
            Open in sheet
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* What the app has */}
        <section className="surface-card min-w-0 p-5" aria-labelledby="order-heading">
          <OrderEditable order={editable} isAdmin={isAdmin} showMoney={showMoney} enabled={canEdit}>
          <h2 id="order-heading" className="mb-3 text-base font-semibold">
            Order
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            <Field label="Contact">
              {tel ? (
                <a href={`tel:${tel}`} className="inline-flex items-center gap-1.5 tabular-nums hover:text-[color:var(--color-gold)] hover:underline">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {contactLabel}
                </a>
              ) : (
                contactLabel
              )}
            </Field>
            <Field label="Products">{order.productText?.trim() || "—"}</Field>
            <Field label="Delivery">{delivery}</Field>
            <Field label="Payment received in">{accDetails || "—"}</Field>
            {order.completedAt && <Field label="Delivered on">{fmtDate(order.completedAt)}</Field>}
            {order.cancelNote && <Field label="Cancel note">{order.cancelNote}</Field>}
            {order.notes && <Field label="Notes">{order.notes}</Field>}
          </dl>

          {order.lines.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-[var(--radius)] border border-[color:var(--color-border)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Item</th>
                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                    {showMoney && <th className="px-3 py-2 text-right font-semibold">Price</th>}
                    {showMoney && <th className="px-3 py-2 text-right font-semibold">Amount</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {order.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 break-words">{l.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                      {showMoney && <td className="px-3 py-2 text-right tabular-nums">{formatInr(l.unitPrice.toString())}</td>}
                      {showMoney && <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatInr(l.lineTotal.toString())}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showMoney && (
            <dl className="mt-4 grid grid-cols-3 gap-2 rounded-[var(--radius)] bg-[color:var(--color-surface-2)] p-3 text-center">
              <MoneyCell label="Total" value={blank ? null : order.total.toString()} />
              <MoneyCell label="Paid" value={blank ? null : order.paidTotal.toString()} />
              <MoneyCell label="Balance" value={blank ? null : order.balanceDue.toString()} warn />
            </dl>
          )}
          {showMoney && blank && (
            <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">The TOTAL cell was blank in the sheet, so no amount is shown.</p>
          )}

          {showMoney && (
            <>
              <h3 className="mt-5 text-sm font-semibold">Payments</h3>
              {order.payments.length === 0 ? (
                <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">No payments recorded.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
                  {order.payments.map((p) => (
                    <PaymentRow
                      key={p.id}
                      canEdit={canEditPayments}
                      payment={{ id: p.id, amount: p.amount.toString(), method: p.method, paidOn: ymdOf(p.paidOn), note: p.note ?? "" }}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0">
                          <span className="tabular-nums text-[color:var(--color-ink-2)]">{fmtDate(p.paidOn)}</span>
                          <span className="text-[color:var(--color-ink-3)]"> · {METHOD_LABEL[p.method] ?? p.method}</span>
                          {p.note && <span className="block break-words text-xs text-[color:var(--color-ink-3)]">Received in: {p.note}</span>}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{formatInr(p.amount.toString())}</span>
                      </div>
                    </PaymentRow>
                  ))}
                </ul>
              )}
            </>
          )}
          </OrderEditable>
        </section>

        {/* What the sheet said */}
        {sheetRow && <SheetPanel row={sheetRow} showMoney={showMoney} />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[color:var(--color-ink-3)]">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words">{children}</dd>
    </>
  );
}

function MoneyCell({ label, value, warn }: { label: string; value: string | null; warn?: boolean }) {
  const positive = value !== null && Number(value) > 0;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">{label}</dt>
      <dd
        className={`truncate text-base font-semibold tabular-nums ${
          warn && positive ? "text-[color:var(--color-warn)]" : ""
        }`}
      >
        {value === null ? (
          <span className="text-[color:var(--color-ink-3)]">
            —<span className="sr-only">no amount</span>
          </span>
        ) : (
          formatInr(value)
        )}
      </dd>
    </div>
  );
}

function SheetPanel({ row, showMoney }: { row: SheetRow; showMoney: boolean }) {
  const rows = row.rows?.length
    ? row.rows.length === 1
      ? `row ${row.rows[0]}`
      : `rows ${row.rows.join(", ")}`
    : null;
  const fields: [string, string | null][] = [
    ["Sheet & row", [row.sheet, rows].filter(Boolean).join(" · ") || null],
    ["Date", row.date],
    ["Customer", row.customer],
    ["Contact", row.contact],
    ["Products", row.products],
    ...(showMoney
      ? ([
          ["Total", row.total],
          ["Adv", row.adv],
          ["Bal", row.bal],
        ] as [string, string | null][])
      : []),
    ["Delivery", row.delivery],
    ["Status", row.status],
    ["Acc details (received in)", row.acc],
    ["Comments", row.comments],
  ];
  return (
    <section className="surface-card min-w-0 p-5" aria-labelledby="sheet-heading">
      <h2 id="sheet-heading" className="mb-1 flex items-center gap-2 text-base font-semibold">
        <FileSpreadsheet className="h-4 w-4 text-[color:var(--color-gold)]" aria-hidden />
        From the Excel sheet
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">Exactly as typed in the order book.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-sm">
        {fields.map(([label, value]) => (
          <Field key={label} label={label}>
            {value?.trim() ? value : <span className="text-[color:var(--color-ink-3)]">—</span>}
          </Field>
        ))}
      </dl>
    </section>
  );
}
