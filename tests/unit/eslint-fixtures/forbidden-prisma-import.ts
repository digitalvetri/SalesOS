// FIXTURE: this file must FAIL `pnpm run lint:fixtures` because it imports
// @prisma/client from outside src/server/repo (spec §14).
// If ESLint ever stops flagging this, the security guarantee is broken.
// This file is excluded from tsconfig.json so it does not type-check.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { PrismaClient } from "@prisma/client";
export const banned = new PrismaClient();
