// v1.1 §3 — S.No (per-salesperson running number) is generated inside the
// order-create transaction by locking a `DocumentCounter` row keyed by
// `SNO:<userId>` with `SELECT … FOR UPDATE`. This file is the pure logic
// around the key; the SQL locking lives in the Prisma call site.
export function snoKey(salespersonId: string): string {
  if (!/^[a-z0-9]+$/.test(salespersonId)) {
    throw new Error("salespersonId must be a bare cuid (letters+digits)");
  }
  return `SNO:${salespersonId}`;
}

/** `nextSerialNo(currentCounter)` = `currentCounter + 1`. Pure. */
export function nextSerialNo(currentCounter: number): number {
  if (!Number.isInteger(currentCounter) || currentCounter < 0) {
    throw new Error("currentCounter must be a non-negative integer");
  }
  return currentCounter + 1;
}
