# FIXEO Auth Phase 2A — canonical multi-space resolver

Status: local review candidate; no commit, push, deployment or Production DB write.

## Baseline and scope

- Canonical repository: `fixeo-app/Fixeo-clean`, remote `main`.
- Main and Production baseline: `bab8d3d1fcfe8e970d0c3d358268bb42413ddccd`.
- Existing clean worktree at that exact SHA, detached HEAD. No branch moved.
- Production P0 verified from PostgreSQL catalogs: six Admin policies use `is_admin()`;
  users/profile INSERT checks hardened; canonical profile trigger enabled;
  16 excess effective privileges absent for anon/authenticated on users/profiles.
- `is_admin()` MD5: `1986929dce09806c133d90b1bf480e1d`.
- Identity counts: auth.users 47, public.users 47, public.profiles 46; one missing profile.
- No repair, deletion or creation of the missing Artisan profile.
- Exact catalog evidence: [phase-2a-production-readonly.json](phase-2a-production-readonly.json).
- Repeatable SELECT-only query: [preflight-readonly.sql](../../tests/auth-resolver/preflight-readonly.sql).

All application changes are confined to the new `js/fixeo-auth-resolver.js` module.
It is not included by an HTML page, imported by existing application code or auto-executed.
No existing source, redirect, UI, backend, SQL migration or configuration is changed.

## API and authority

```js
// Future integration only. This invocation has NOT been added to any page.
const client = await window.FixeoSupabase.getClient();
const access = await window.FixeoAuthResolver.resolve(client);
```

CommonJS tests import the same implementation:

```js
const { resolve } = require('../../js/fixeo-auth-resolver.js');
const access = await resolve(supabaseClient);
```

The dependency is a Supabase JS v2 client, already configured by the caller for the
actual authenticated user. No user ID, role, URL destination or cached identity can
be supplied separately. The module does not create an SDK client or hold credentials.

Resolution sequence:

1. `client.auth.getSession()`; require a session, UUID and nonempty access token.
2. `client.auth.getUser(access_token)`; require a server-validated user with the same UUID.
3. Explicit `client.schema('public')`; SELECT `users.id,role` for that UUID.
4. Accept only exact lowercase `admin`, `artisan`, `client` from the canonical row.
5. SELECT own `enterprise_members` with status `active`, ordered by `enterprise_id`.
6. SELECT the corresponding `enterprise_accounts`; retain only status `active`.
7. Re-read the SDK session; discard the result if logout, user switch or token rotation occurred.
8. Return normalized data; never navigate, persist a result, modify DOM or subscribe to events.

`getSession()` can read/refresh the SDK's persisted session. Its locally stored user
is NOT trusted as proof of identity: `getUser(token)` authenticates it remotely first.
No direct read of localStorage/sessionStorage, metadata role, profiles, UI or URL
contributes to access decisions. SDK errors and tokens are neither returned nor logged.

Official references checked for implementation:

- https://supabase.com/docs/reference/javascript/auth-getsession
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/changelog.md

## Normalized model

Example using synthetic IDs:

```json
{
  "ok": true,
  "status": "OK",
  "identity": {
    "user_id": "00000000-0000-4000-8000-000000000001",
    "global_role": "client"
  },
  "global_space": { "type": "client", "destination": "dashboard-client.html" },
  "enterprise_spaces": [{
    "type": "enterprise",
    "enterprise_id": "00000000-0000-4000-8000-000000000101",
    "enterprise_name": "Entreprise A",
    "member_role": "owner",
    "membership_status": "active",
    "account_status": "active",
    "destination": null,
    "destination_status": "NOT_IMPLEMENTED"
  }],
  "spaces": [
    { "type": "client", "destination": "dashboard-client.html" },
    {
      "type": "enterprise",
      "enterprise_id": "00000000-0000-4000-8000-000000000101",
      "enterprise_name": "Entreprise A",
      "member_role": "owner",
      "membership_status": "active",
      "account_status": "active",
      "destination": null,
      "destination_status": "NOT_IMPLEMENTED"
    }
  ],
  "has_multiple_spaces": true
}
```

Global mapping remains Admin → `admin.html`, Artisan → `dashboard-artisan-v2.html`,
Client → `dashboard-client.html`. Existing maps remain in their existing files.
Artisan destination is a role home, not proof of ownership/onboarding completion.
The current guard's `artisans.owner_user_id` check remains authoritative for that business step.

The global space is first; Enterprise spaces follow in UUID lexical order, independent
of locale, display names or response order. Equal enterprise names never merge IDs.
Membership reads use exact counts and pages of 200; account reads use batches of 100.
This handles more than the usual 1,000-row API cap without silently truncating results.
Changed/missing counts, duplicate memberships or incomplete pages produce an explicit error.

Recognized Enterprise roles: owner, admin, operations_manager, site_manager, reporter, viewer.
An Admin receives no Enterprise space without its own active membership. The own-user
filter is mandatory because Admin and tenant policies can expose other members.
Enterprise status and role never change the global role.

