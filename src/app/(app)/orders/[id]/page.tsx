import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { assertCan, can, level } from "@/server/auth/permissions";
import { getOrderById } from "@/server/repo/orders";
import { prisma } from "@/server/repo/client";
import { Badge } from "@/components/ui/badge";
import { Money, formatInr } from "@/components/app/Money";
import { StatusPill, type AnyStatus } from "@/components/app/StatusPill";
import { OrderActions } from "./OrderActions";
import { ApprovalActions } from "./ApprovalActions";
import { CancelRequestButton } from "./CancelRequestButton";
import { RecordPaymentSheet } from "./RecordPaymentSheet";
import { RefundSheet } from "./RefundSheet";
import { PaymentList, type PaymentRow } from "./PaymentList";
import { istDateString } from "@/server/domain/payment/record";
import { reminderAvailableAt } from "@/server/domain/payment/collect";
import { getWaConfig } from "@/server/services/whatsappService";
import { waLink } from "@/server/domain/payment/collect";
import { templateText } from "@/server/domain/whatsapp/whatsapp";
import { ContactButtons } from "../../collect/ContactButtons";
import { PromiseDateSheet } from "../../collect/PromiseDateSheet";
import Decimal from "decimal.js";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession();

  // Load the order, then verify the viewer actually has access to it.
  const order = await getOrderById({
    tenantId: session.tenantId,
    id,
    salespersonScope: session.role === "SALES" ? session.userId : undefined,
  });
  if (!order) notFound();

  try {
    assertCan(session.role, "orders.view", {
      isOwn: order.salespersonId === session.userId,
    });
  } catch {
    redirect("/orders");
  }

  const t = await getTranslations("orderDetail");

  const canSeeMoney = level(session.role, "orders.viewPrices") !== "denied";
  const canApprove = can(session.role, "orders.approvePrice");
  const canCancelDirect = can(session.role, "orders.cancel");
  const isOwn = order.salespersonId === session.userId;
  const balanceDue = new Decimal(order.balanceDue.toString());
  const canRecordPayment =
    can(session.role, "payments.record", { isOwn }) &&
    order.status !== "CANCELLED" &&
    balanceDue.greaterThan(0);
  const canFollowUp = canRecordPayment && order.status !== "CLOSED";
  const waConfigured = canFollowUp ? (await getWaConfig(session.tenantId)).configured : false;
  const lastReminder = [...order.followUps].reverse().find((f) => f.channel === "WHATSAPP");
  const reminderBlockedUntil = reminderAvailableAt(lastReminder?.at ?? null, new Date());
  const canRefund = can(session.role, "payments.recordRefund") && balanceDue.lessThan(0);
  const approvalVisible = canApprove && order.status === "PENDING_APPROVAL";
  const canRequestCancel =
    level(session.role, "orders.cancel") === "ownRequest" &&
    order.salespersonId === session.userId;

  // Payment totals (for the money section) — derived live from the Payment rows
  // on this order. P3 adds the full balance recompute + CLOSED automation.
  const verifiedPaid = order.payments
    .filter((p) => p.status === "VERIFIED" && p.type !== "REFUND")
    .reduce((s, p) => s.plus(p.amount.toString()), new Decimal(0));
  const pendingPaid = order.payments
    .filter((p) => p.status === "PENDING_VERIFICATION" && p.type !== "REFUND")
    .reduce((s, p) => s.plus(p.amount.toString()), new Decimal(0));

  // Latest cancel-request event, if any.
  const cancelRequest = [...order.events]
    .reverse()
    .find((e) => e.type === "CANCEL_REQUEST");
  const cancelRequestApproved =
    cancelRequest &&
    order.events.some(
      (e) =>
        (e.type === "CANCEL_APPROVED" || e.type === "STATUS_CHANGE") &&
        e.at > cancelRequest.at,
    );

  // Names for the timeline + payment rows: event actors, payment creators and
  // personal receivers, plus account labels. Payment has no Prisma relations to
  // User/Account, so resolve them in two batched queries.
  const userIds = Array.from(
    new Set([
      ...order.events.map((e) => e.actorId),
      ...order.followUps.map((f) => f.byUserId),
      ...order.payments.map((p) => p.createdById),
      ...order.payments.flatMap((p) => (p.receivedByUserId ? [p.receivedByUserId] : [])),
    ]),
  );
  const accountIds = Array.from(
    new Set(
      order.payments.flatMap((p) =>
        [p.receivedIntoAccountId, p.depositedToAccountId].filter((x): x is string => Boolean(x)),
      ),
    ),
  );
  const [actors, paymentAccounts] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: session.tenantId, id: { in: userIds } },
      select: { id: true, name: true },
    }),
    canSeeMoney
      ? prisma.account.findMany({
          where: { tenantId: session.tenantId, id: { in: accountIds } },
          select: { id: true, label: true },
        })
      : Promise.resolve([]),
  ]);
  const actorName = new Map(actors.map((a) => [a.id, a.name]));
  const accountLabel = new Map(paymentAccounts.map((a) => [a.id, a.label]));

  // Record-payment sheet options: the order's entity accounts + staff who can receive.
  const [sheetAccounts, receiveStaff, me] = canRecordPayment || canRefund
    ? await Promise.all([
        prisma.account.findMany({
          where: { tenantId: session.tenantId, entityId: order.entityId, active: true },
          orderBy: { label: "asc" },
          select: { id: true, label: true },
        }),
        prisma.user.findMany({
          where: { tenantId: session.tenantId, active: true, canReceivePayments: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.user.findUnique({
          where: { id: session.userId },
          select: { canReceivePayments: true },
        }),
      ])
    : [[], [], null];

  const paymentRows: PaymentRow[] = canSeeMoney
    ? order.payments.map((p) => ({
        id: p.id,
        receiptNo: p.receiptNo,
        type: p.type,
        method: p.method,
        amount: p.amount.toString(),
        status: p.status,
        paidOn: p.paidOn.toISOString(),
        into: p.receivedIntoAccountId
          ? { kind: "account" as const, label: accountLabel.get(p.receivedIntoAccountId) ?? "—" }
          : { kind: "person" as const, label: actorName.get(p.receivedByUserId ?? "") ?? "—" },
        deposited: Boolean(p.depositedToAccountId),
        referenceNo: p.referenceNo,
        hasProof: Boolean(p.proofPath),
        rejectReason: p.rejectReason,
      }))
    : [];

  // Timeline = order events + payments recorded (spec §11.4 shows "Advance ₹10,000").
  type TimelineItem =
    | { kind: "event"; id: string; at: Date; event: (typeof order.events)[number] }
    | { kind: "payment"; id: string; at: Date; payment: (typeof order.payments)[number] }
    | { kind: "followUp"; id: string; at: Date; followUp: (typeof order.followUps)[number] };
  const timeline: TimelineItem[] = [
    ...order.events.map((e) => ({ kind: "event" as const, id: e.id, at: e.at, event: e })),
    ...(canSeeMoney
      ? order.payments.map((p) => ({ kind: "payment" as const, id: p.id, at: p.createdAt, payment: p }))
      : []),
    // Promise-date changes already appear as a NOTE event; show contacts only.
    ...order.followUps
      .filter((f) => f.channel !== "OTHER")
      .map((f) => ({ kind: "followUp" as const, id: f.id, at: f.at, followUp: f })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  // §11.3 success screen: shown once after the wizard (?created=1).
  const created = sp.created === "1";
  const confirmationHref =
    created && sp.wa === "link"
      ? waLink(
          order.customer.phoneE164,
          templateText({
            template: "order_confirmation",
            name: order.customer.businessName ?? order.customer.name,
            orderNumber: order.number,
            items: order.lines.map((l) => `${l.description} ×${l.qty}`).join(", "),
            total: order.total.toString(),
            advance: Decimal.max(0, new Decimal(order.total.toString()).minus(order.balanceDue.toString())).toString(),
            balance: Decimal.max(0, order.balanceDue.toString()).toString(),
            deliveryDate: order.promisedDeliveryDate ? order.promisedDeliveryDate.toISOString().slice(0, 10) : null,
            entityName: order.entity.name,
          }),
        )
      : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col pb-20 md:max-w-4xl">
      {created && (
        <section
          className="mx-4 mt-4 rounded-[var(--radius)] border border-[color:var(--color-ok)]/40 bg-[color:var(--color-ok-bg)] p-5 text-center"
          data-testid="order-created"
        >
          <p className="text-sm text-[color:var(--color-ok)]">
            {order.status === "PENDING_APPROVAL" ? t("createdPending") : t("createdTitle")}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{order.number}</p>
          {sp.wa === "sent" && <p className="mt-2 text-sm">{t("confirmationSent")}</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {confirmationHref && (
              <a
                href={confirmationHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-5 text-sm font-medium"
              >
                {t("shareWhatsapp")}
              </a>
            )}
            <Link
              href={`/orders/${order.id}`}
              className="inline-flex h-11 items-center rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-5 text-sm font-medium"
            >
              {t("done")}
            </Link>
          </div>
        </section>
      )}
      <header className="border-b border-[color:var(--color-border)] px-4 py-3">
        <Link href="/orders" className="text-sm text-[color:var(--color-ink-2)] hover:underline">
          ← {t("backToList")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{order.number}</h1>
          <StatusPill status={order.status as AnyStatus} />
          {canSeeMoney && balanceDue.greaterThan(0) && (
            <Badge tone="warn">
              {t("balanceBadge")}: <Money value={order.balanceDue.toString()} />
            </Badge>
          )}
          {canSeeMoney && balanceDue.lessThan(0) && (
            <Badge tone="danger">
              {t("refundDue")}: <Money value={balanceDue.abs().toString()} />
            </Badge>
          )}
          {order.needsApproval && order.status === "PENDING_APPROVAL" && (
            <Badge tone="warn">{t("needsApproval")}</Badge>
          )}
        </div>
      </header>

      <div className="grid gap-6 px-4 py-4 md:grid-cols-[2fr_1fr]">
        {/* Left column — customer, machines, timeline */}
        <div className="space-y-5">
          <section className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <div className="label-caps">{t("customer")}</div>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div>
                <Link
                  href={`/customers/${order.customer.id}`}
                  className="font-medium hover:underline"
                >
                  {order.customer.businessName ?? order.customer.name}
                </Link>
                {order.customer.businessName && (
                  <div className="text-sm text-[color:var(--color-ink-3)]">
                    {order.customer.name}
                  </div>
                )}
                <div className="mt-1 text-sm tabular-nums">{order.customer.phoneE164}</div>
              </div>
              <a
                href={`https://wa.me/${order.customer.phoneE164.replace(/^\+/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-[var(--radius)] border border-[color:var(--color-border-strong)] px-3 py-2 text-xs hover:bg-[color:var(--color-surface-2)]"
              >
                WhatsApp
              </a>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--color-ink-3)]">
              <span>
                {t("salesperson")}: {order.salesperson.name}
              </span>
              <span>
                {t("orderDate")}:{" "}
                {order.orderDate.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              {order.promisedDeliveryDate && (
                <span>
                  {t("deliveryBy")}:{" "}
                  {order.promisedDeliveryDate.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            <header className="bg-[color:var(--color-surface-2)] px-4 py-2">
              <h3 className="label-caps">{t("machines")}</h3>
            </header>
            <table className="w-full text-sm">
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id} className="border-t border-[color:var(--color-border)]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{l.description}</div>
                      <div className="text-xs text-[color:var(--color-ink-3)]">
                        {t("dispatched")} {l.dispatchedQty} / {l.qty}
                      </div>
                    </td>
                    <td className="w-20 px-4 py-3 text-right tabular-nums">
                      × {l.qty}
                    </td>
                    {canSeeMoney && (
                      <td className="w-32 px-4 py-3 text-right">
                        <Money value={l.lineTotal.toString()} />
                      </td>
                    )}
                  </tr>
                ))}
                {order.charges.map((c) => (
                  <tr key={c.id} className="border-t border-[color:var(--color-border)]">
                    <td className="px-4 py-3 text-sm text-[color:var(--color-ink-2)]">
                      + {c.label}
                    </td>
                    <td className="px-4 py-3" />
                    {canSeeMoney && (
                      <td className="px-4 py-3 text-right">
                        <Money value={c.amount.toString()} muted />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {order.dispatches.length > 0 && (
            <section className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
              <header className="bg-[color:var(--color-surface-2)] px-4 py-2">
                <h3 className="label-caps">{t("dispatches")}</h3>
              </header>
              <ul className="divide-y divide-[color:var(--color-border)]">
                {order.dispatches.map((d) => {
                  const day = (x: Date) =>
                    x.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
                  const lineName = new Map(order.lines.map((l) => [l.id, l.description]));
                  return (
                    <li key={d.id} className="px-4 py-3 text-sm" data-testid="dispatch-row">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">
                          {t("dispatchedOn", { date: day(d.dispatchedOn) })}
                        </span>
                        <Badge tone={d.deliveredOn ? "ok" : "info"}>
                          {d.deliveredOn ? t("deliveredOn", { date: day(d.deliveredOn) }) : t("inTransit")}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                        {d.lines.map((l) => `${lineName.get(l.orderLineId) ?? "—"} ×${l.qty}`).join(", ")}
                      </div>
                      {(d.transporter || d.lrNumber || d.vehicleNo) && (
                        <div className="mt-0.5 text-xs text-[color:var(--color-ink-3)]">
                          {[d.transporter, d.lrNumber && `LR ${d.lrNumber}`, d.vehicleNo].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {(d.photoPaths.length > 0 || d.deliveryProofPath) && (
                        <div className="mt-1 flex flex-wrap gap-3 text-xs">
                          {d.photoPaths.map((_, i) => (
                            <a key={i} href={`/api/dispatch/${d.id}/photo?i=${i}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                              {t("photoN", { n: i + 1 })}
                            </a>
                          ))}
                          {d.deliveryProofPath && (
                            <a href={`/api/dispatch/${d.id}/photo?i=delivery`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                              {t("deliveryPhoto")}
                            </a>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            <header className="bg-[color:var(--color-surface-2)] px-4 py-2">
              <h3 className="label-caps">{t("timeline")}</h3>
            </header>
            <ol className="divide-y divide-[color:var(--color-border)]">
              {timeline.map((item) => {
                const e = item.kind === "event" ? item.event : null;
                const p = item.kind === "payment" ? item.payment : null;
                const f = item.kind === "followUp" ? item.followUp : null;
                return (
                <li key={item.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {e
                          ? describeEvent(e.type, e.fromStatus, e.toStatus)
                          : p
                            ? t("timelinePayment", {
                                type: t(`paymentType.${p.type}`),
                                amount: formatInr(p.amount.toString()),
                              })
                            : t(`followUp.${f!.channel}`)}
                      </div>
                      {(e?.note || (f?.note && (f.channel === "CALL" || f.channel === "VISIT"))) && (
                        <div className="mt-0.5 text-xs text-[color:var(--color-ink-3)]">
                          {e?.note ?? f?.note}
                        </div>
                      )}
                      <div className="mt-0.5 text-xs text-[color:var(--color-ink-3)]">
                        {actorName.get(e ? e.actorId : p ? p.createdById : f!.byUserId) ?? "—"}
                      </div>
                    </div>
                    <time className="shrink-0 tabular-nums text-xs text-[color:var(--color-ink-3)]">
                      {item.at.toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata",
                      })}
                    </time>
                  </div>
                </li>
                );
              })}
            </ol>
          </section>
        </div>

        {/* Right column — money + actions */}
        {canSeeMoney && (
          <aside className="space-y-5">
            <section className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
              <div className="label-caps mb-2">{t("money")}</div>
              <div className="flex items-baseline justify-between py-1">
                <span className="text-sm">{t("total")}</span>
                <Money value={order.total.toString()} />
              </div>
              <div className="flex items-baseline justify-between py-1">
                <span className="text-sm">{t("paidVerified")}</span>
                <Money value={verifiedPaid.toString()} muted />
              </div>
              <div className="flex items-baseline justify-between py-1">
                <span className="text-sm">{t("awaitingVerification")}</span>
                <Money value={pendingPaid.toString()} muted />
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-[color:var(--color-border)] pt-2">
                <span className="font-medium">
                  {balanceDue.lessThan(0) ? t("refundDue") : t("balanceDue")}
                </span>
                <Money value={balanceDue.abs().toString()} size="lg" />
              </div>
              {canRecordPayment && (
                <div className="mt-4">
                  <RecordPaymentSheet
                    orderId={order.id}
                    orderNumber={order.number}
                    balanceDue={balanceDue.toString()}
                    today={istDateString(new Date())}
                    accounts={sheetAccounts}
                    receiveStaff={receiveStaff.map((u) => ({ id: u.id, label: u.name }))}
                    actor={{ id: session.userId, canReceivePayments: me?.canReceivePayments ?? false }}
                    gold={!approvalVisible}
                  />
                </div>
              )}
              {canRefund && (
                <div className="mt-4">
                  <RefundSheet
                    orderId={order.id}
                    orderNumber={order.number}
                    refundDue={balanceDue.abs().toString()}
                    today={istDateString(new Date())}
                    accounts={sheetAccounts}
                    gold={!approvalVisible}
                  />
                </div>
              )}
              {paymentRows.length > 0 && <PaymentList payments={paymentRows} />}
            </section>

            {canFollowUp && (
              <section className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
                <div className="label-caps mb-2">{t("collect")}</div>
                <p className="mb-3 text-sm text-[color:var(--color-ink-2)]">
                  {order.promisedPaymentDate
                    ? t("promisedPayment", {
                        date: order.promisedPaymentDate.toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        }),
                      })
                    : t("noPromisedPayment")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <ContactButtons
                    phoneE164={order.customer.phoneE164}
                    orderIds={[order.id]}
                    apiConfigured={waConfigured}
                    reminderBlockedUntil={reminderBlockedUntil?.toISOString() ?? null}
                    compact
                  />
                  <PromiseDateSheet
                    orderId={order.id}
                    orderNumber={order.number}
                    current={order.promisedPaymentDate?.toISOString().slice(0, 10) ?? null}
                    today={istDateString(new Date())}
                    compact
                  />
                </div>
              </section>
            )}

            {approvalVisible && (
              <ApprovalActions
                orderId={order.id}
                orderNumber={order.number}
                updatedAt={order.updatedAt.toISOString()}
              />
            )}

            {(canCancelDirect || canRequestCancel) && (
              <section className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
                <div className="label-caps mb-2">{t("actions")}</div>
                {canRequestCancel && !cancelRequest && (
                  <CancelRequestButton orderId={order.id} />
                )}
                {canRequestCancel && cancelRequest && !cancelRequestApproved && (
                  <p className="text-xs text-[color:var(--color-ink-3)]">
                    {t("cancelRequested", {
                      time: cancelRequest.at.toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })}
                  </p>
                )}
                {canCancelDirect && (
                  <OrderActions
                    orderId={order.id}
                    canCancel
                    pendingCancelRequest={Boolean(
                      cancelRequest && !cancelRequestApproved,
                    )}
                  />
                )}
              </section>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function describeEvent(
  type: string,
  fromStatus: string | null,
  toStatus: string | null,
): string {
  switch (type) {
    case "STATUS_CHANGE":
      if (!fromStatus) return `→ ${toStatus}`;
      return `${fromStatus} → ${toStatus}`;
    case "APPROVAL":
      return "Price approval granted";
    case "CANCEL_REQUEST":
      return "Cancellation requested by salesperson";
    case "CANCEL_APPROVED":
      return "Cancellation approved";
    case "CANCEL_REJECTED":
      return "Cancellation request rejected";
    case "NOTE":
      return "Note added";
    case "DISPATCH":
      return "Part dispatched";
    case "DELIVERY":
      return "Part delivery confirmed";
    case "EDIT":
      return "Order edited";
    case "REASSIGN":
      return "Salesperson reassigned";
    default:
      return type;
  }
}
