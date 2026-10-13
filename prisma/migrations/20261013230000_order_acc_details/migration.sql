-- Where the payment was received ("ACC DETAILS" in the order book), editable on the order.
ALTER TABLE "Order" ADD COLUMN "accDetails" TEXT;
UPDATE "Order" SET "accDetails" = NULLIF(TRIM("sheetRow"->>'acc'), '') WHERE "sheetRow" IS NOT NULL;
