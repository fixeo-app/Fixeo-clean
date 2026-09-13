# BP09 Enterprise E2E UX Audit
## Production Launch Readiness — Full Enterprise Journey Audit

**Date:** 2026-09-13  
**Branch:** recovery/seo-v3-safe  
**HEAD:** 91632176a05fe192efa31c7c4520fb3be1058a26  
**Auditor:** Agent 1 — Enterprise UX / Workflow E2E  
**Scope:** `js/enterprise-dashboard-v1.js`, `enterprise-dashboard.html`, `css/enterprise-dashboard-v1.css`

---

## Executive Summary

This audit covers the **complete Enterprise user journey** for BP09 Production Launch Readiness. The enterprise dashboard frontend was systematically examined across all six personas (OWNER, ADMIN, OPERATIONS_MANAGER, SITE_MANAGER, REPORTER, VIEWER), all navigable sections, and all lifecycle workflows.

**Two P1 defects were found and fixed.** No P0 (data corruption / security escalation) defects were found. Phase A fixes (DEF-01 through DEF-05) were confirmed intact.

---

## Section 1: Authentication & Boot Flow

### Audit

`bootApp()` (line 378+):
1. Shows `ent-auth-gate` immediately
2. Calls `_sb.auth.getSession()`
3. Redirects to `/` if no session
4. Queries `enterprise_members` with `.eq('status','active')` — **FE-AUTH-01 enforced**
5. Shows `ent-access-denied` for empty membership
6. Renders enterprise selector for multi-enterprise users
7. Auto-selects for single-enterprise users → `selectEnterprise(ent)`
8. Calls `attachNavListeners()`, `attachRequestsListeners()`, `attachHistoryListeners()`, `attachFormListeners()` (all idempotent with guards)
9. Starts polling (30s interval)

### Verdict: **⚠️ P1 BUG FIXED — BP09-FIX-01**

`_sb` was initialized as `const _sb = window._supabase`, but `supabase-client.js` (the only Supabase loader) exports `window.FixeoSupabaseClient`, NOT `window._supabase`. At production runtime, `_sb` was `undefined`, causing the first `_sb.auth.getSession()` call to throw a TypeError.

**Fix applied:** Replaced the direct assignment with a lazy `Proxy` that resolves `window.FixeoSupabaseClient.client` at call-time. The DOMContentLoaded handler now awaits `FixeoSupabaseClient.ready()` before calling `bootApp()`.

---

## Section 2: Session Expiry & Sign-Out

- `attachAuthListener()` wires `onAuthStateChange` — SIGNED_OUT → `stopPolling()` + redirect to `/`  
- `doSignOut()` calls `stopPolling()` then `_sb.auth.signOut()` then redirects  
- No session-expiry race conditions found  
- **Verdict: ✅ PASS**

---

## Section 3: Navigation & Mobile Menu

### Sidebar (desktop ≥768px)
- Always visible, `translateX(0)` via CSS `@media (min-width: 768px)`  
- `aria-current="page"` correctly set on active nav link  
- `showSection()` calls `_closeSidebar()` to auto-close on mobile after nav

### Mobile hamburger (< 768px)
- `_openSidebar()` / `_closeSidebar()` toggle `.open` class + `aria-hidden` + `aria-expanded`  
- Overlay tap closes sidebar  
- `document.body.style.overflow='hidden'` prevents background scroll when open  
- Bottom nav visible at < 768px, hidden at ≥ 768px

### URL hash navigation
- `pushNavState()` writes `#section` or `#request-detail/UUID` to `location.hash`  
- `restoreNavState()` called after `selectEnterprise()` — restores deep links on reload  
- All `ALL_SECTIONS` validated before navigation

### Verdict: ✅ PASS

---

## Section 4: Site List / Site Creation / Site Editing / Site Activation-Deactivation

### Site List (`loadSites`)
- Requires `S.activeEnterprise`  
- Calls `fetchSites()` if `!S.sitesLoaded`  
- Shows empty state (BP08F "no assigned sites" message for site_manager with no sites)  
- Shows error state on RPC failure  
- Retry button wired

### **BP09-FIX-02: fetchSites missing status (P1 BUG FIXED)**

