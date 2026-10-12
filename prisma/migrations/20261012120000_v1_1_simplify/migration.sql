-- v1.1 simplify (spec 2026-10-12-salesos-simplified-v1.1.md §3).
-- Back-fill existing rows with `node scripts/v1-1-backfill.mjs --commit`.

-- CreateEnum
CREATE TYPE "OrderStatusV2" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "completedAt" DATE,
ADD COLUMN     "paidTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "productText" TEXT,
ADD COLUMN     "serialNo" INTEGER,
ADD COLUMN     "simpleStatus" "OrderStatusV2" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "defaultMonthlyTarget" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email" TEXT,
ADD COLUMN     "loginId" TEXT,
ADD COLUMN     "passwordSetAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_tenantId_simpleStatus_idx" ON "Order"("tenantId", "simpleStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_salespersonId_serialNo_key" ON "Order"("tenantId", "salespersonId", "serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
