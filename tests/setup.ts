// Vitest global setup — runs before any test file is imported.
// Loads .env.local (if present) so Prisma's singleton client picks up DATABASE_URL
// at module-import time rather than reading undefined.
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local"), override: false });
config({ path: path.resolve(process.cwd(), ".env"), override: false });

// Vitest runs one worker per file, each with its own Prisma pool (default
// cpus*2+1 connections). Alongside a running `next dev` that exhausts local
// Postgres ("too many clients already"), so keep each test pool small.
if (process.env.DATABASE_URL && !/[?&]connection_limit=/.test(process.env.DATABASE_URL)) {
  const sep = process.env.DATABASE_URL.includes("?") ? "&" : "?";
  process.env.DATABASE_URL += `${sep}connection_limit=2`;
}
