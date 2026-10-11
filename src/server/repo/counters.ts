// DocumentCounter allocator (spec BR-04/BR-05).
//
// Must be called inside a transaction with Serializable isolation so parallel
// create requests cannot read the same counter value and emit duplicate order
// numbers. The orderService wraps the whole create in `$transaction(fn, { isolationLevel: 'Serializable' })`.
import type { Prisma } from "./client";

export async function allocateCounter(
  tx: Prisma.TransactionClient,
  opts: { tenantId: string; key: string },
): Promise<number> {
  // Upsert-and-increment pattern. The composite primary key (tenantId, key)
  // guarantees a single row per counter; Serializable isolation guarantees
  // that two concurrent writers can't both read the same current value.
  const row = await tx.documentCounter.upsert({
    where: { tenantId_key: { tenantId: opts.tenantId, key: opts.key } },
    create: { tenantId: opts.tenantId, key: opts.key, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return row.value;
}
