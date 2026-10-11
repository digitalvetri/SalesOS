// Payment proof screenshots — private Supabase Storage bucket (spec P3: "proof
// uploads to private Supabase Storage with signed URLs"). Server-only: the
// browser never holds a storage credential; it posts the compressed image to
// /api/payments/proof and views it through a short-lived signed URL.
import "server-only";
import { supabaseService } from "@/lib/supabase/service";
import { AppError } from "@/lib/errors";
import {
  PROOF_BUCKET,
  PROOF_MAX_BYTES,
  PROOF_MIME_TYPES,
  type ProofMime,
} from "@/server/domain/payment/record";

const SIGNED_URL_TTL_SECONDS = 60;

let bucketReady: Promise<void> | undefined;

// Local stacks create the bucket from supabase/config.toml; hosted projects get
// it on first upload. Memoised per server instance.
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const storage = supabaseService().storage;
    const { data } = await storage.getBucket(PROOF_BUCKET);
    if (data) return;
    const { error } = await storage.createBucket(PROOF_BUCKET, {
      public: false,
      fileSizeLimit: PROOF_MAX_BYTES,
      allowedMimeTypes: [...PROOF_MIME_TYPES],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  })().catch((e) => {
    bucketReady = undefined;
    throw e;
  });
  return bucketReady;
}

export async function uploadProof(path: string, body: ArrayBuffer, contentType: ProofMime): Promise<void> {
  await ensureBucket();
  const { error } = await supabaseService()
    .storage.from(PROOF_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  if (error) {
    console.error("[paymentProofs.upload]", error);
    throw new AppError("INTERNAL", "Could not upload the screenshot. Try again.");
  }
}

export async function signedProofUrl(path: string): Promise<string> {
  const { data, error } = await supabaseService()
    .storage.from(PROOF_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("[paymentProofs.sign]", error);
    throw new AppError("NOT_FOUND", "Screenshot not found.");
  }
  return data.signedUrl;
}
