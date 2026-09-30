# FIXEO WhatsApp Business Platform — Pre-cutover hardening

Date: 2026-09-30  
Baseline: `eee8a86747aa1c52289437855a6f76c5af33e6ce`  
Branch: `feat/whatsapp-precutover-hardening`

## Canonical scope

- Target WABA: `1392741816131859`.
- Target business number: the FIXEO number beginning with **0663**.
- The existing **0660 48…** number is a personal/support number and is explicitly excluded from the Cloud API cutover.
- No Meta send is authorized by this pre-cutover block.

## Safety gates

Two independent runtime gates default to OFF unless explicitly set to the string `true`:

- `WHATSAPP_SEND_ENABLED`: outbound worker may claim/send only when true.
- `WHATSAPP_WEBHOOK_PROCESS_ENABLED`: webhook may persist provider statuses/inbound messages only when true.

With either gate absent/false, the deployed code remains non-mutating toward Meta:
- worker uses `dispatch_notification_worker_peek_v1` only;
- webhook acknowledges POST events without persistence.

Live send additionally requires:
- `WHATSAPP_WABA_ID` — must equal the canonical FIXEO WABA `1392741816131859`; any other account fails closed before queue claim/persistence.
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_GRAPH_API_VERSION`
- `WHATSAPP_DISPATCH_TEMPLATE_NAME`
- `WHATSAPP_DISPATCH_TEMPLATE_LANGUAGE`
- `WHATSAPP_CUTOVER_NOT_BEFORE` — required ISO timestamp; live claims ignore older queued rows.

Webhook processing additionally requires:
- `WHATSAPP_APP_SECRET`
- canonical WABA and Phone Number ID
- Supabase service-role server credentials

Existing `WHATSAPP_WEBHOOK_VERIFY_TOKEN` remains the GET callback-verification secret.

## Outbound contract

Production currently contains **3 historical PENDING WhatsApp outbox rows** from the pre-activation period. They must never be emitted when Cloud API is enabled.

When disabled, the worker never claims queue rows and never calls Meta.

When enabled after cutover:
1. claim one WHATSAPP notification through `dispatch_notification_worker_next_v2`, bounded by `WHATSAPP_CUTOVER_NOT_BEFORE`;
2. normalize the Moroccan recipient;
3. send an approved template through the configured Graph API version and Phone Number ID;
4. finalize `SENT` only after a provider message ID is returned;
5. retry only explicit HTTP retryable responses (408/409/429/5xx), capped by the existing attempt count;
6. never blindly retry network/timeout ambiguity, to avoid duplicate customer/artisan messages.

## Webhook contract

- GET verification remains compatible with Meta callback verification.
- POST processing validates `X-Hub-Signature-256` when processing is enabled.
- Events are accepted only for the configured WABA and Phone Number ID.
- Delivery statuses are persisted separately from the existing `notification_status` semantics.
- Inbound messages are deduplicated on provider message ID.
- Only minimal inbound fields are persisted; raw webhook payloads are not stored.

## Database candidate

Migration:
`supabase/migrations/20260930105000_whatsapp_precutover_hardening.sql`

It adds:
- provider delivery status fields on `dispatch_notification_outbox`;
- provider-message index;
- service-role-only retry RPC;
- service-role-only delivery-status RPC;
- RLS-protected `whatsapp_inbound_messages`;
- idempotent inbound ingest RPC.

The exact SQL candidate was syntax-validated against the Production PostgreSQL schema inside an explicit transaction and rolled back. No Production schema/data mutation was retained.

## Certification

`tests/whatsapp-precutover/whatsapp-precutover.test.cjs` covers:
- PRE_CUTOVER worker = PEEK only;
- no recipient phone leakage in worker response;
- live template payload construction;
- provider success finalization;
- bounded explicit 5xx retry;
- no blind network retry;
- mandatory Meta configuration before queue claim;
- webhook GET challenge;
- webhook PRE_CUTOVER zero side effects;
- signature validation;
- canonical WABA/phone filtering;
- delivery status persistence;
- inbound message persistence.

CI runs this test when WhatsApp worker, webhook, migration or test files change.

## Deferred until Meta approval

Do not enable either runtime gate yet.

After Meta approves FIXEO and the 0663 number:
1. obtain/confirm the exact Phone Number ID for 0663;
2. confirm permanent token/system-user permissions;
3. confirm current supported Graph API version;
4. create/approve the dispatch template;
5. apply the reviewed migration;
6. configure server-only variables;
7. verify webhook callback and signed POST behavior;
8. run one controlled E2E test;
9. only then enable processing, then sending;
10. after the API number is proven, replace the current 0660 public `wa.me` fallbacks with centralized 0663 configuration.

## Rollback

Before first live send:
- keep `WHATSAPP_SEND_ENABLED=false`;
- keep `WHATSAPP_WEBHOOK_PROCESS_ENABLED=false`.

If an issue occurs after cutover, setting both flags false returns the integration to the non-sending / non-processing state without changing the existing dispatch engine.
