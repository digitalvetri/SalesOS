-- Retroactive migration: the pg_trgm extension and GIN indexes used to live in
-- prisma/sql/extra.sql, which caused Prisma to see "drift" on every subsequent
-- migrate dev run. Moving them into a tracked migration fixes that.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS product_searchtext_trgm_idx
  ON "Product" USING gin ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS customer_name_trgm_idx
  ON "Customer" USING gin (name gin_trgm_ops);
