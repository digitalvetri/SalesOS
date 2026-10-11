import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { assertCan, can, level } from "@/server/auth/permissions";
import { getOrderById } from "@/server/repo/orders";
import { prisma } from "@/server/repo/client";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/app/Money";
import { StatusPill, type AnyStatus } from "@/components/app/StatusPill";
import { OrderActions } from "./OrderActions";
import { ApprovalActions } from "./ApprovalActions";
import { CancelRequestButton } from "./CancelRequestButton";
import Decimal from "decimal.js";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  // Actor names for the timeline. Load in one query since every event has actorId.
  const actorIds = Array.from(new Set(order.events.map((e) => e.actorId)));
  const actors = await prisma.user.findMany({
    where: { tenantId: session.tenantId, id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col pb-20 md:max-w-4xl">
      <header className="border-b border-[color:var(--color-border)] px-4 py-3">
        <Link href="/orders" className="text-sm text-[color:var(--color-ink-2)] hover:underline">
          ← {t("backToList")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{order.number}</h1>
          <StatusPill status={order.status as AnyStatus} />
          {canSeeMoney && Number(order.balanceDue) > 0 && (
            <Badge tone="warn">
              {t("balanceBadge")}: <Money value={order.balanceDue.toString()} />
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

          <section className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            <header className="bg-[color:var(--color-surface-2)] px-4 py-2">
              <h3 className="label-caps">{t("timeline")}</h3>
            </header>
            <ol className="divide-y divide-[color:var(--color-border)]">
              {order.events.map((e) => (
                <li key={e.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {describeEvent(e.type, e.fromStatus, e.toStatus)}
                      </div>
                      {e.note && (
                        <div className="mt-0.5 text-xs text-[color:var(--color-ink-3)]">
                          {e.note}
                        </div>
                      )}
                      <div className="mt-0.5 text-xs text-[color:var(--color-ink-3)]">
                        {actorName.get(e.actorId) ?? "—"}
                      </div>
                    </div>
                    <time className="shrink-0 tabular-nums text-xs text-[color:var(--color-ink-3)]">
                      {e.at.toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </li>
              ))}
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
                <span className="font-medium">{t("balanceDue")}</span>
                <Money value={order.balanceDue.toString()} size="lg" />
              </div>
            </section>

            {canApprove && order.status === "PENDING_APPROVAL" && (
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
    case "EDIT":
      return "Order edited";
    case "REASSIGN":
      return "Salesperson reassigned";
    default:
      return type;
  }
}
