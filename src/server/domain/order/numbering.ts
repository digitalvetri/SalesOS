// Order and receipt number formatters (spec BR-04, BR-05).
//
// Pure formatters only. The actual sequence allocation happens inside the
// create transaction via `DocumentCounter` locked with SELECT … FOR UPDATE —
// see src/server/services/orderService.ts.
//
// Format examples:
//   KI/26-27/0042     — order; `{ENTITY_CODE}/{FY}/{SEQ4}` padded to 4 digits
//   RCPT/26-27/01231  — payment receipt; `RCPT/{FY}/{SEQ5}` padded to 5 digits

export function orderNumber(entityCode: string, fyLabel: string, seq: number): string {
  assertEntityCode(entityCode);
  assertFyLabel(fyLabel);
  assertSeq(seq, 9999, "order");
  return `${entityCode}/${fyLabel}/${pad(seq, 4)}`;
}

export function receiptNumber(fyLabel: string, seq: number): string {
  assertFyLabel(fyLabel);
  assertSeq(seq, 99999, "receipt");
  return `RCPT/${fyLabel}/${pad(seq, 5)}`;
}

// A stable key for the DocumentCounter row scoped per entity + FY (orders)
// or just per FY (receipts).
export function orderCounterKey(entityCode: string, fyLabel: string): string {
  assertEntityCode(entityCode);
  assertFyLabel(fyLabel);
  return `ORDER:${entityCode}:${fyLabel}`;
}

export function receiptCounterKey(fyLabel: string): string {
  assertFyLabel(fyLabel);
  return `RCPT:${fyLabel}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function assertEntityCode(code: string): void {
  if (!/^[A-Z][A-Z0-9]{0,7}$/.test(code)) {
    throw new Error(`Invalid entity code: ${code}`);
  }
}

function assertFyLabel(fy: string): void {
  if (!/^\d{2}-\d{2}$/.test(fy)) {
    throw new Error(`Invalid FY label: ${fy} (expected YY-YY)`);
  }
}

function assertSeq(seq: number, max: number, label: string): void {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`${label} sequence must be a positive integer: ${seq}`);
  }
  if (seq > max) {
    throw new Error(`${label} sequence overflow at ${seq} (max ${max})`);
  }
}
