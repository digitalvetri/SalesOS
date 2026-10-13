// Password hashing with Node's built-in scrypt (memory-hard; no native deps).
// Stored format: scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
// Plain JS-compatible (no path aliases) so scripts run via tsx can import it.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const PASSWORD_MIN_LENGTH = 8;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keylen, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  try {
    const expected = Buffer.from(hashB64, "base64");
    const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p), expected.length);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// A fixed hash to verify against when the email is unknown, so a wrong email
// takes as long as a wrong password (no account-existence timing leak).
let dummy: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummy ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(password, await dummy);
  return false;
}