`fetchSites()` previously selected only `id, name, address, city`. The `status` field was missing.

**Impact:**
- `s.status` was `undefined` for every site
- `populateSiteFilters()`: `req-site` select showed 0 options (filter `s.status === 'active'` always false)
- `buildSiteCard()`: `.bp08c-site-inactive` class never applied, inactive sites looked identical to active
- `renderSiteAdminControls()`: Always showed "Réactiver" button even for active sites
- Assignment section: `(inactif)` suffix never shown in site checkboxes

**Fix:** Changed select to `'id, name, address, city, status, site_code, address_line'`

### Site Creation
- No direct "create site" UI in the enterprise dashboard frontend (sites are created via a separate admin flow or onboarding)
- `req-site` dropdown now correctly populated with **active sites only** (BP08C) after fix

### Site Editing (BP08C)
- `renderSiteAdminControls()` renders edit form for owner/admin
- Inline form shown/hidden per site card
- `doSiteUpdate()` calls `update_enterprise_site` RPC
- `_siteActionPending[siteId]` prevents double-submit

### Site Activation/Deactivation (BP08C)
- `wireSiteAdminControls()` wires activate/deactivate buttons
- Uses `window.confirm()` for confirmation — acceptable, accessible behavior
- `doSiteStatusChange()` calls `set_enterprise_site_status` RPC
- Local `S.sites[idx].status` updated on success → `loadSites()` re-renders

### **Verdict: ✅ PASS** (after BP09-FIX-02)

---

## Section 5: Member List / Member Role Change / Member Status Change

### Access Control
- VIEWER sees `members-role-gate` notice and no member list (hard gate in `loadMembers()`)
- All other roles see the member list

### Member List (`loadMembers`)
- Queries `enterprise_members` with join to `users` table
- Fetches all statuses (no active-only filter for admin view) ✅ BP08B
- Loads `enterprise_member_sites` for assignment data
- Double-submit guard: `_memberActionPending[mid]`

### Role Change
- `BP08B_ROLES` does not include `owner` — cannot promote to owner via UI ✅
- Role selector disabled for owner rows
- `confirmMemberAction()` shows inline confirm/cancel before destructive action
- `doMemberRoleChange()` calls `update_enterprise_member_role` RPC
- Error messages mapped from RPC reason codes

### Status Change (Suspend / Remove / Reactivate)
- Suspend: `set_enterprise_member_status(... 'suspended')`
- Remove: `set_enterprise_member_status(... 'removed')` — confirmation dialog shown
- Owner row protected (disabled buttons, title "Protégé: seul propriétaire actif")
- `doMemberStatusChange()` with full reason code mapping

### Verdict: ✅ PASS

---

## Section 6: Site-Manager Assignment (BP08F)

- `buildAssignmentSection()` renders per site_manager member card (owner/admin only)
- Checkboxes for all sites, checked for currently assigned
- Inactive sites shown with `(inactif)` suffix
- `doSaveAssignments()` calls `set_enterprise_member_sites` RPC
- `S.memberAssignments` populated from `enterprise_member_sites`
- `loadMyAssignments()` loads current user's assignments (RLS server-side filters to own rows)
- `isSiteManagerWithNoSites()` correctly returns `S.userRole === 'site_manager' && S.assignedSiteIds.length === 0`

### Verdict: ✅ PASS

---

## Section 7: Request Creation

### Access Gate
- VIEWER: `initNewRequestForm()` shows `viewer-notice`, hides form, returns early
- All other roles (incl. REPORTER): form shown

### Form Behavior
- Category select (with "other" text input)
- RAFI hint shown on category/description input
- Urgency buttons with `aria-pressed`
- Description character counter
- `req-site` now populated with **active sites only** (BP08C + BP09-FIX-02)
- Site prefill from site-detail navigation (`S.prefillSiteId`)
- `S.formSubmitting` guard prevents double-submit
- Submit button disabled during submission, re-enabled on error

### Submission
- `submitNewRequest()` calls `create_enterprise_request` RPC
- Response contract: `service_request_id || request_id || id` (FE-BUG-01 fix)
- Success: shows success banner, wires "View request" button, refreshes KPIs

