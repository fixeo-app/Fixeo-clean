# FIXEO Artisan Journey V4 — Bloc 0 Boundary Contract

Status: **FROZEN / READ-ONLY BASELINE CONTRACT**

Baseline main: `2e35c4ad396a742014a5c75c70290f7ee1cded05`
Owner branch: `feat/artisan-journey-v4`

## Scope

Artisan Journey V4 applies only after a user intentionally enters an artisan public profile.

Canonical V4 scope:

`artisan profile -> targeted RAFI qualification -> canonical estimator/diagnostic consumption -> targeted request -> /api/create-request -> target_artisan_id`

## Strict non-scope

The following production journeys MUST NOT be modified by Artisan Journey V4:

- Homepage / Hero
- Homepage RAFI journey
- Homepage Diagnostic
- Homepage Estimator V2
- General request flow
- Urgent flow
- General artisan discovery/search behavior
- FIXEO Mobile branch/worktree

V4 may consume stable canonical contracts exposed by these systems. It must not alter their Homepage behavior.

## Protected Homepage baseline

The Bloc 0 certification locks these blobs to the baseline:

| Path | Git blob SHA |
|---|---|
| index.html | 309e85b46bcd0bd0d90134668cc1fb5b78317713 |
| js/fixeo-intake-v1.js | 4672fc11137fbe800643464ba181db3722bff936 |
| js/fixeo-estimator-v2.js | 8299df65ad21ceffea362f0fcc99b6cfa896ebd8 |
| js/fixeo-diagnostic-v1.js | 77a0ac452eafa91284284d609f88b413c6675258 |
| js/fixeo-estimator-reservation-bridge-v1.js | db10f914318eb5bd1d2363889d2822989ede7953 |
| js/fixeo-hero-flagship-v1.js | 5ee8a1de71071455501d268e45268ee651b775ce |
| js/fixeo-rafi-os-v1.js | a7232cd48767d02454f07921b514d99ea37984e3 |
| js/fx-request-flow-v4.js | b53a9c2ef39e90c33c1c9a2e094de284dc437b21 |

Changing one of these files in this owner branch is a STOP condition unless the scope is explicitly re-authorized.

## Existing profile dependency inventory

At baseline, `artisan-profile.html` loads 37 script tags and 21 stylesheet tags. Multiple generations coexist, including:

- `reservation.js`
- `reservation-v2.js`
- `fixeo-reservation-v3.js`
- `fixeo-estimation-engine-v1.js`
- `fixeo-public-artisan-profile.js`
- `fixeo-profile-v2a.js`
- `fixeo-profile-v3.js`
- `fixeo-profile-flagship-v1.js`
- `fixeo-reservation-flagship-v1.js`

Bloc 0 does not remove or alter them. Retirement is deferred until V4 is certified.

## Canonical assets to preserve through migration

- Public artisan canonical UUID
- `target_artisan_id`
- `POST /api/create-request`
- reservation idempotency key
- confirmation only after canonical ACK
- canonical Diagnostic contract
- canonical Estimator V2 contract
- Trust / Supply / Dispatch contracts

## Truth doctrine

V4 must never infer:

- `claimed = verified`
- `availability='available' = operationally available now`
- seeded/fallback rating = real review
- local JS market table = canonical FIXEO estimate

Missing evidence must render as missing/confirmation-required, never as fabricated trust.

## Cutover doctrine

Build in parallel -> certify -> switch only the artisan-profile CTA -> observe -> retire legacy.

No destructive legacy removal before the V4 path is production-certified. A rollback/kill-switch path must exist for the artisan-profile CTA cutover.

## Block 0 exit gates

1. Owner branch exists from the frozen main baseline.
2. Mobile owner branch is untouched.
3. Homepage protected blobs match baseline.
4. Artisan profile still exposes the existing canonical CTA and reservation engine.
5. Existing persistence contract still contains `target_artisan_id`, `idempotency_key`, and `/api/create-request`.
6. Automated boundary certification passes.
