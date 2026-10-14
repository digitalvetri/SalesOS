-- Production workflow, "Delivered" status, username logins, service requests (2026-10-15).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PRODUCTION';
ALTER TYPE "OrderStatusV2" RENAME VALUE 'COMPLETED' TO 'DELIVERED';

CREATE TYPE "ProductionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'FINISHED');
CREATE TYPE "ServiceType" AS ENUM ('FREE', 'PAID');
CREATE TYPE "ServiceStatus" AS ENUM ('PENDING', 'DONE');

ALTER TABLE "Order"
  ADD COLUMN "productionStatus" "ProductionStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "productionUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "productionUpdatedById" TEXT;
-- Orders already delivered were obviously produced.
UPDATE "Order" SET "productionStatus" = 'FINISHED' WHERE "simpleStatus" = 'DELIVERED';
CREATE INDEX "Order_tenantId_productionStatus_idx" ON "Order"("tenantId", "productionStatus");

ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");

CREATE TABLE "ServiceRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "address" TEXT,
  "product" TEXT,
  "complaint" TEXT NOT NULL,
  "serviceType" "ServiceType" NOT NULL,
  "status" "ServiceStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "doneAt" TIMESTAMP(3),
  "doneById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceRequest_tenantId_number_key" ON "ServiceRequest"("tenantId", "number");
CREATE INDEX "ServiceRequest_tenantId_status_idx" ON "ServiceRequest"("tenantId", "status");
CREATE INDEX "ServiceRequest_tenantId_createdById_idx" ON "ServiceRequest"("tenantId", "createdById");