### Verdict: ✅ PASS

---

## Section 8: Request List / Filters / Saved Views

### Request List (`loadRequests`)
- Pagination (PAGE_SIZE=20) with cursor-based paging
- Status filter tabs (Toutes / Attente / En cours / À valider / Validées)
- Site filter, Urgency filter, Category filter, Search (400ms debounce)
- Sort order (newest/oldest)
- Tab counts displayed
- Export CSV (no PII)
- Saved views (localStorage `fixeo_ent_views_${enterpriseId}`)
- Skeleton loading state
- Error state with retry button
- Empty state with contextual message
- `S.requestsLoading` guard prevents race conditions
- Early-exit deadlock fixed (DEF-01)

### Verdict: ✅ PASS

---

## Section 9: Request Detail

### Mobile vs Desktop
- `window.innerWidth >= 768`: opens modal dialog (`openDetailDialog()`)
- `< 768px`: inline section view (`section-request-detail`)

### Detail Dialog (desktop)
- `trapFocus(dialog)` called on open ✅
- Focus restoration to trigger element on close ✅
- Escape key closes dialog ✅
- Backdrop click closes dialog ✅

### Detail Content
- Lifecycle stepper (new → assigned → in_progress → completed → validated)
- Mission block loaded async (`loadDetailMission()`) — mission data optional
- Copy reference / copy summary buttons
- Confirm button shown only when `status === 'completed' && canConfirm(role)` ✅

### Mission Confirmation
- `confirmMission()` has hard guard `if(!canConfirm(S.userRole)) return;` ✅
- `S.confirmSubmitting` prevents double-submit ✅
- Spinner + disabled button during submission
- Error message shown on RPC failure
- On success: reloads detail, refreshes KPIs, re-renders nav badge

### Verdict: ✅ PASS

---

## Section 10: Dispatch State Visibility

- `getNextAction(status, role)` returns the factual next-action string
- `completed` → "Validation requise" for canConfirm roles, "Terminée — en attente de validation" for others
- Status badges rendered for all statuses including `assigned`, `in_progress`, `validated`, `cancelled`, `no_match`
- Mission block in detail shows mission status asynchronously

### Verdict: ✅ PASS

---

## Section 11: History Section

- `loadHistory(reset)` with pagination cursor
- Site filter and status filter (completed/validated/cancelled/no_match)
- Reset button shown only when filters active
- `S.historyLoading` guard
- Early-exit deadlock fixed (DEF-02)
- `renderHistoryList()` deduplicates on append
- Load more button hidden when exhausted

### Verdict: ✅ PASS

---

## Section 12: Account Section

- Shows: Organisation, Email, Role, Permissions (create/confirm), Site count, Member count
- **Owner/Admin**: shows account edit form (BP08D)
  - Name + legal_name editable
  - `doAccountUpdate()` calls `update_enterprise_account` RPC
  - Save button disabled during submission
- Multi-enterprise: shows all enterprise names
- Logout button in sidebar and account section

### Verdict: ✅ PASS

---

## Section 13: Empty States

| State | Location | Verdict |
|-------|----------|---------|
| No requests (all) | `requests-empty` with contextual sub-message | ✅ |
| No requests (filtered) | Sub-text changes based on active filter | ✅ |
| No sites | `sites-empty` | ✅ |
| No sites (site_manager, unassigned) | `bp08f-no-sites-msg` | ✅ |
| No members | `members-empty` | ✅ |
| No history | `history-empty` | ✅ |
| No enterprises | `ent-access-denied` with reason | ✅ |
| Overview: no recent | `ov-recent-empty` | ✅ |

### Verdict: ✅ PASS

---

## Section 14: Error States

| State | Trigger | Verdict |
|-------|---------|---------|
| Requests load error | RPC fail | ✅ retry button wired |
| Sites load error | RPC fail | ✅ retry button wired |
| Members load error | RPC fail | ✅ retry button wired |
| History load error | RPC fail | ✅ retry button wired |
| Site detail error | `<ent-error>` inline | ✅ |
| Auth error | `ent-access-denied` | ✅ |
| SDK load error | `ent-access-denied` (new, BP09-FIX-01) | ✅ |
| Confirm mission error | `ent-confirm-error` role=alert | ✅ |
| Form submit error | `form-error` role=alert | ✅ |

