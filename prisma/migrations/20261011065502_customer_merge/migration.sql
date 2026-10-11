-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "mergedAt" TIMESTAMP(3),
ADD COLUMN     "mergedIntoId" TEXT;

-- CreateIndex
CREATE INDEX "Customer_tenantId_mergedIntoId_idx" ON "Customer"("tenantId", "mergedIntoId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
