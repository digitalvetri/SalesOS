// Private file storage for payment proofs (P3) and dispatch photos (P4), on
// the server's disk (UPLOAD_DIR; a Docker volume in production). The browser
// never gets a direct file URL: it uploads through an API route and views
// images through an API route that checks permissions and streams the file.
import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/errors";
import type { ProofMime } from "@/server/domain/payment/record";

export const BUCKETS = {
  paymentProofs: "payment-proofs",
  dispatchPhotos: "dispatch-photos",
} as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

const ROOT = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".uploads"));

/** Resolve bucket/key under ROOT, refusing anything that escapes it (../). */
function filePath(bucket: Bucket, key: string): string {
  const full = path.resolve(ROOT, bucket, key);
  if (!full.startsWith(path.join(ROOT, bucket) + path.sep)) {
    throw new AppError("VALIDATION", "Invalid file path.");
  }
  return full;
}

export async function uploadImage(bucket: Bucket, key: string, body: ArrayBuffer, contentType: ProofMime) {
  const full = filePath(bucket, key);
  try {
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, Buffer.from(body), { flag: "wx" }); // never overwrite
    await writeFile(`${full}.type`, contentType);
  } catch (e) {
    console.error(`[storage.upload ${bucket}]`, e);
    throw new AppError("INTERNAL", "Could not upload the photo. Try again.");
  }
}

export async function readImage(bucket: Bucket, key: string): Promise<{ body: Buffer; contentType: string }> {
  const full = filePath(bucket, key);
  try {
    const [body, contentType] = await Promise.all([
      readFile(full),
      readFile(`${full}.type`, "utf8").catch(() => "application/octet-stream"),
    ]);
    return { body, contentType };
  } catch {
    throw new AppError("NOT_FOUND", "Photo not found.");
  }
}