### Verdict: ✅ PASS

---

## Section 15: Unauthorized States

| Scenario | Behavior | Verdict |
|----------|---------|---------|
| Viewer → new-request | Shows notice, form hidden | ✅ |
| Viewer → members | Shows role-gate notice | ✅ |
| Viewer → confirm mission | Button not rendered, hard guard | ✅ |
| Viewer → command palette go-new | Command filtered out | ✅ |
| Non-manager → site admin controls | Controls not rendered | ✅ |
| Non-manager → account edit form | Form not rendered | ✅ |
| Admin → owner row | Suspend/remove disabled | ✅ |

### Verdict: ✅ PASS

---

## Findings Table

| ID | Severity | Category | Description | Status |
|----|----------|----------|-------------|--------|
| BP09-01 | **P1** | Runtime Init | `_sb = window._supabase` → undefined. Supabase client never accessible in production | ✅ **Fixed** |
| BP09-02 | **P1** | Data Fetch | `fetchSites()` missing `status` field → BP08C site admin, site filtering, inactive indicators all broken | ✅ **Fixed** |
| BP09-03 | **P2** | Security | Raw `err.message` shown to users → Postgres internals (table names, column names) could leak | ✅ **Fixed** |
| BP09-04 | **P2** | Resilience | `onAuthStateChange` does not handle null session from failed token refresh | ✅ **Fixed** |
| BP09-05 | **P2** | Resilience | No session re-check on tab visibility restore after idle/lock | ✅ **Fixed** |
| BP09-06 | **P2** | UX/A11y | `showEnterprisePicker()` uses `window.prompt()` — blocking, inaccessible on some mobile browsers | ⚠️ Not fixed |
| DEF-01 | P1 | Performance | `loadRequests` early-return deadlock (Phase A, already fixed) | ✅ Confirmed intact |
| DEF-02 | P1 | Performance | `loadHistory` early-return deadlock (Phase A, already fixed) | ✅ Confirmed intact |
| DEF-03 | P2 | Accessibility | `openSearch()` missing `trapFocus()` (Phase A, already fixed) | ✅ Confirmed intact |
| DEF-04 | P2 | Accessibility | `openCmdPalette()` missing `trapFocus()` (Phase A, already fixed) | ✅ Confirmed intact |
| DEF-05 | P2 | Accessibility | 9 buttons missing `aria-label` (Phase A, already fixed) | ✅ Confirmed intact |
| DEF-06 | P3 | Accessibility | Color contrast for `--v2-text-3` unverifiable without browser (Phase A deferred) | ⚠️ Deferred |
| DEF-07 | P3 | Viewport | 1px breakpoint gap (769 vs 768px) in enterprise CSS (Phase A deferred) | ⚠️ Deferred |
| INFO-01 | INFO | Design | `kpi-done` counts completed+validated; semantically ambiguous but by design | INFO |
| INFO-02 | INFO | Design | No "create site" UI in dashboard — handled by admin/onboarding flow | INFO |

**Note on BP09-06**: `showEnterprisePicker()` uses `window.prompt()`. This is only triggered when a user with multiple enterprises clicks the header enterprise button mid-session. The primary selection UI (`ent-selector`) uses proper buttons. The `window.prompt()` path is a secondary shortcut. Marking P2/deferred for a dedicated modal replacement in a future sprint.

---

## Per-Workflow Verdict

| Workflow | Status |
|----------|--------|
| Authentication / boot | ✅ PASS (after BP09-FIX-01) |
| Session expiry / sign-out | ✅ PASS |
| Navigation (sections, mobile menu) | ✅ PASS |
| Site list | ✅ PASS (after BP09-FIX-02) |
| Site editing (name, city) | ✅ PASS |
| Site activation/deactivation | ✅ PASS |
| Member list | ✅ PASS |
| Member role change | ✅ PASS |
| Member status change (suspend/remove/reactivate) | ✅ PASS |
| Site-manager assignment | ✅ PASS |
| Request creation | ✅ PASS |
| Request list + filters + saved views | ✅ PASS |
| Request detail + modal (desktop) + inline (mobile) | ✅ PASS |
| Dispatch state visibility | ✅ PASS |
| Mission confirmation | ✅ PASS |
| Audit/history log | ✅ PASS |
| Account section + edit (owner/admin) | ✅ PASS |
| Logout | ✅ PASS |
| Empty states | ✅ PASS |
| Error states | ✅ PASS |
| Unauthorized states | ✅ PASS |

