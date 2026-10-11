-- SalesOS extra SQL — applied AFTER `prisma migrate deploy`.
-- Idempotent: safe to re-run.
-- Owner: spec §7 (CHECK constraints) + §14 (RLS defence in depth).

-- ───────────── CHECK constraints ─────────────

-- Payment: exactly one of receivedIntoAccountId / receivedByUserId is set.
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS payment_received_destination_chk;
ALTER TABLE "Payment" ADD CONSTRAINT payment_received_destination_chk
  CHECK ( ("receivedIntoAccountId" IS NULL) <> ("receivedByUserId" IS NULL) );

-- Payment amount must be positive.
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS payment_amount_positive_chk;
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_positive_chk
  CHECK ( "amount" > 0 );

-- OrderLine qty must be positive.
ALTER TABLE "OrderLine" DROP CONSTRAINT IF EXISTS orderline_qty_positive_chk;
ALTER TABLE "OrderLine" ADD CONSTRAINT orderline_qty_positive_chk
  CHECK ( "qty" > 0 );

-- DispatchLine qty must be positive.
ALTER TABLE "DispatchLine" DROP CONSTRAINT IF EXISTS dispatchline_qty_positive_chk;
ALTER TABLE "DispatchLine" ADD CONSTRAINT dispatchline_qty_positive_chk
  CHECK ( "qty" > 0 );

-- pg_trgm extension + its GIN indexes moved to a tracked migration — see
-- prisma/migrations/20261011072000_add_pg_trgm_indexes/migration.sql.
-- (Keeping them here caused Prisma to report drift on every subsequent
-- `migrate dev` run.)

-- ───────────── RLS defence in depth (spec D3, §14) ─────────────
-- Enable RLS on every table. Deliberately NO policies for anon/authenticated roles,
-- so direct Supabase-client reads from the browser get denied.
-- All reads/writes go through server-side code that uses the service-role key (which bypasses RLS).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname = 'public'
       AND c.relname NOT LIKE '\_prisma%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', r.tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', r.tbl);
  END LOOP;
END $$;

-- Assert no policies exist for the browser-accessible roles. If this ever changes,
-- the migration intentionally fails to force a security review.
DO $$
DECLARE
  bad_count int;
BEGIN
  SELECT count(*) INTO bad_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND ('anon' = ANY(roles) OR 'authenticated' = ANY(roles));
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Found % RLS polic(ies) for anon/authenticated — spec §14 requires none.', bad_count;
  END IF;
END $$;
