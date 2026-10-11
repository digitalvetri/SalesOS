// Applies prisma/sql/extra.sql to the database that DATABASE_URL points at.
// Run after `prisma migrate deploy` (or `migrate dev`). Idempotent.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const sqlPath = path.resolve(path.dirname(__filename), "sql/extra.sql");

async function main() {
  const sql = readFileSync(sqlPath, "utf8");
  const prisma = new PrismaClient();
  try {
    // $executeRawUnsafe accepts the full file as one statement block because the file uses DO $$ … $$.
    // We split on top-level ';' outside of $$ blocks to be safe:
    const statements = splitSql(sql);
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      await prisma.$executeRawUnsafe(trimmed);
    }
    console.log(`extra.sql applied (${statements.length} statements).`);
  } finally {
    await prisma.$disconnect();
  }
}

function splitSql(sql: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let inDollar = false;
  for (let i = 0; i < sql.length; i++) {
    const two = sql.slice(i, i + 2);
    if (two === "$$") {
      inDollar = !inDollar;
      buf += two;
      i++;
      continue;
    }
    const ch = sql[i];
    if (ch === ";" && !inDollar) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
