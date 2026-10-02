# M4 — Certification checkpoint

Date: 2026-10-02

## Automated / server certification

PASS on Supabase Staging `fixeo-diagnostic-staging`.

A rollback-only transactional certification exercised:

- canonical request -> dispatch acceptance;
- repeated acceptance idempotence;
- arrival event idempotence;
- ownership isolation;
- repeated mission start idempotence;
- governed terrain adjustment submission;
- FIXEO/admin review gate;
- client visibility only after FIXEO review;
- client approval and agreed-price update;
- repeated mission completion idempotence;
- repeated client validation idempotence;
- final request/mission state = validated;
- final agreed price preserved.

Result: `M4_TRANSACTIONAL_CERT_PASS`.

## CI

Mobile Gate workflow validates:

- dependency install;
- Expo Doctor;
- contract tests;
- TypeScript;
- Expo web export.

## Physical certification still required

Build Android Staging `0.2.0` / versionCode `2`, install on the two Android test devices and verify:

1. reopen Client and Artisan apps;
2. current accepted mission is recovered automatically;
3. Artisan marks arrival -> Client receives/observes arrival;
4. Artisan uploads before evidence;
5. Artisan starts intervention -> Client timeline advances;
6. optional governed adjustment stays hidden until FIXEO review;
7. Artisan uploads after evidence;
8. Artisan completes -> Client receives completion state;
9. Client validates -> Artisan receives final state;
10. repeat app close/reopen and one temporary network interruption.

Production/main remain out of scope.


## Physical certification progress — 2026-10-02

PASS on two Android devices:

- Client role-aware reopen -> Client universe.
- Artisan role-aware reopen -> Artisan universe.
- Existing accepted mission recovered on both devices.
- Artisan arrival recorded -> Client timeline shows "Artisan arrivé".
- Before evidence captured -> private Staging evidence status ready.
- Mission start -> canonical request status in_progress -> Client timeline shows "Intervention en cours".
- After evidence captured -> private Staging evidence status ready.
- Artisan completion -> Client timeline shows "Intervention terminée".
- Client final validation -> canonical service_request = validated and mission = validated.
- Client and Artisan canonical validation notifications created.

Physical evidence path:
Artisan trouvé -> Artisan arrivé -> Intervention en cours -> Intervention terminée -> Mission validée.

Remaining M4.7 checks before final certification:
- close/reopen after final validation on both devices;
- one temporary network interruption/recovery check;
- final Artisan-side validated-state confirmation.


## M4.7 final resilience certification — PASS

Physical network-loss test on Client device:

- offline submit did not create a request and showed an explicit interrupted-connection state;
- after network recovery, one tap created exactly one canonical request;
- Artisan received the corresponding Plomberie / Fes opportunity;
- backend verification confirmed exactly one service_request for the test;
- dispatch queue contained the expected ranked candidates;
- certification request was then cancelled in Staging and its queued/contacted dispatch rows were marked CANCELLED.

Final M4.7 status: PASS.

M4 physical certification is complete on Android Staging 0.2.1 / versionCode 3.
Production/main remain untouched.
