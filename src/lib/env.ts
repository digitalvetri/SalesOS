// Runtime env access. Fails loud at startup if required vars are missing.
import { z } from "zod";

const Schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).optional(),
  DATABASE_URL: z.string().min(10).optional(),
  DIRECT_URL: z.string().min(10).optional(),
  APP_ENCRYPTION_KEY: z.string().min(10).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "env"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function serverOnlyEnv(): Env & {
  SUPABASE_SERVICE_ROLE_KEY: string;
  DATABASE_URL: string;
  DIRECT_URL: string;
} {
  const base = env();
  if (!base.SUPABASE_SERVICE_ROLE_KEY || !base.DATABASE_URL || !base.DIRECT_URL) {
    throw new Error("Server-only env vars missing (SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, DIRECT_URL).");
  }
  return base as never;
}
