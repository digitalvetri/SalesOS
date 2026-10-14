// The ONLY module permitted to import @prisma/client (ESLint rule in eslint.config.mjs).
// Everyone else imports repository functions from sibling files in this folder.
import { PrismaClient } from "@prisma/client";

declare global {
  var __salesosPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__salesosPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__salesosPrisma = prisma;
}

export type { Prisma } from "@prisma/client";
export {
  Role,
  Lang,
  OrderStatus,
  OrderStatusV2,
  CancelReason,
  OrderSource,
  AccountKind,
  CustomerType,
  ChargeKind,
  PaymentMethod,
  PaymentType,
  PaymentStatus,
  FollowUpChannel,
  ProductionStatus,
  ServiceType,
  ServiceStatus,
} from "@prisma/client";
