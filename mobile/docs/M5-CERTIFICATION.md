# FIXEO Mobile — M5 WOW Experience Certification

Status: SOFTWARE CANDIDATE — PHYSICAL CERTIFICATION PENDING

Branch: `feat/fixeo-mobile-m5-wow-experience`
Base: physically certified M4.
Release boundary: Staging only. Production/main untouched.

## Candidate scope

### M5.1 — Mobile Design System + Motion
- semantic tokens;
- safe-area screen primitive;
- premium cards and actions;
- RAFI animated orb states;
- shared visual language across Client / Artisan.

### M5.2 — Client Adaptive Home
- idle RAFI;
- matching state;
- assigned state;
- intervention state;
- completion/validation state;
- contextual Client OS access without dashboard-first UX.

### M5.3 — Artisan Cockpit
- current mission first;
- server decision cue;
- opportunity inbox;
- Artisan OS workspace access;
- availability + CRM + quotes + agenda + finance.

### M5.4 — RAFI Native Multimodal
- voice recording on device;
- authenticated server transcription;
- photo capture;
- explicit user-controlled private photo analysis;
- existing Diagnostic privacy/grounding/safety contract reused;
- no provider secret in mobile bundle;
- provenance labels retained and user confirmation explicit.

### M5.5 — Decision Center Bridge
- one bounded role-scoped cue;
- own Client workflow only;
- own Artisan mission / dispatch only;
- canonical evidence attached;
- no admin dashboard exposed to mobile;
- authenticated-only RPC.

### M5.6 — Feature Wiring
Client:
- intervention history;
- notifications;
- own profile phone/city.

Artisan:
- availability;
- personal CRM clients;
- personal quotes;
- personal agenda/jobs;
- personal finance ledger.

Marketplace and personal-client business objects remain distinct.

### M5.7 — WOW Polish / Physical
Pending physical Android certification.

## Physical Android certification checklist

### Device A — Client
1. update M5 over the M4 install without uninstall;
2. role-aware reopen -> Client;
3. idle RAFI home visually stable;
4. Mon espace -> history / alerts / account;
5. voice RAFI -> authenticated transcription;
6. photo RAFI -> explicit consent action -> private diagnostic result;
7. AI-assisted description is not applied until user confirms;
8. normal text request still creates exactly one canonical request;
9. matching / assigned / in-progress / completed adaptive states;
10. Client mission page has no clipped header and keeps evidence/validation behavior.

### Device B — Artisan
1. update M5 over the M4 install without uninstall;
2. role-aware reopen -> Artisan;
3. Cockpit prioritizes current mission or best opportunity;
4. Decision cue opens the correct mission or offer;
5. Artisan OS opens;
6. availability can be changed subject to canonical onboarding guard;
7. CRM / Devis / Agenda / Finance load only owned data;
8. Terrain mission keeps arrival / evidence / start / change / completion behavior.

### Reliability / quality
- close/reopen on both devices;
- temporary network interruption;
- keyboard does not cover primary actions;
- no stale state after foreground reconciliation;
- no duplicate request/accept;
- no privileged secret in bundle;
- acceptable responsiveness on the mid-range Android test devices.

## PASS rule

M5 may be certified only when:
- CI is green on the exact candidate SHA;
- Vercel Preview native endpoints are reachable;
- authenticated voice/photo work on physical Staging devices;
- Client and Artisan canonical journeys remain regression-free;
- no Production/main merge or cutover occurred.


## Software gate checkpoint — 2026-10-02

Exact branch head before this documentation checkpoint: `6db48181409a6154da734a085c1c56aa1b9f36c3`.

PASS:
- Mobile Gate A run #206: success.
- Vercel Preview exact branch deployment: READY.
- Stable branch Preview alias answers both native RAFI routes.
- GET /api/mobile-rafi-transcribe -> 405 METHOD_NOT_ALLOWED.
- GET /api/mobile-rafi-photo -> 405 METHOD_NOT_ALLOWED.
- Native RAFI functions are isolated Vercel functions and preview-only.
- Staging Supabase is hard-pinned in the native RAFI server boundary.
- public.mobile_rafi_quota_v1 has authenticated EXECUTE and anon EXECUTE revoked.
- Transactional authenticated quota probes for voice/photo passed.
- Anonymous quota execution is denied.
- Supabase security advisor reports no new mutable-search-path warning for the M5 quota function; remaining mutable-search-path findings are pre-existing functions outside this M5 scope.
- Mobile Decision Context remains authenticated-only and role-scoped.
- Production/main were not changed by this M5 work.

Current gate:
SOFTWARE READY FOR ANDROID M5 PHYSICAL BUILD.

Physical certification remains mandatory before M5 PASS.


## Preview secret scope checkpoint — 2026-10-03

Physical M5 RAFI testing identified that the native authenticated bridge reached the isolated Vercel Preview functions, but the Preview runtime did not inherit `OPENAI_API_KEY`.
The existing project secret was extended in Vercel from Production-only to Production + Preview without exposing its value to the mobile bundle.
No Production deployment or main merge is authorized by this checkpoint.
A fresh Preview deployment is required before RAFI photo/voice physical retest.