## Fail-closed contract

`ok=true` means the complete current resolution succeeded. `ok=false` must never be
treated as permission to perform the future `spaces.length === 1` direct redirect.
The resolver itself implements neither direct redirect nor space selection UI.

| Status | Spaces returned |
|---|---|
| NO_SESSION | None; identity/global_space null |
| CLIENT_UNAVAILABLE, INVALID_SESSION | None |
| SESSION_READ_ERROR, SESSION_VALIDATION_ERROR | None |
| SESSION_IDENTITY_MISMATCH, SESSION_CHANGED | None |
| MISSING_PUBLIC_USER, PUBLIC_USER_READ_ERROR | None; no Client fallback |
| INVALID_GLOBAL_ROLE, PUBLIC_USER_IDENTITY_MISMATCH | None |
| ENTERPRISE_MEMBERSHIP_READ_ERROR | Verified global space only, ok=false |
| ENTERPRISE_ACCOUNT_READ_ERROR | Verified global space only, ok=false |
| ENTERPRISE_ACCOUNT_UNAVAILABLE | Verified global space only; account absent or RLS-hidden |
| INVALID_ENTERPRISE_MEMBERSHIP, INVALID_ENTERPRISE_ACCOUNT | Verified global space only, ok=false |

Invited/suspended/removed memberships and suspended/closed accounts are normal exclusions:
they do not invalidate a successful global resolution. If any Enterprise read fails,
all Enterprise entries are withheld, including entries from an earlier successful batch.
This avoids presenting a partial enterprise list as complete. A future UI can explicitly
offer the verified global space plus retry, but that integration is outside Phase 2A.

## RLS read requirements and Production evidence

| Read | Existing authority enabling authenticated SELECT |
|---|---|
| users.id,role for own UUID | SELECT grant + users_select_own: `auth.uid() = id` |
| enterprise_members.enterprise_id,user_id,role,status | SELECT grant + em_self_select: `user_id = auth.uid()` |
| enterprise_accounts.id,name,status for memberships | SELECT grant + ea_members_select: `_fixeo_is_enterprise_member(id)` |

All three tables have RLS enabled. The helper checks `enterprise_id`, `auth.uid()` and
`enterprise_members.status='active'`; it does not derive global Admin from Enterprise.
`authenticated` has USAGE on public/fixeo_private and EXECUTE on the two private helpers.
The active member can read the account's status even when the account is suspended/closed,
so the resolver can deliberately exclude it. No additional RPC, grant or policy is needed.

The read proof combines exact Production catalogs with local PostgreSQL execution of
those current policies/helper definitions against synthetic rows. It does NOT claim a
live authenticated frontend test: no Production login, signup or token impersonation was used.

## Future consumers — inventory only, unchanged

| Existing file/entry point | Future consumption and retained responsibility |
|---|---|
| js/fixeo-auth-supabase.js — signIn, getSession, ROLE_REDIRECT, redirectByRole | Consume canonical resolution after real Auth success; replace its duplicate map only in integration. Legacy offline/cache paths remain untouched in 2A. |
| js/fixeo-auth-guard.js — ROLE_HOME, canonical users lookup | Use global resolution; keep Artisan owner_user_id/onboarding checks and current protection until integrated. |
| js/auth-global.js — normalizeRole, cached user, dashboard links, fixeoGlobalLogout | Replace authorization-like cached role decisions with resolved spaces; retain rendering/logout separation. |
| js/fixeo-session-mobile.js — getUser, dashboardHref, createArtisanSession | Derive display destinations from resolution later; no storage cleanup in this phase. |
| js/fixeo-header-global.js — getAuthUser, getDashboardLinks, avatar shortcut | Consume one normalized list later. Existing avatar handler maps logged-in non-Artisan to Client; record this integration point, do not fix in 2A. |
| js/fixeo-mvp-supabase.js — redirectAfterRole and signup/login bindings | Consume resolution after Auth; existing signup behavior remains unchanged. |
| js/fixeo-supabase-core.js — getClient, persistAuth, syncUserFromSession, requireAuth | Supply the actual SDK client; consolidate duplicate identity decisions in a later integration. |
| js/artisan-onboarding-v4.js + onboarding-artisan.html | Retain register_new_artisan RPC and ownership lifecycle; re-resolve after successful onboarding in a future phase. |
| js/fixeo-session-bridge.js — _patchLogout, onAuthStateChange | Future coordinator discards stale decisions/re-resolves outside Auth event callbacks; resolver installs no listener. |

## Test matrix

