// Vitest global setup — runs before any test file is imported.
// Loads .env.local (if present) so Prisma's singleton client picks up DATABASE_URL
// at module-import time rather than reading undefined.
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local"), override: false });
config({ path: path.resolve(process.cwd(), ".env"), override: false });
