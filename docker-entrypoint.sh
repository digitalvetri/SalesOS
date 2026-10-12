#!/bin/sh
set -e
if [ "$MIGRATE_ON_START" = "true" ]; then
  echo "[entrypoint] applying migrations"
  prisma migrate deploy --schema prisma/schema.prisma
  echo "[entrypoint] applying prisma/sql/extra.sql"
  prisma db execute --file prisma/sql/extra.sql --url "${DIRECT_URL:-$DATABASE_URL}"
fi
exec node server.js