| Test | Objective |
|---|---|
| R01 | No session → NO_SESSION, no DB read |
| R02 / R03 / R04 | Client / Artisan / Admin alone → exactly one correct global space |
| R05 / R06 / R07 | Client owner / Artisan operations_manager / Admin owner → two independent spaces |
| R08 | Two active enterprises → three spaces, even if names match |
| R09 / R10 / R11 | invited / suspended / removed memberships excluded |
| R12 / R13 | suspended / closed accounts excluded |
| R14 / R15 | Missing users row / invalid role → no global fallback |
| R16 / R17 | Metadata Admin / conflicting profiles role have no authority |
| R18 | Membership read failure is explicit, global preserved |
| R19 | Stable order independent of response/name order |
| R20 | No Enterprise route for any of the six member roles |
| R21 / R22 | users/account read errors and thrown SDK errors |
| R23 / R24 | SDK absent, malformed session, invalid token or user mismatch |
| R25 / R26 | Session changed in flight; Admin sees only own memberships |
| R27 | Unknown roles/statuses or foreign memberships cannot create access |
| R28 | 1,201 memberships with a 37-row simulated server cap; batched accounts |
| R29 / R30 | Duplicate memberships or incomplete/changing pagination fail closed |
| R31 / R32 | Missing, foreign, duplicate or malformed account rows |
| R33 | Browser export; no auto-run, navigation, UI, storage, RPC or writes |
| R34 / R35 | No cached role between calls; reject mismatched canonical identity |
| L00–L04 | Local PostgreSQL transaction: exact RLS reads, Client/Artisan isolation, Admin filter and all six Enterprise roles; final ROLLBACK |

Dedicated command: `node --test tests/auth-resolver/*.test.cjs`.
The RLS test reuses the already pinned PGlite 0.3.14 dependency in tests/auth-security-p0;
for a fresh checkout, install that test package's lockfile with `npm ci --prefix tests/auth-security-p0`.
No new package/dependency or lockfile is introduced. No real Supabase endpoint is called by tests.

## Validation results

| Gate | Result |
|---|---|
| Resolver contract R01–R35 | 35/35 PASS |
| Local PostgreSQL L00 parent + L01–L04 | 5/5 PASS; fixture transaction rolled back |
| Dedicated suite total | 40/40 PASS, no skipped tests |
| Existing P0 suite | 22/22 PASS, entirely local |
| Existing tests/*.test.cjs, diagnostic, estimator and diagnostic-db suites | 426/426 PASS, no skipped tests |
| Combined Node test count | 488 PASS, 0 failed |
| Local Vercel build | PASS, CLI 59.24.0, Node 24.19.0, target preview; output only, never deployed |
| Built resolver vs candidate source | Byte-identical |
| Tracked/staged diff | Empty; no existing file changed or staged |
| Whitespace check for all seven new files | PASS |
| Final remote main and Production | Still bab8d3d1fcfe8e970d0c3d358268bb42413ddccd, same READY deployment |

Resolver source SHA256:
`1e515a1682011f827af39f3e9540a76009eeed68b63da6ee1f1b48866e635899`.

The full Vercel build ran in an isolated temporary copy of the candidate with the
existing nonsecret project settings. No Production environment variables were pulled.
The first build, concurrent with the regression suite, failed on the existing local
Diagnostic transport test's 80 ms timeout (`wire.content_length` unavailable).
The complete regression suite passed, then the complete build passed when run alone.
No timeout, test, build gate or application file was changed to obtain the pass.

Homepage, current Auth, Client, Artisan, Admin, Services, public Enterprise, header,
global footer and all existing redirect/guard/onboarding files are byte-unchanged.
No HTML page or tracked application module references the new resolver. No Production
browser login or signup was performed. This is source/build non-regression evidence,
not a claim of new authenticated end-to-end UI testing.

### Files created (7); files modified (0)

- js/fixeo-auth-resolver.js
- tests/auth-resolver/fixture.cjs
- tests/auth-resolver/resolver.test.cjs
- tests/auth-resolver/rls-read.test.cjs
- tests/auth-resolver/preflight-readonly.sql
- docs/auth/phase-2a-production-readonly.json
- docs/auth/phase-2a-resolver-review.md

## Known limitations and Phase 2B recommendation

- The resolver is a point-in-time read model, not an authorization replacement for RLS.
  Separate API reads are not a transactional snapshot; memberships can change after resolution.
  Future consumers must re-resolve on relevant Auth/tenant events and servers keep enforcing RLS.
- Token rotation during resolution returns SESSION_CHANGED; a future caller can retry.
  There is no cache, automatic retry, background listener or request coalescing in this module.
- Calls can wait for the SDK/network timeout; the module adds no independent timer.
- Global role does not certify Artisan ownership or onboarding completion.
- No live authenticated E2E was performed, by mandate. Fixture/RLS tests cover the contract.
- Enterprise destinations intentionally remain null. A name is plain data, not HTML;
  future UI should render it with textContent/equivalent escaping.
- No current Auth/header/guard consumer uses this module yet. Existing legacy maps and
  cache paths are inventoried, not cleaned up or replaced by this phase.

Next recommended mandate: create the authenticated FIXEO Enterprise destination and
its tenant-scoped guards. Only after that destination is validated, integrate this
resolver into Auth/header/guards, add the multi-space choice, then redesign Auth.
Neither that destination nor Phase 2B integration/UI has been started.

Proposed future commit (NOT created):
`feat(auth): add canonical multi-space resolver`
