-- Remove every order that came from the Excel import (Order.importRef set), with its
-- payments, lines, events, dispatches, follow-ups and messages, the customers that only
-- those orders used, and the order/receipt/S.No counters — so a corrected import can be
-- loaded fresh. Employees, products and settings are NOT touched.
-- Refuses to run if any order was entered in the app (importRef is null).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Order" WHERE "importRef" IS NULL) THEN
    RAISE EXCEPTION 'Orders entered in the app exist (% rows) — not resetting.', (SELECT count(*) FROM "Order" WHERE "importRef" IS NULL);
  END IF;
END $$;
CREATE TEMP TABLE imp ON COMMIT DROP AS SELECT id, "customerId" FROM "Order" WHERE "importRef" IS NOT NULL;
DELETE FROM "DispatchLine" WHERE "dispatchId" IN (SELECT id FROM "Dispatch" WHERE "orderId" IN (SELECT id FROM imp));
DELETE FROM "Dispatch" WHERE "orderId" IN (SELECT id FROM imp);
DELETE FROM "WhatsAppMessage" WHERE "orderId" IN (SELECT id FROM imp);
DELETE FROM "FollowUp" WHERE "orderId" IN (SELECT id FROM imp);
DELETE FROM "OrderEvent" WHERE "orderId" IN (SELECT id FROM imp);
DELETE FROM "OrderCharge" WHERE "orderId" IN (SELECT id FROM imp);
DELETE FROM "OrderLine" WHERE "orderId" IN (SELECT id FROM imp);
DELETE FROM "Payment" WHERE "orderId" IN (SELECT id FROM imp);
DELETE FROM "AuditLog" WHERE entity = 'Order' AND "entityId" IN (SELECT id FROM imp);
DELETE FROM "Order" WHERE id IN (SELECT id FROM imp);
DELETE FROM "Customer" c WHERE c.id IN (SELECT "customerId" FROM imp)
  AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."customerId" = c.id)
  AND NOT EXISTS (SELECT 1 FROM "Customer" m WHERE m."mergedIntoId" = c.id);
DELETE FROM "DocumentCounter" WHERE key LIKE 'ORDER:%' OR key LIKE 'RCPT:%' OR key LIKE 'SNO:%';
SELECT (SELECT count(*) FROM "Order") AS orders_left, (SELECT count(*) FROM "Customer") AS customers_left;
COMMIT;
