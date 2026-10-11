// Order state machine (spec §5.1). Pure — no DB or framework imports.
//
// `OrderStatus` names are the Prisma enum values but kept here as plain string
// literals so the domain layer stays Prisma-free (spec §8 "domain/ has zero
// imports from Next, Prisma or React").

export const ORDER_STATUSES = [
  "PENDING_APPROVAL",
  "CONFIRMED",
  "IN_PRODUCTION",
  "READY",
  "PARTIALLY_DISPATCHED",
  "DISPATCHED",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Allowed forward transitions per spec §5.1 diagram. Any pair not listed is forbidden.
 * Keys are the FROM status; values are the set of allowed TO statuses.
 *
 * Notes:
 * - CONFIRMED → CANCELLED is allowed (nothing dispatched yet).
 * - IN_PRODUCTION → CANCELLED allowed (nothing dispatched yet).
 * - READY → CANCELLED allowed (still nothing dispatched).
 * - After any dispatch (PARTIALLY_DISPATCHED/DISPATCHED/DELIVERED) you cannot cancel.
 * - CLOSED is derived from DELIVERED + balanceDue == 0 (set by the service, not a transition the UI invokes).
 *   It can revert to DELIVERED when a verified payment is later rejected. Both directions are allowed here.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_APPROVAL: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PRODUCTION", "DELIVERED", "CANCELLED"], // stock items can go CONFIRMED → DELIVERED (§5.1)
  IN_PRODUCTION: ["READY", "CANCELLED"],
  READY: ["PARTIALLY_DISPATCHED", "DISPATCHED", "CANCELLED"],
  PARTIALLY_DISPATCHED: ["DISPATCHED"],
  DISPATCHED: ["DELIVERED"],
  DELIVERED: ["CLOSED"],
  CLOSED: ["DELIVERED"], // reopened when a verified payment is rejected
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Invalid order transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

// Convenience: statuses after which cancellation is forbidden (because something has shipped).
export const CANCELLATION_LOCKED_STATUSES: readonly OrderStatus[] = [
  "PARTIALLY_DISPATCHED",
  "DISPATCHED",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
];

export function canCancel(from: OrderStatus): boolean {
  return !CANCELLATION_LOCKED_STATUSES.includes(from);
}
