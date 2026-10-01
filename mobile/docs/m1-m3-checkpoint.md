# FIXEO Mobile — M1/M2/M3 checkpoint

Date: 2026-10-01
Branch: `feat/fixeo-mobile-gate-ab`
Environment: Staging only (`kqyhusnbybsukbcaoqtu`).

## M1 Foundation
- Expo / React Native project present.
- SecureStore-backed Supabase session.
- Canonical role resolver.
- Staging project lock rejects non-staging Supabase URLs/keys.
- Gate A CI: contract tests + TypeScript + Expo web export.

Status: **PASS (software certification)**.

## M2 RAFI Mobile
- Text intake with deterministic zero-AI-cost classification for common trades.
- Native microphone capture.
- Native camera capture.
- Server transcription contract exists and never embeds provider secrets.
- Photo analysis is intentionally server-only and remains gated until the dedicated signed Staging gateway is available.

Status: **IMPLEMENTED / server media activation pending physical Staging build**.

## M3 Magic Loop
Canonical path:
Client request -> Dispatch V2 queue -> Artisan opportunity -> atomic acceptance ->
request assigned -> one pending mission -> competitor cancelled -> Client notification.

Evidence:
- transactional Staging certification PASS with ROLLBACK;
- two candidate artisans;
- exactly one accepted queue row;
- exactly one pending mission;
- competitor loses;
- Client assignment notification created;
- post-rollback fixture rows = 0.
- `service_requests` and `notifications` are now in `supabase_realtime` on Staging.
- secure `mobile_devices` registry exists with no direct browser table privileges;
- register/disable device RPCs are authenticated-only;
- push token registration idempotence, token transfer, and disable flow PASS in a rolled-back Staging test;
- authenticated Edge Function `mobile-magic-loop-push` is ACTIVE with JWT verification.

Status: **SERVER / SOFTWARE PASS**.

## Remaining physical Gate B
Not certifiable without external mobile distribution:
1. Link EAS project and obtain `EXPO_PUBLIC_EAS_PROJECT_ID`.
2. Install Staging build on Client and Artisan physical devices.
3. Register real Expo push tokens.
4. Execute Client -> Artisan -> Client loop on devices.
5. Confirm push delivery and deep-link opening.
6. Repeat winner-race test with two Artisan devices.

Until those checks pass, Gate B is not marked physically certified.
