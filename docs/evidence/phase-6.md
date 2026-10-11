# Phase P6 — WhatsApp · Evidence

Dates: 2026-10-11.
Spec: [`docs/superpowers/specs/2026-10-10-salesos-design.md`](../superpowers/specs/2026-10-10-salesos-design.md) §17-P6 (§13, §7 WhatsAppMessage, §5.4 auto-reminders, §11.13 Settings → WhatsApp, §14 secrets).
Release: `dev` → `main` as `v0.7.0-p6`.

## Status

| Gate requirement (§17-P6) | Status | Where |
|---|---|---|
| Webhook verify `curl` output | ✅ | below (real HTTP against `pnpm start`) |
| Signature-reject test | ✅ | `curl` (401) + `tests/integration/whatsapp.test.ts` + `tests/unit/secrets.test.ts` |
| Test-send screenshot from a real phone, **or** deep-link fallback screenshot | ✅ fallback | `screenshots/settings-whatsapp.png` (test send → "Open in WhatsApp" `wa.me` link). No Meta account in the sandbox; with real credentials the same button reports the `wamid` |
| Rate-limit test output | ✅ | below |
| Settings, 4 templates, send service, deep-link fallback | ✅ | `/settings/whatsapp`, `domain/whatsapp`, `whatsappService` |
| Webhook GET/POST with signature check, idempotent on `waMessageId`, fast 200 | ✅ | `/api/whatsapp/webhook`, `processWebhook` |
| Reminder job + rate limit + Sunday / time-window rules | ✅ | `runAutoReminders`, `/api/cron/whatsapp-reminders`, `vercel.json` |
| Token encrypted at rest (AES-256-GCM, `APP_ENCRYPTION_KEY`) | ✅ | `security/secrets.ts` (access token and app secret) |

## Webhook + cron: `curl` output

Run against the production build (`pnpm build && pnpm start`), with the pilot tenant configured with a phone number ID, verify token and app secret:

```
$ curl -s "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=pilot-verify-token&hub.challenge=1158201444"
1158201444  [HTTP 200]
$ curl -s "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=1158201444"
Forbidden  [HTTP 403]
$ curl -s -X POST http://localhost:3000/api/whatsapp/webhook -H "X-Hub-Signature-256: sha256=<HMAC-SHA256 of body with app secret>" -d "$BODY"
{"ok":true,"updated":0}  [HTTP 200]
$ curl -s -X POST http://localhost:3000/api/whatsapp/webhook -H "X-Hub-Signature-256: sha256=deadbeef…" -d "$BODY"
Invalid signature  [HTTP 401]
$ curl -s -X POST http://localhost:3000/api/whatsapp/webhook -d "$BODY"          # no signature header
Invalid signature  [HTTP 401]
$ curl -s http://localhost:3000/api/cron/whatsapp-reminders                       # no CRON_SECRET
{"ok":false,"error":{"code":"FORBIDDEN"}}  [HTTP 403]
$ curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/whatsapp-reminders   # run on a Sunday (IST)
{"ok":true,"data":{"tenants":0,"sent":0,"skipped":{"outside_window":1}}}  [HTTP 200]
```

`$BODY` is a Meta status callback (`{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"PILOT_PN_123"},"statuses":[…]}}]}]}`). The valid signature is `sha256=` plus the HMAC-SHA256 of the exact body with the app secret (`openssl dgst -sha256 -hmac`). The cron call ran on a Sunday in IST, so the job correctly skipped everything with `outside_window`.

## Tests: send service, rate limit, webhook, auto-reminder job

`tests/integration/whatsapp.test.ts` uses a fake Meta `fetch`. `tests/unit/whatsapp.test.ts` and `tests/unit/secrets.test.ts` are pure.

