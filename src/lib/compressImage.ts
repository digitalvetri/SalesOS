// Client-side proof compression (spec P3: "max 1600px, ~300KB"). Browser-only.
import { fitWithin } from "@/server/domain/payment/record";

const MAX_EDGE = 1600;
const TARGET_BYTES = 300 * 1024;
const QUALITIES = [0.82, 0.7, 0.58, 0.46];

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let blob: Blob | null = null;
    for (const q of QUALITIES) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (blob && blob.size <= TARGET_BYTES) break;
    }
    if (!blob) throw new Error("Could not encode image");
    return blob;
  } finally {
    bitmap.close();
  }
}
