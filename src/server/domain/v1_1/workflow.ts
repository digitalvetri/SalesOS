// Order workflow (2026-10-15). Pure — no IO.
//   Sales enter the order (Pending) → production marks On progress → Finished →
//   sales mark Delivered. Owner/Admin may override the gate.
export type ProductionStatus = "NOT_STARTED" | "IN_PROGRESS" | "FINISHED";
export type OrderStatus = "PENDING" | "DELIVERED" | "CANCELLED";
export type ActorRole = "OWNER" | "ADMIN" | "ACCOUNTS" | "SALES" | "DISPATCH" | "PRODUCTION";

export const PRODUCTION_LABEL: Record<ProductionStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "On progress",
  FINISHED: "Finished",
};
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const isAdmin = (r: ActorRole) => r === "OWNER" || r === "ADMIN";

/** Why this person may not mark the order Delivered yet (null = allowed). */
export function deliveredBlockReason(p: { productionStatus: ProductionStatus; role: ActorRole }): string | null {
  if (isAdmin(p.role) || p.productionStatus === "FINISHED") return null;
  return "Production hasn't finished this order yet — mark it Delivered once production marks it Finished.";
}

/** Who may change the production status. */
export const canUpdateProduction = (role: ActorRole) => role === "PRODUCTION" || isAdmin(role);

/** Production status can change only while the order is still pending. */
export const productionEditable = (o: { simpleStatus: OrderStatus }) => o.simpleStatus === "PENDING";
