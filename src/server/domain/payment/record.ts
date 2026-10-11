// Pure helpers for recording a payment (§5.2, §11.5). No DB, no framework imports.
import Decimal from "decimal.js";
import { dec } from "@/server/domain/money";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Rounding tolerance for "covers the balance" / overpayment checks (§5.2: ₹1). */
export const OVERPAY_TOLERANCE = new Decimal(1);

/**
 * The record sheet has no type picker — the type follows from context:
 *   amount covers the balance (within ₹1) → FINAL
 *   first live payment on the order       → ADVANCE
 *   anything else                         → PART
 */
export function inferPaymentType(input: {
  amount: Decimal.Value;
  balanceDue: Decimal.Value;
  priorLivePayments: number; // non-REJECTED, non-REFUND payments already on the order
}): "ADVANCE" | "PART" | "FINAL" {
  const amount = dec(input.amount);
  const balance = dec(input.balanceDue);
  if (balance.greaterThan(0) && amount.plus(OVERPAY_TOLERANCE).greaterThanOrEqualTo(balance)) {
    return "FINAL";
  }
  return input.priorLivePayments === 0 ? "ADVANCE" : "PART";
}

/** YYYY-MM-DD of `now` in IST (BR-02 "today"). */
export function istDateString(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Payment date must be a real calendar date and not after today (IST).
 * `paidOn` is a business date (BR-02) — compared as a YYYY-MM-DD string.
 */
export function isPaidOnAllowed(paidOn: Date, now: Date): boolean {
  if (Number.isNaN(paidOn.getTime())) return false;
  return paidOn.toISOString().slice(0, 10) <= istDateString(now);
}

// ───────── Proof storage paths ─────────

export const PROOF_BUCKET = "payment-proofs";
export const PROOF_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ProofMime = (typeof PROOF_MIME_TYPES)[number];
/** Client compresses to ~300 KB (spec P3 prompt); the server accepts up to 2 MB. */
export const PROOF_MAX_BYTES = 2 * 1024 * 1024;

const EXT: Record<ProofMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isProofMime(v: string): v is ProofMime {
  return (PROOF_MIME_TYPES as readonly string[]).includes(v);
}

/** Object key inside the private bucket: `{tenantId}/{orderId}/{token}.{ext}`. */
export function proofPathFor(tenantId: string, orderId: string, token: string, mime: ProofMime): string {
  return `${tenantId}/${orderId}/${token}.${EXT[mime]}`;
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

/** A client-supplied path is only accepted if it was minted for this tenant + order. */
export function isProofPathFor(path: string, tenantId: string, orderId: string): boolean {
  const parts = path.split("/");
  if (parts.length !== 3) return false;
  const [t, o, file] = parts as [string, string, string];
  if (t !== tenantId || o !== orderId) return false;
  const m = /^([A-Za-z0-9_-]+)\.(jpg|png|webp)$/.exec(file);
  return Boolean(m && SAFE_SEGMENT.test(m[1]!));
}

/** Longest edge capped at `max`, aspect ratio kept, never upscaled. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Magic-byte check so a renamed file can't masquerade as an image. */
export function sniffImageMime(head: Uint8Array): ProofMime | null {
  const at = (i: number) => head[i];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