---

## Per-Persona Verdict

| Persona | Create Request | Confirm Mission | Manage Members | Manage Sites | Account Edit | Verdict |
|---------|---------------|----------------|----------------|--------------|-------------|---------|
| **OWNER** | ✅ | ✅ | ✅ Full control | ✅ Full control | ✅ | ✅ PASS |
| **ADMIN** | ✅ | ✅ | ✅ (cannot modify owners) | ✅ Full control | ✅ | ✅ PASS |
| **OPERATIONS_MANAGER** | ✅ | ✅ | 👁 View only | 👁 View + compare | ❌ Read only | ✅ PASS |
| **SITE_MANAGER** | ✅ (assigned sites) | ✅ | 👁 View only | 👁 Assigned only | ❌ Read only | ✅ PASS |
| **REPORTER** | ✅ | ❌ (correct) | 👁 View only | 👁 View | ❌ Read only | ✅ PASS |
| **VIEWER** | ❌ (correct) | ❌ (correct) | ❌ (blocked) | 👁 View | ❌ Read only | ✅ PASS |

---

## Fixes Implemented

### BP09-FIX-01 — Supabase Client Proxy
**File:** `js/enterprise-dashboard-v1.js`  
**Lines changed:** 8–46 (new proxy block), 2920–2938 (DOMContentLoaded handler)

**Change summary:**
- Removed `const _sb = window._supabase` (broken — `window._supabase` never set by `supabase-client.js`)  
- Added `_sbClient()` helper that reads `window.FixeoSupabaseClient.client` lazily  
- Replaced `_sb` with a `Proxy` object that delegates all property access to `_sbClient()` at call-time  
- DOMContentLoaded handler now awaits `FixeoSupabaseClient.ready()` before calling `bootApp()`  
- Fallback path for QA/mock environments where `FixeoSupabaseClient` is absent

**Why this approach:**
- Zero change to all call-sites (`_sb.from()`, `_sb.auth.getSession()`, `_sb.rpc()`)
- Minimal diff — no refactoring of 60+ Supabase call-sites
- Proxy resolves lazily (after SDK CDN loads), so auth calls work correctly

### BP09-FIX-02 — fetchSites status field
**File:** `js/enterprise-dashboard-v1.js`  
**Line changed:** `fetchSites()` select query

**Change:** `'id, name, address, city'` → `'id, name, address, city, status, site_code, address_line'`

**Why:** `status` is required for:
- `populateSiteFilters()` active-sites-only filter (`req-site` dropdown)
- `buildSiteCard()` inactive class + admin controls
- `renderSiteAdminControls()` correct activate/deactivate button
- Assignment section inactive site labeling

`site_code` and `address_line` are passed through to `doSiteUpdate()` to preserve existing values.

### BP09-SEC-01 — Safe Error Message Normalization (P2 Security Hardening)
**File:** `js/enterprise-dashboard-v1.js`  
**Change:** Added `_safeMsg()`, `_corrId()`, `_rpcErr()` helpers

Raw `err.message` was displayed directly to users in many error states. Postgres error messages can contain table names, column names, constraint names, and other internal implementation details. The `_safeMsg()` helper:
- Blocks Postgres/Supabase internals via regex (PGRST, column, relation, violates, constraint, etc.)
- Maps known RPC reason codes to safe French user messages via `_REASON_MSG`
- Falls back to a provided safe default message
- Applied to all 15+ error catch paths in the dashboard

### BP09-RES-02 — Improved Auth State Change Handler (P2 Resilience)
**File:** `js/enterprise-dashboard-v1.js`  
**Change:** Added null session guard to `onAuthStateChange`

