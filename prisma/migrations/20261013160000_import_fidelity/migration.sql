-- Imported order books: keep empty phones / amounts empty, and keep the sheet row as typed.
ALTER TABLE "Customer" ALTER COLUMN "phoneE164" DROP NOT NULL;
ALTER TABLE "Order" ADD COLUMN "totalMissing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "sheetRow" JSONB;