```
 ✓ tests/unit/secrets.test.ts > AES-256-GCM secrets > round-trips and uses a fresh IV each time 4ms
 ✓ tests/unit/secrets.test.ts > AES-256-GCM secrets > detects tampering and wrong keys 2ms
 ✓ tests/unit/secrets.test.ts > AES-256-GCM secrets > rejects missing or short keys 0ms
 ✓ tests/unit/secrets.test.ts > Meta webhook signature > accepts the right signature 2ms
 ✓ tests/unit/secrets.test.ts > Meta webhook signature > rejects wrong secret, tampered body, missing or malformed header 0ms
 ✓ tests/unit/whatsapp.test.ts > templates (§13) > order_confirmation matches the spec example 10ms
 ✓ tests/unit/whatsapp.test.ts > templates (§13) > payment_received 1ms
 ✓ tests/unit/whatsapp.test.ts > templates (§13) > dispatch_update with and without transport 0ms
 ✓ tests/unit/whatsapp.test.ts > templates (§13) > payment_reminder 0ms
 ✓ tests/unit/whatsapp.test.ts > templates (§13) > exactly four templates 1ms
 ✓ tests/unit/whatsapp.test.ts > send window (§5.4: never Sunday, 10:00–19:00 IST) > weekday hours 0ms
 ✓ tests/unit/whatsapp.test.ts > send window (§5.4: never Sunday, 10:00–19:00 IST) > never on Sunday (IST) 0ms
 ✓ tests/unit/whatsapp.test.ts > auto reminders (every N days, max M, 48 h floor) > sends when overdue and never reminded 0ms
 ✓ tests/unit/whatsapp.test.ts > auto reminders (every N days, max M, 48 h floor) > blocks: not overdue, max reached, 48 h cooldown, not due yet 1ms
 ✓ tests/unit/whatsapp.test.ts > auto reminders (every N days, max M, 48 h floor) > sends again once N days have passed 0ms
 ✓ tests/unit/whatsapp.test.ts > webhook status ordering > moves forward only 0ms
 ✓ tests/unit/whatsapp.test.ts > webhook status ordering > failed is terminal; deeplink/unknown untouched 0ms
 ✓ tests/integration/whatsapp.test.ts > P6 — WhatsApp > not configured → DEEPLINK row + wa.me link (§13 fallback) 102ms
 ✓ tests/integration/whatsapp.test.ts > P6 — WhatsApp > configured → Cloud API call with decrypted token, template name + params; SENT row 89ms
[P6-gate] rate limit: 1st reminder → api; 2nd within 48 h → CONFLICT "WA/1 was reminded in the last 48 hours — next reminder after 13 Oct, 04:51 pm."
 ✓ tests/integration/whatsapp.test.ts > P6 — WhatsApp > API error or network failure → falls back to DEEPLINK with the error recorded 24ms
 ✓ tests/integration/whatsapp.test.ts > P6 — WhatsApp > rate limit: one payment_reminder per order per 48 h (manual) 52ms
 ✓ tests/integration/whatsapp.test.ts > P6 — WhatsApp > webhook GET verify token 12ms
[P6-gate] webhook delivered → updated 1 → DELIVERED
[P6-gate] webhook read → updated 1 → READ
[P6-gate] webhook delivered → updated 0 → READ
[P6-gate] webhook read → updated 0 → READ
[P6-gate] auto Mon 09:00 IST: sent 0, skipped {"outside_window":1}
[P6-gate] auto Sun 11:30 IST: sent 0, skipped {"outside_window":1}
[P6-gate] auto Mon 11:30 IST: sent 1, skipped {}
[P6-gate] auto Tue 11:30 (24 h later): sent 0, skipped {"cooldown":1}
[P6-gate] auto Thu 11:30 (3 d later): sent 0, skipped {"not_due_yet":1}
[P6-gate] auto Sat 11:30 (5 d later): sent 1, skipped {}
[P6-gate] auto next Thu (max 2 reached): sent 0, skipped {"max_reached":1}
[P6-gate] auto not configured: sent 0, skipped {"not_configured":1}
 ✓ tests/integration/whatsapp.test.ts > P6 — WhatsApp > webhook POST: signature required; statuses move forward only; idempotent 38ms
 ✓ tests/integration/whatsapp.test.ts > P6 — WhatsApp > auto reminders: window, Sunday, cooldown, every-N-days, max count, not configured 55ms
      Tests  24 passed (24)
```

## E2E

- `whatsapp-settings.spec.ts`:
  - Admin saves the pay-to line and app secret. After a reload, the secret field is empty with the placeholder "saved (encrypted)".
  - The webhook URL is shown.
  - Test send gives `https://wa.me/919843722055?text=Gentle%20reminder…`.
- `new-order.spec.ts`: after Confirm order, the §11.3 success banner shows the order number and **Share on WhatsApp** (`wa.me/…?text=…`).
- `payments.spec.ts`: the Collect WhatsApp reminder goes through the server path (48-hour rule) and opens `wa.me`.
- `dispatch.spec.ts`: the toast's "Send WhatsApp update" goes through the server-built `dispatch_update` link.
- Full suite: **31 passed, 0 failed**.

## Design notes

- **One send path.** Every send goes through `sendTemplate`: the Cloud API when connected (5-second timeout), otherwise a `DEEPLINK` row plus a `wa.me` link. API failures also fall back, with the error recorded on the row.
- **Signature before trust.** The webhook reads `phone_number_id` only to find the tenant whose app secret it must verify against. Nothing else in the body is used before `X-Hub-Signature-256` passes.
- **Idempotency.** Status updates are conditional (`WHERE status = <current>`) and only move forward (sent → delivered → read). Duplicates and out-of-order deliveries are no-ops. FAILED is terminal.
- **Rate limit.** The 48-hour rule lives in `followUpService.logReminder` (manual) and in `autoReminderDecision` (job), and both read the same WhatsApp `FollowUp` history, so manual and auto reminders count against each other.
- **The job sends via the API only.** A cron job has nobody to open a deep link, so tenants without the API are skipped (`not_configured`).
- **Secrets.** `APP_ENCRYPTION_KEY` must decode to exactly 32 bytes. The CI and local placeholder used to be 45 base64 characters (33 bytes); that is fixed. The access token and app secret are never sent back to the browser or written to the audit log.

## Known carry-forward

- **Real-phone delivery:** needs the pilot's Meta Business account, approved templates (English and Tamil) and a production URL for the webhook. The settings screen accepts them as-is.
- **Per-customer language:** customers have no language field yet, so templates use the tenant's language code. Add a field when the Tamil templates are approved.
- **Native-speaker Tamil review:** carried forward.

## PRs that make up this release

| # | Title |
|---|---|
| [#27](https://github.com/digitalvetri/SalesOS/pull/27) | P6-A: WhatsApp core: Cloud API send + wa.me fallback, webhook, auto-reminder job |
| [#28](https://github.com/digitalvetri/SalesOS/pull/28) | P6-B: Settings → WhatsApp + Cloud API wired into reminders, dispatch, verify, order confirmation |
| (gate) | **P6-C: evidence + main → dev sync** |

Tag: `v0.7.0-p6` on merge to `main`.
