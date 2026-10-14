// Permission matrix — literal translation of spec §4.2.
// Every Server Action calls assertCan(). UI hides what you cannot do; the server
// refuses it anyway (spec §4.2 note: "No permission checks in components only").

import { AppError } from "@/lib/errors";
import type { Role } from "@/server/repo/client";

export type Permission = "full" | "own" | "readOnly" | "ownRequest" | "denied";

export const ACTIONS = [
  "admin.dashboard",
  "personal.dashboard",
  "orders.create",
  "orders.createForOthers",
  "orders.view",
  "orders.viewPrices",
  "orders.editBeforeDispatch",
  "orders.editAfterDispatch",
  "orders.approvePrice",
  "orders.cancel",
  "payments.record",
  "payments.verify",
  "payments.recordRefund",
  "dispatch.updateStatus",
  "customers.manage",
  "priceList.edit",
  "priceList.viewDealer",
  "users.manage",
  "users.createOwner",
  "targets.set",
  "settings.manage",
  "import.excel",
  "reports.export",
  "audit.view",
  "profile.self",
  "production.view",
  "production.update",
  "service.create",
  "service.view",
  "service.update",
] as const;

export type Action = (typeof ACTIONS)[number];

// Rows mirror the §4.2 table. Keep them in the same order for diffability.
export const PERMISSION_MATRIX: Record<Action, Record<Role, Permission>> = {
  "admin.dashboard":        { OWNER: "full", ADMIN: "full", ACCOUNTS: "readOnly", SALES: "denied",     DISPATCH: "denied", PRODUCTION: "denied" },
  "personal.dashboard":     { OWNER: "denied", ADMIN: "denied", ACCOUNTS: "denied", SALES: "own",     DISPATCH: "own", PRODUCTION: "denied" },
  "orders.create":          { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "full",       DISPATCH: "denied", PRODUCTION: "denied" },
  "orders.createForOthers": { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "denied",     DISPATCH: "denied", PRODUCTION: "denied" },
  "orders.view":            { OWNER: "full", ADMIN: "full", ACCOUNTS: "full",   SALES: "own",         DISPATCH: "full", PRODUCTION: "denied" },
  "orders.viewPrices":      { OWNER: "full", ADMIN: "full", ACCOUNTS: "full",   SALES: "own",         DISPATCH: "denied", PRODUCTION: "denied" },
  "orders.editBeforeDispatch": { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "own",     DISPATCH: "denied", PRODUCTION: "denied" },
  "orders.editAfterDispatch":  { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "denied",  DISPATCH: "denied", PRODUCTION: "denied" },
  "orders.approvePrice":    { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "denied",     DISPATCH: "denied", PRODUCTION: "denied" },
  "orders.cancel":          { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "ownRequest", DISPATCH: "denied", PRODUCTION: "denied" },
  "payments.record":        { OWNER: "full", ADMIN: "full", ACCOUNTS: "full",   SALES: "own",         DISPATCH: "denied", PRODUCTION: "denied" },
  "payments.verify":        { OWNER: "full", ADMIN: "full", ACCOUNTS: "full",   SALES: "denied",     DISPATCH: "denied", PRODUCTION: "denied" },
  "payments.recordRefund":  { OWNER: "full", ADMIN: "full", ACCOUNTS: "full",   SALES: "denied",     DISPATCH: "denied", PRODUCTION: "denied" },
  "dispatch.updateStatus":  { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "denied",     DISPATCH: "full", PRODUCTION: "denied" },
  "customers.manage":       { OWNER: "full", ADMIN: "full", ACCOUNTS: "full",   SALES: "own",         DISPATCH: "denied", PRODUCTION: "denied" },
  "priceList.edit":         { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "readOnly",   DISPATCH: "denied", PRODUCTION: "denied" },
  "priceList.viewDealer":   { OWNER: "full", ADMIN: "full", ACCOUNTS: "full",   SALES: "denied",     DISPATCH: "denied", PRODUCTION: "denied" },
  "users.manage":           { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "denied",     DISPATCH: "denied", PRODUCTION: "denied" },
  "users.createOwner":      { OWNER: "full", ADMIN: "denied", ACCOUNTS: "denied", SALES: "denied",   DISPATCH: "denied", PRODUCTION: "denied" },
  "targets.set":            { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "denied",     DISPATCH: "denied", PRODUCTION: "denied" },
  "settings.manage":        { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "denied",     DISPATCH: "denied", PRODUCTION: "denied" },
  "import.excel":           { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied", SALES: "denied",     DISPATCH: "denied", PRODUCTION: "denied" },
  "reports.export":         { OWNER: "full", ADMIN: "full", ACCOUNTS: "full",   SALES: "own",         DISPATCH: "denied", PRODUCTION: "denied" },
  "audit.view":             { OWNER: "full", ADMIN: "readOnly", ACCOUNTS: "denied", SALES: "denied", DISPATCH: "denied", PRODUCTION: "denied" },
  // Everyone manages their own name, mobile and password (My profile).
  "profile.self":           { OWNER: "full", ADMIN: "full", ACCOUNTS: "full",   SALES: "full",       DISPATCH: "full", PRODUCTION: "full" },
  // Production workflow (2026-10-15): production marks progress; sales see their own orders' progress.
  "production.view":        { OWNER: "full", ADMIN: "full", ACCOUNTS: "readOnly", SALES: "own",       DISPATCH: "denied", PRODUCTION: "full" },
  "production.update":      { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied",   SALES: "denied",    DISPATCH: "denied", PRODUCTION: "full" },
  // Service requests: sales log them, production closes them.
  "service.create":         { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied",   SALES: "full",      DISPATCH: "denied", PRODUCTION: "denied" },
  "service.view":           { OWNER: "full", ADMIN: "full", ACCOUNTS: "readOnly", SALES: "own",       DISPATCH: "denied", PRODUCTION: "full" },
  "service.update":         { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied",   SALES: "denied",    DISPATCH: "denied", PRODUCTION: "full" },
};

export type OwnershipCtx = {
  // When action.permission === "own", caller supplies whether the target record
  // belongs to the acting user (e.g. order.salespersonId === session.userId).
  isOwn?: boolean;
};

export function can(role: Role, action: Action, ctx?: OwnershipCtx): boolean {
  const level = PERMISSION_MATRIX[action][role];
  switch (level) {
    case "full":
      return true;
    case "readOnly":
      return true; // read-only — caller must still prevent mutations by checking the level
    case "own":
      return ctx?.isOwn === true;
    case "ownRequest":
      // caller may create a request (e.g. cancel request); the service enforces downstream workflow
      return ctx?.isOwn === true;
    case "denied":
    default:
      return false;
  }
}

export function level(role: Role, action: Action): Permission {
  return PERMISSION_MATRIX[action][role];
}

export function assertCan(role: Role, action: Action, ctx?: OwnershipCtx): void {
  if (!can(role, action, ctx)) {
    throw new AppError("FORBIDDEN", "You do not have permission to perform this action.", {
      role,
      action,
    });
  }
}
