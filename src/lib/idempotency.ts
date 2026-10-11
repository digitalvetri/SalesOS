// Idempotency ledger (spec §14). Caller passes a `idempotencyKey: UUID` with the
// payload; the server stores the key + result for 24h. Retries with the same key
// short-circuit to the stored result, preventing double orders on flaky networks.
import { prisma } from "@/server/repo/client";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotentResult<T> =
  | { kind: "fresh"; value: T }
  | { kind: "replay"; value: T };

/**
 * Runs `work` guarded by an idempotency key. If the key has been seen within
 * the TTL and a stored result exists, returns it as "replay"; otherwise runs
 * `work`, stores the result, and returns it as "fresh".
 *
 * The `work` fn SHOULD be idempotent at the DB layer too (unique constraints,
 * counter upserts) — this wrapper merely cheaply reuses prior results.
 */
export async function withIdempotency<T>(opts: {
  key: string;
  tenantId: string;
  userId: string;
  scope: string; // e.g. "orders.create"
  work: () => Promise<T>;
  ttlMs?: number;
}): Promise<IdempotentResult<T>> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: { key: opts.key },
  });
  const now = new Date();
  if (existing && existing.expiresAt.getTime() > now.getTime()) {
    if (existing.resultJson !== null) {
      return { kind: "replay", value: existing.resultJson as T };
    }
    // In-flight call (slot taken, no result yet). Treat as replay with no payload.
    // Caller should treat this as "accept, no new work" by surfacing a user-friendly notice.
    return { kind: "replay", value: null as T };
  }

  const expiresAt = new Date(now.getTime() + (opts.ttlMs ?? DEFAULT_TTL_MS));
  await prisma.idempotencyKey.upsert({
    where: { key: opts.key },
    create: {
      key: opts.key,
      tenantId: opts.tenantId,
      userId: opts.userId,
      scope: opts.scope,
      resultJson: undefined,
      expiresAt,
    },
    update: { expiresAt, scope: opts.scope, userId: opts.userId },
  });

  const value = await opts.work();

  await prisma.idempotencyKey.update({
    where: { key: opts.key },
    data: { resultJson: value as never },
  });

  return { kind: "fresh", value };
}
