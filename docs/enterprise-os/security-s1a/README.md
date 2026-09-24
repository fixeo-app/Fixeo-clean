# FIXEO Enterprise OS — Phase 3A-S1A Production application

The user explicitly authorized the frozen candidate in this conversation. Applied successfully to `fixeo-mvp` (`ztwtbgoqanqzvwiibtuh`) on 2026-09-24. No application file was changed.

## Exact candidate and baseline

- MAIN and Production before application: `9fc7542c84a554f1c604e045322a374122f7daf0`.
- Production deployment before application: `dpl_9TwgZbnCC9K3ZA1dzy6Rbyj5DPjw`, READY.
- Candidate and canonical migration SHA256: `7e998abb17c31ccc587715c81fa9ecad803cff7e8cb6f2cccd31db83f3322844`.
- Migration: `supabase/migrations/20260924044646_service_requests_safe_hardening_s1a.sql`.
- Supabase migration history: version `20260924044646`, name `service_requests_safe_hardening_s1a`.
- The CLI generated the local migration first. Its filename was aligned to the actual Production migration history version after application; its bytes stayed identical.
- Frozen review comments in the SQL were intentionally retained unchanged. The later explicit user authorization is recorded in `apply-result.json`.
- Production preflight: **12/12 PASS**, rechecked immediately before application.
- Apply: **SUCCESS**, exactly once, with the original BEGIN/COMMIT, lock timeout 5s, statement timeout 30s, drift guards and postconditions.
- Production postflight: **12/12 PASS**.

## Verified result

Anon table INSERT is false. Effective anon INSERT column privileges are exactly `service_category`, `city`, `description`, `status`. No financial or identity column is insertable by anon. `status` still defaults to `new`; `client_profile_id` has no explicit default and remains nullable.

The single anon INSERT policy is `anon_service_requests_insert`, with `status = 'new' AND client_profile_id IS NULL`. `anon_insert` and `artisan_assign_new_requests` are absent. `artisan_update_assigned_requests` retains the same linked mission join, using only `artisans.owner_user_id = auth.uid()` in USING and WITH CHECK. The phone fallback is absent.

Anon SELECT, UPDATE and DELETE table grants were deliberately preserved. RLS still filters all rows for these operations; an UPDATE/DELETE therefore returns zero affected rows rather than necessarily raising a privilege error.

Exact Production catalogue comparison confirms that only the authorized service_requests ACL/policy delta occurred. All 134 public/fixeo_private function definitions and security attributes/ACLs are identical. All captured triggers, constraints, other policies, other table ACLs and existing column ACLs are preserved. Default ACLs were compared solely to prove preservation; none was altered.

`a_vap_request_guard` and `trg_dispatch_v2_on_service_request` remain enabled and identical. Guest INSERT with status new still runs historical dispatch. The unchanged Enterprise RPC still inserts the service request, invokes its trigger, then creates ERC/SLA/audit context. This ordering remains a future Hybrid Dispatch constraint; S1-A does not redesign it.

`accept_my_dispatch_offer_v1(uuid)`, `get_my_dispatch_offers_v1()` and `create_enterprise_request(uuid,uuid,text,text,text)` retain their definitions and authenticated/service_role/postgres EXECUTE rights. PUBLIC/anon EXECUTE remains false.

P0 is preserved. S0 remains **5/5 functions, 52/52 privileges removed, 9/9 tables**. Service_role, postgres and authenticated table privileges are identical. Phase 2A and Phase 2B application files are unchanged and their local regression suites pass.

## Test matrix and evidence

| Test | Local PostgreSQL 17 / application test | Production evidence |
|---|---|---|
| A01 | Actual guest bridge: four keys, INSERT succeeds | Exact effective column ACL |
| A02 | Non-new guest status rejected | Canonical WITH CHECK |
| A03 | Guest client_profile_id rejected | Column ACL plus WITH CHECK |
| A04 | Financial column rejected | No anon financial column INSERT |
| A05 | Guest SELECT returns no rows | Enabled RLS; anon SELECT qual false |
| A06 | Guest UPDATE affects no rows | Enabled RLS; anon UPDATE qual false |
| A07 | Guest DELETE affects no rows | Enabled RLS; anon DELETE qual false |
| A08 | Personal authenticated INSERT succeeds | Existing policy/grants preserved |
| A09 | Enterprise request + ERC/SLA/audit succeeds | RPC definition/ACL, related schema preserved |
| A10 | Enterprise viewer reads but cannot assign | Old assignment policy absent |
| A11 | Linked artisan owner UPDATE succeeds | Owner-only linked mission policy |
| A12 | Same phone without ownership cannot UPDATE | No phone fallback in either expression |
| A13 | Canonical acceptance RPC succeeds | RPC definition/ACL preserved |
| A14 | Guest INSERT creates local dispatch queue entries | Both triggers and functions identical |
| A15 | P0 authority tests pass | P0 catalogue preserved |
| A16 | S0 invariants pass after S1-A | 5/5, 52/52, 9/9 plus preserved functions |
| A17 | DDL changes no synthetic business data | Applied SQL has no business DML; no Production test writes |

- S1-A suite: **21/21 PASS** (A01–A17, three guard/reproduction checks, enclosing test).
- P0 + Phase 2A + Phase 2B reference suites: **108/108 PASS**.
- Production catalogue evidence verifier: **19/19 PASS**.
- Local fixtures use in-memory PGlite 0.3.14 / PostgreSQL 17. No credentials, network or Production client are used by these tests.
- Production checks read catalogues only. No business RPC was invoked, no test request/mission was created, no WhatsApp/SMS was sent.
- `DB BUSINESS DATA CHANGED = NO` describes this operation; it does not assert that unrelated live traffic was paused.

Reproduce locally:

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefix tests/auth-security-p0
node --test tests/enterprise-security-s1a/security.test.cjs
node tests/enterprise-security-s1a/verify-production-evidence.cjs
```

The reference browser suites additionally use jsdom 26.1.0 through NODE_PATH. See `reference-tests.log` and `local-tests.log`. See `before-after-exact.md` for the exact changed grants and policy definitions.

## Scope and rollback

`ROLLBACK EXECUTED = NO`. `rollback-blocked.sql` was only inspected as text. Its unconditional exception prevents execution. A rollback would reopen broad guest INSERT, broad assignment and the phone fallback, and requires a new explicit authorization. Local fixture transaction cleanup does not execute this reference.

NOTIFICATIONS = DEFERRED TO S1-B. DEFAULT ACL = DEFERRED TO S1-C. B1 STARTED = NO. No missions RLS, financial fields, dispatch functions, pricing, payments, Auth, Enterprise RPC or application files were modified.

Repository publication uses the authorized message `fix(security): harden guest service request writes`. The final conversation report records the resulting commit and automatic Vercel Production deployment after publication.
