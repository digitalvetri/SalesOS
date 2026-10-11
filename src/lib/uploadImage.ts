// Browser helper: compress (≤1600px, ~300KB) then POST to an image upload route.
import { compressImage } from "@/lib/compressImage";

export async function compressAndUpload(file: File, url: string): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  let blob: Blob;
  try {
    blob = await compressImage(file);
  } catch {
    return { ok: false, message: "Could not read that image." };
  }
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
  const json = (await res.json().catch(() => null)) as
    | { ok: true; data: { path: string } }
    | { ok: false; error: { message: string } }
    | null;
  if (!json) return { ok: false, message: "Upload failed. Try again." };
  return json.ok ? { ok: true, path: json.data.path } : { ok: false, message: json.error.message };
}