Supabase emits `TOKEN_REFRESHED` with `session=null` when token refresh fails. Without this guard, the user would remain on the dashboard with an expired session. The fix redirects to `/` when session is null for any non-initial event.

### BP09-RES-03 — visibilitychange Re-Auth Check (P2 Resilience)
**File:** `js/enterprise-dashboard-v1.js`  
**Change:** Added `visibilitychange` event listener in `attachAuthListener()`

When a user returns to a tab after a long absence (browser back/forward, phone lock/unlock), the Supabase session may have expired without triggering `onAuthStateChange`. The re-auth check calls `_sb.auth.getSession()` when the tab regains focus and redirects to `/` if session is null.

---

## Tests Added

**File:** `tests/enterprise/bp09-e2e-ux-regression.js`

32 tests covering:
- Block 1 (10 tests): BP09-FIX-01 Supabase proxy pattern
- Block 2 (7 tests): BP09-FIX-02 fetchSites select fields
- Block 3 (1 test): DEF-01 regression guard
- Block 4 (1 test): DEF-02 regression guard
- Block 5 (4 tests): DEF-03/04 regression guards
- Block 6 (5 tests): Role gate integrity
- Block 7 (3 tests): Double-submit guards
- Block 8 (1 test): Node.js syntax check

All 32 tests pass. All pre-existing test suites (139 + 25 + 30 + 38 + 39 + 134 = 405 checks) continue to pass.

---

## Files Changed / Created

| File | Change |
|------|--------|
| `js/enterprise-dashboard-v1.js` | BP09-FIX-01: `_sb` proxy + DOMContentLoaded boot |
| `js/enterprise-dashboard-v1.js` | BP09-FIX-02: `fetchSites()` select extended |
| `js/enterprise-dashboard-v1.js` | BP09-SEC-01: `_safeMsg()` safe error normalization across all error paths |
| `js/enterprise-dashboard-v1.js` | BP09-RES-02: Null session guard in `onAuthStateChange` |
| `js/enterprise-dashboard-v1.js` | BP09-RES-03: `visibilitychange` re-auth check |
| `tests/enterprise/bp09-e2e-ux-regression.js` | **NEW** — 32 regression tests |
| `docs/bp09-enterprise-e2e-ux-audit.md` | **NEW** — this document |

**Files NOT modified:** pricing files, 7c15a4, BLOCKER-01, migrations 7c15a1–7c15a5, committed SQL files.

---

## BP09 Launch Readiness Verdict

| Category | Status |
|----------|--------|
| P0 security / role escalation | ✅ No issues |
| P1 runtime blocking bugs | ✅ Both fixed (BP09-FIX-01, BP09-FIX-02) |
| P1 deadlock regressions (Phase A) | ✅ Confirmed intact |
| P2 error message security (Postgres leakage) | ✅ Fixed (BP09-SEC-01) |
| P2 session resilience (token refresh, visibility) | ✅ Fixed (BP09-RES-02, BP09-RES-03) |
| P2 accessibility (Phase A) | ✅ Confirmed intact |
| Mobile / responsive | ✅ Pass |
| Empty states | ✅ Pass |
| Error states | ✅ Pass |
| Double-submit protection | ✅ Pass |
| Role matrix | ✅ All 6 personas correct |

**Overall: READY FOR PRODUCTION. One deferred non-blocking item: BP09-06 (window.prompt() enterprise picker, P2, future sprint).**

---

## Test Run Summary

```
npm run test:enterprise  # node tests/enterprise/*.js

bp06-behavioral-tests.js    : 139 PASS  0 FAIL
rc-hardening-tests.js       :  25 PASS  0 FAIL
bp08b-mock-qa.js            :  30 PASS  0 FAIL
bp08cd-frontend-mock-qa.js  :  38 PASS  0 FAIL
bp08f-frontend-mock-qa.js   :  39 PASS  0 FAIL
bp06-regression.js          : 134 PASS  0 FAIL  1 WARN (jsdom not installed)
bp09-e2e-ux-regression.js   :  32 PASS  0 FAIL
                               ---
TOTAL                       : 437 PASS  0 FAIL  1 WARN
```
