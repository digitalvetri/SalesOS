// Order workflow. Pure — no IO.
//   Sales enter the order (Pending) → production marks On progress → Finished →
//   sales mark Delivered. Sales may also deliver straight from ready stock at any
//   time (2026-10-16): the order is then "Ready stock" and never goes to production.
export type ProductionStatus = "NOT_STARTED" | "IN_PROGRESS" | "FINISHED" | "NOT_NEEDED";
export type OrderStatus = "PENDING" | "DELIVERED" | "CANCELLED";
export type ActorRole = "OWNER" | "ADMIN" | "ACCOUNTS" | "SALES" | "DISPATCH" | "PRODUCTION";

export const PRODUCTION_LABEL: Record<ProductionStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "On progress",
  FINISHED: "Finished",
  NOT_NEEDED: "Ready stock",
};
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const isAdmin = (r: ActorRole) => r === "OWNER" || r === "ADMIN";

/** Production status once an order is marked Delivered: production's Finished work
 *  stays Finished; anything else was delivered from ready stock. */
export const productionAfterDelivery = (current: ProductionStatus): ProductionStatus =>
  current === "FINISHED" ? "FINISHED" : "NOT_NEEDED";

/** Who may change the production status. */
export const canUpdateProduction = (role: ActorRole) => role === "PRODUCTION" || isAdmin(role);

/** Production status can change only while the order is still pending and needs production. */
export const productionEditable = (o: { simpleStatus: OrderStatus; productionStatus?: ProductionStatus }) =>
  o.simpleStatus === "PENDING" && o.productionStatus !== "NOT_NEEDED";
