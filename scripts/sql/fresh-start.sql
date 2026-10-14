-- Fresh start (client request, 2026-10-15): remove every order, customer, payment and
-- their history so the team starts clean. KEEPS: users (employees + logins), sessions,
-- billing entities, products / price list, accounts, targets, company settings.
-- Take a pg_dump backup before running this.
BEGIN;
DELETE FROM "DispatchLine";
DELETE FROM "Dispatch";
DELETE FROM "WhatsAppMessage";
DELETE FROM "FollowUp";
DELETE FROM "OrderEvent";
DELETE FROM "OrderCharge";
DELETE FROM "OrderLine";
DELETE FROM "Payment";
DELETE FROM "Notification";
DELETE FROM "AuditLog" WHERE entity IN ('Order', 'Payment', 'Customer', 'ServiceRequest');
DELETE FROM "Order";
DELETE FROM "Customer";
DELETE FROM "ServiceRequest";
DELETE FROM "ImportBatch";
DELETE FROM "IdempotencyKey";
DELETE FROM "DocumentCounter" WHERE key LIKE 'ORDER:%' OR key LIKE 'RCPT:%' OR key LIKE 'SNO:%' OR key = 'SR';
SELECT
  (SELECT count(*) FROM "Order") AS orders,
  (SELECT count(*) FROM "Customer") AS customers,
  (SELECT count(*) FROM "Payment") AS payments,
  (SELECT count(*) FROM "User") AS users_kept,
  (SELECT count(*) FROM "Product") AS products_kept;
COMMIT;
