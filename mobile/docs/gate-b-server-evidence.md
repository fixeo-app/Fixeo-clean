# FIXEO Mobile M3 — Server Magic Loop evidence

Date: 2026-10-01  
Environment: Supabase `fixeo-diagnostic-staging` only.

A transactional certification was executed with **ROLLBACK**. It exercised the canonical chain:

1. authenticated Client creates a request with `create_my_service_request_v1`;
2. Dispatch V2 creates two queue opportunities;
3. authenticated Artisan A reads its opportunity with `get_my_dispatch_offers_v1`;
4. Artisan A accepts through `accept_my_dispatch_offer_v1`;
5. request becomes `assigned`, exactly one mission becomes `pending`;
6. winning queue row becomes `ACCEPTED` and competitor becomes `CANCELLED`;
7. `publish_notification_event_s1b('mission_accepted', request_id)` creates the Client assignment notification;
8. Artisan B cannot win the same request;
9. the entire fixture is rolled back.

Observed result:

- status: **PASS**
- queue candidates: 2
- request status: `assigned`
- pending missions: 1
- accepted queue rows: 1
- cancelled queue rows: 1
- Client assignment notifications: 1
- losing second acceptance: `offer_not_active`
- notification RPC: true
- post-rollback fixture rows: 0

This certifies the **server-side Magic Loop and race winner contract**. It does **not** replace Gate B physical certification on two real devices.
