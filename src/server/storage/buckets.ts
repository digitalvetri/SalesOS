// Private Supabase Storage buckets (payment proofs P3, dispatch photos P4).
// Server-only: the browser never holds a storage credential; it posts the
// compressed image to an API route and views it through a short-lived
// signed URL (spec P3: "private Supabase Storage with signed URLs").
import "server-only";
import { supabaseService } from "@/lib/supabase/service";
import { AppError } from "@/lib/errors";
import { PROOF_MAX_BYTES, PROOF_MIME_TYPES, type ProofMime } from "@/server/domain/payment/record";

export const BUCKETS = {
  paymentProofs: "payment-proofs",
  dispatchPhotos: "dispatch-photos",
} as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

const SIGNED_URL_TTL_SECONDS = 60;
const ready = new Map<Bucket, Promise<void>>();

// Local stacks create buckets from supabase/config.toml; hosted projects get
// them on first upload. Memoised per server instance.
function ensureBucket(bucket: Bucket): Promise<void> {
  let p = ready.get(bucket);
  if (!p) {
    p = (async () => {
      const storage = supabaseService().storage;
      const { data } = await storage.getBucket(bucket);
      if (data) return;
      const { error } = await storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: PROOF_MAX_BYTES,
        allowedMimeTypes: [...PROOF_MIME_TYPES],
      });
      if (error && !/already exists/i.test(error.message)) throw error;
    })().catch((e) => {
      ready.delete(bucket);
      throw e;
    });
    ready.set(bucket, p);
  }
  return p;
}

export async function uploadImage(bucket: Bucket, path: string, body: ArrayBuffer, contentType: ProofMime) {
  await ensureBucket(bucket);
  const { error } = await supabaseService().storage.from(bucket).upload(path, body, { contentType, upsert: false });
  if (error) {
    console.error(`[storage.upload ${bucket}]`, error);
    throw new AppError("INTERNAL", "Could not upload the photo. Try again.");
  }
}

export async function signedImageUrl(bucket: Bucket, path: string): Promise<string> {
  const { data, error } = await supabaseService().storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error(`[storage.sign ${bucket}]`, error);
    throw new AppError("NOT_FOUND", "Photo not found.");
  }
  return data.signedUrl;
}
