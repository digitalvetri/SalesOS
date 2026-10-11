// Meta WhatsApp webhook (§13).
// GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=… → echoes the challenge.
// POST status callbacks, X-Hub-Signature-256 checked against the tenant's app
// secret; 401 on a bad signature, otherwise 200 fast (processing is idempotent).
import { processWebhook, verifyWebhookToken } from "@/server/services/whatsappService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ok = await verifyWebhookToken(url.searchParams.get("hub.mode"), url.searchParams.get("hub.verify_token"));
  if (!ok) return new Response("Forbidden", { status: 403 });
  return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(req: Request) {
  const raw = await req.text(); // the signature is over the exact bytes
  try {
    const r = await processWebhook(raw, req.headers.get("x-hub-signature-256"));
    if (!r.ok) return new Response("Invalid signature", { status: 401 });
    return Response.json({ ok: true, updated: r.updated });
  } catch (e) {
    // Never make Meta retry-storm us on our own bug; log and acknowledge.
    console.error("[whatsapp.webhook]", e);
    return Response.json({ ok: true, updated: 0 });
  }
}
