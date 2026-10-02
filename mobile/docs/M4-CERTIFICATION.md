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
