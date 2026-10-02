# FIXEO Mobile — M1/M2/M3 owner checkpoint

Date: 2026-10-01
Owner branch: `feat/fixeo-mobile-m1-m3-owner`
PR: #87 (Draft)
Environment: Staging only (`kqyhusnbybsukbcaoqtu`).
Production / main: untouched.

## Ownership reconciliation
- Concurrent writes were detected on the former Gate A/B branch.
- Canonical M1-M3 checkpoint retained: `8d0c7fa0b25bea13d96df38200166092bcfed3d0`.
- New single-owner branch created from that checkpoint.
- Contaminated PR #86 closed without merge.
- Enterprise commits outside M1-M3 were not carried into the owner branch.

## M1 Foundation
- Expo / React Native project present.
- SecureStore-backed Supabase session.
- Staging project lock rejects non-staging Supabase URLs/keys.
- Public Staging env pinned in EAS development/preview profiles.
- SDK 54 native peer dependencies aligned.
- Gate A run #117: PASS.
- Gate A checks: npm install, Expo Doctor, contract tests, TypeScript, Expo web export.
- CI package-lock artifact generated: artifact #11160590920, SHA256 `58c18c19e28e114081e850e178cec2664276bb477eafd43a7b4b1b0c3391c70c`.

Status: **PASS (software certification)**.

## M2 RAFI Mobile
- Text intake with deterministic zero-AI-cost classification for common trades.
- Native microphone capture.
- Native camera capture.
- Server transcription contract exists and never embeds provider secrets.
- Photo analysis remains server-only.
- No provider key is present in the mobile bundle.

Status: **SOFTWARE IMPLEMENTED**.
Server media activation still requires the dedicated physical Staging distribution/gateway.

## M3 Magic Loop
Canonical path:
Client request -> Dispatch V2 queue -> Artisan opportunity -> atomic acceptance ->
request assigned -> one pending mission -> competitor cancelled -> Client notification.

Recertified Staging evidence:
- transactional Gate B server test: PASS with ROLLBACK;
- two candidate artisans;
- exactly one accepted queue row;
- exactly one pending mission;
- competing artisan loses with inactive/cancelled offer;
- Client assignment notification created;
- post-rollback service-request fixture rows: 0;
- `service_requests` and `notifications` are in `supabase_realtime`;
- secure `mobile_devices` registry has no anon/authenticated direct table privileges;
- register/disable device RPCs are authenticated-only;
- device register -> token transfer -> disable transactional test: PASS with ROLLBACK;
- synthetic device rows after rollback: 0;
- authenticated Edge Function `mobile-magic-loop-push` is ACTIVE with JWT verification.

Status: **SERVER / SOFTWARE PASS**.

## EAS linkage
- Expo organization: `fixeo-maroc`.
- Expo project slug: `fixeo-mobile`.
- EAS project ID: `bb76a67f-4304-48a6-ad29-ca7382d28a7a`.
- `app.json` linked with `owner` + `extra.eas.projectId`.
- development/preview EAS profiles receive the Staging project ID.
- `expo-dev-client` is installed for development builds.
- Android preview profile is configured for an installable APK.

## Remaining physical Gate B
Not certifiable without external mobile distribution:
1. Complete Apple Developer Organization enrollment (D&B case #34893086 is pending) for physical iOS builds.
2. Trigger the first EAS Staging build (Android can proceed before Apple enrollment).
3. Install Staging on Client and Artisan physical devices.
4. Register real Expo push tokens.
5. Execute Client -> Artisan -> Client loop on devices.
6. Confirm push delivery and deep-link opening.
7. Repeat winner-race test with two Artisan devices.

Until those physical checks pass, Gate B is **not physically certified**.
