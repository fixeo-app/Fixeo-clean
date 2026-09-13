# BP09 Enterprise Observability Contract

**Branch:** `recovery/seo-v3-safe`  
**HEAD at audit:** `91632176a05fe192efa31c7c4520fb3be1058a26`  
**Author:** Agent 3 — Resilience / Observability / Operations  
**Date:** 2026-09-13  
**Status:** LOCAL ONLY — no production access, no deploy, no push

---

## 1. Scope

This document covers the resilience, error-handling, and observability posture of  
`js/enterprise-dashboard-v1.js` (3 400+ lines, BP05–BP08F feature set) for  
**BP09 Production Launch Readiness**.

---

## 2. Event Catalogue

All events are **browser-side** (no structured backend logging in scope for this file).  
Severities: `CRITICAL` > `ERROR` > `WARN` > `INFO`.

| Event | Trigger | Severity | Safe Metadata | Forbidden Metadata |
|-------|---------|----------|---------------|--------------------|
| `boot.session_error` | `getSession()` throws at boot | CRITICAL | normalised message, timestamp | raw Postgres message, JWT |
| `boot.no_active_membership` | active membership rows = 0 | CRITICAL | enterprise count = 0 | user_id, email |
| `boot.supabase_unavailable` | Proxy stub fires (client not ready) | CRITICAL | prop name that was missing | JWT, session token |
| `auth.signed_out` | `SIGNED_OUT` event | WARN | event name | user_id |
| `auth.session_null_on_refresh` | `onAuthStateChange` returns null session | ERROR | event name | user_id, token |
| `auth.session_expired_tab_focus` | `visibilitychange` finds no session | ERROR | tab visibility event | user_id |
| `requests.load_error` | `loadRequests()` catch | ERROR | normalised message | raw SQL, request_id |
| `requests.empty` | zero rows for current filter | INFO | filter state (no PII) | — |
| `requests.rpc_business_error` | `create_enterprise_request` returns `{ok:false}` | WARN | reason code | user_id, site_id, description |
| `confirm.rpc_error` | `confirmMission` catch | ERROR | normalised message, reason code | request_id, user_id |
| `confirm.rpc_business_error` | `confirm_completed_mission` returns `{ok:false}` | WARN | reason code | request_id |
| `confirm.already_validated` | RPC returns `{ok:true, already_validated:true}` | INFO | — | — |
| `sites.load_error` | `loadSites()` catch | ERROR | normalised message | enterprise_id |
| `sites.inactive_during_submit` | `site_inactive` reason code | WARN | reason code | site_id |
| `members.load_error` | `loadMembers()` catch | ERROR | normalised message | user_id |
| `history.load_error` | `loadHistory()` catch | ERROR | normalised message | — |
| `polling.skip_concurrent` | `isPolling` guard fires | INFO | — | — |
| `site_mgr.no_sites_assigned` | `isSiteManagerWithNoSites()` = true | WARN | role | user_id |
| `assignment.stale_site_id` | `site_not_assigned` reason from RPC | WARN | reason code | user_id, site_id |

---

## 3. Safe Metadata for Each Event

### Correlation Identifiers Available
| Identifier | Where | Notes |
|-----------|-------|-------|
| `_corrId()` | Client-generated ephemeral ID (available via new helper) | 8-char base-36 alphanumeric, no PII |
| `r.id.slice(0,8)` | Truncated request reference displayed to user | Safe — 8 chars of UUID prefix |
| `S.activeSection` | Current navigation section | Safe |
| `S.reqStatusFilter` | Active filter | Safe |
| `reason` (from `_rpcErr`) | RPC reason code string | Safe |
| `event` (from onAuthStateChange) | Supabase auth event name | Safe |

### Forbidden Sensitive Metadata (Never Log)
- `S.userId` — user UUID
- `S.userEmail` — user email address
- `S.activeEnterprise.id` — enterprise UUID
- Full `requestId` — UUIDs in full
- Raw JWT / Bearer tokens
- Raw Supabase `err.message` containing `PGRST`, `column`, `relation`, `violates`, `constraint`, `syntax`
- Full `err.details` or `err.hint` (Postgres error internals)

---

## 4. Error Normalization Contract

The `_safeMsg(err, fallback)` helper is the single normalization point. Contract:

```
_safeMsg(err, fallback) → safe_user_string

Rules:
1. null/undefined err  → fallback
2. err._reason in _REASON_MSG  → _REASON_MSG[err._reason]  (pre-translated)
3. msg matches /PGRST|column|relation|violates|constraint|syntax|unexpected/i → fallback
4. msg.length > 200  → fallback
5. otherwise → msg (already human-readable)
```

### Reason Code Map (`_REASON_MSG`)
All 20 reason codes emitted by backend RPCs have user-facing French translations.

| Reason Code | User Message |
|-------------|-------------|
| `unauthenticated` | Session expirée. Veuillez vous reconnecter. |
| `user_not_found` | Utilisateur introuvable. |
| `enterprise_required` | Compte entreprise requis. |
| `enterprise_not_found` | Compte entreprise introuvable. |
| `forbidden` | Accès refusé. |
| `site_not_assigned` | Ce site ne vous est pas assigné. |
| `site_not_found` | Site introuvable. |
| `site_enterprise_mismatch` | Le site n'appartient pas à ce compte. |
| `site_inactive` | Ce site est inactif. |
| `site_required` | Veuillez sélectionner un site. |
| `service_category_required` | Veuillez sélectionner une catégorie. |
| `description_required` | La description est requise. |
| `urgency_invalid` | Niveau d'urgence invalide. |
| `request_not_found_or_not_owned` | Demande introuvable ou accès refusé. |
| `request_not_completed` | Cette demande n'est pas encore terminée. |
| `completed_mission_not_found` | Mission terminée introuvable. |
| `mission_not_found` | Mission introuvable. |
| `atomicity_error` | Erreur de synchronisation, veuillez réessayer. |
| `internal_error` | Erreur interne. Veuillez réessayer. |
| `no_change` | Aucun changement. |

---

## 5. Scenario Assessment (a–o)

| # | Scenario | Pre-BP09 State | Post-BP09 State | Risk |
|---|---------|---------------|----------------|------|
| a | Network timeout / Supabase unavailable at boot | ✅ Handled — `getSession()` in try/catch, shows gate. Error message was raw `err.message` | ✅ **Improved** — now uses `_safeMsg`, strips internals | LOW |
| b | RPC returns `{ok:false}` during `create_enterprise_request` | ✅ Handled — checked `data.ok===false` | ✅ Unchanged + now uses `_safeMsg` in catch | LOW |
| c | RPC returns `{ok:false}` during `confirm_completed_mission` | ❌ **P0 GAP** — `data` not destructured from RPC call; `{ok:false}` response silently discarded as success | ✅ **Fixed (BP09-RES-01)** — RPC now destructs `data`, checks `data.ok===false`, uses `_rpcErr` | FIXED |
| d | Empty enterprise (no sites, no members, no requests) | ✅ Handled — empty-state guards throughout | ✅ Unchanged | LOW |
| e | No active membership | ✅ Handled — `FE-AUTH-01` `.eq('status','active')` filter | ✅ Unchanged | LOW |
| f | Site becomes inactive while request dialog open | ✅ Partially handled — req-site filters to active sites at form init; `site_inactive` reason from RPC | ✅ Improved — reason code now maps to user message | LOW |
| g | Site-manager assignment removed (stale `assignedSiteIds`) | ✅ Partially handled — refreshed on section load; RPC returns `site_not_assigned` | ✅ Improved — reason code maps to user message | LOW |
| h | Session expires while interacting | ⚠️ **P1 GAP** — only `SIGNED_OUT` handled; null session from failed refresh not caught; no tab-focus re-check | ✅ **Fixed (BP09-RES-02, BP09-RES-03)** — `session===null` guard + `visibilitychange` re-check | FIXED |
| i | User double-clicks submit (request creation) | ✅ Handled — `S.formSubmitting` guard + button disable | ✅ Unchanged | LOW |
| j | User double-clicks confirm (mission validation) | ✅ Handled — `S.confirmSubmitting` guard + button disable | ✅ Improved (see scenario c) | LOW |
| k | RPC returns null/unexpected shape | ✅ Handled — `data||[]` guards throughout; `newId` extraction null-safe | ✅ Unchanged | LOW |
| l | Malformed backend response (missing expected fields) | ✅ Partially handled — `getSiteName` / `formatStatus` have fallbacks; urgency normalization for `normal`→`normale` | ✅ Unchanged | LOW |
| m | Request receives zero dispatch candidates (`dispatch_pending` / `new` state) | ✅ Handled — `new` status mapped to waiting message; `no_match` has RAFI narration | ✅ Unchanged | LOW |
| n | Mission already validated (double confirm) | ✅ `confirmSubmitting` guard + RPC returns `{ok:true, already_validated:true}` (success path) | ✅ Improved by c fix | LOW |
| o | Stale page state after browser back/forward | ⚠️ **P1 GAP** — `replaceState` only (no `pushState`); no `popstate` listener; no visibility re-check | ✅ **Partially fixed** — `visibilitychange` now re-checks session; full `popstate` routing is a remaining P2 | PARTIAL |

---

## 6. Findings Table

| ID | Severity | Description | File + Line | Fix Applied | Test |
|----|---------|-------------|-------------|-------------|------|
| BP09-P0-01 | **P0** | `confirmMission` did not check `data.ok===false` from `confirm_completed_mission` RPC — business-logic errors (e.g., `request_not_completed`, `already_validated` repair path errors) were silently swallowed and the UI reported success | `js/enterprise-dashboard-v1.js:1708` (pre-fix) | ✅ RPC call now destructs `data`; `data.ok===false` check added; `_rpcErr()` used to produce normalized Error | `BP09-SCN-05`, `BP09-SCN-06` |
| BP09-P1-01 | **P1** | `onAuthStateChange` only handled `SIGNED_OUT`. A failed token refresh (Supabase emits null session) did not trigger redirect — user could continue interacting with stale auth | `js/enterprise-dashboard-v1.js:973` (pre-fix) | ✅ Added `session===null && event!=='INITIAL_SESSION'` redirect | `BP09-SCN-15` |
| BP09-P1-02 | **P1** | No `visibilitychange` handler — user returning from idle/background tab (or browser back/forward) could have a session expired with no detection until next poll (30s) or RLS error | `js/enterprise-dashboard-v1.js` — missing | ✅ Added `visibilitychange` listener calling `getSession()`; redirects on null | `BP09-SCN-16`, `BP09-SCN-31` |
| BP09-P2-01 | **P2** | Raw `err.message` from Supabase/Postgres shown directly to users at all catch sites — could expose internal field names, RLS policy names, or Postgres error codes | Multiple catch blocks | ✅ All catch sites now use `_safeMsg(err, fallback)` | `BP09-LOG-03` |
| BP09-P2-02 | **P2** | `console.warn` at 3 sites logged raw `err.message` — could expose DB error details in browser devtools | `js/enterprise-dashboard-v1.js:453, 949, 991` | ✅ Replaced with `_safeMsg(err,'load error')` | `BP09-LOG-02` |
| BP09-P2-03 | **P2** | No reason code → user message mapping; RPC reason codes like `site_inactive`, `site_not_assigned` could surface as raw strings if `data.reason` was ever passed through | Multiple places | ✅ `_REASON_MSG` map added with 20 reason codes; `_rpcErr()` uses map | `BP09-OBS-02`, `BP09-SCN-12`, `BP09-SCN-14` |
| BP09-P3-01 | **P3** | No correlation ID in error messages — operational debugging requires correlating frontend error with backend RLS/RPC failure | Missing | ✅ `_corrId()` helper added (client-side ephemeral ID); not yet wired to error messages — P3 for future sprint | `BP09-OBS-05` |
| BP09-P3-02 | **P3** | No `popstate` listener — browser Back/Forward navigation does not re-execute `navigateTo`; only `visibilitychange` re-checks session | Missing | ⚠️ Partial — `visibilitychange` covers the expiry case; full hash-based routing already exists via `restoreNavState`; `popstate` wiring deferred to future sprint | `BP09-SCN-33` |
| BP09-P3-03 | **P3** | `loadMyAssignments` silently sets `S.assignedSiteIds=[]` on error — a network blip causes site_manager to appear unassigned | `js/enterprise-dashboard-v1.js:991` | ✅ Error now uses `_safeMsg` (logging hardened); assignment fallback behaviour is intentional for safety | `BP09-SCN-13` |

---

## 7. Current State Assessment

### What Works Well (Pre-BP09 Strengths)
- **Double-submit guards** everywhere: `S.formSubmitting`, `S.confirmSubmitting`, `S.requestsLoading`, `S.historyLoading`, `S.isPolling`
- **Button disabling** on all async operations (submit + confirm buttons)
- **`finally` blocks** ensure loading flags always clear even on exception
- **Role gating** at every entry point (`canCreate`, `canConfirm`)
- **`FE-AUTH-01`** active membership filter at boot
- **Retry buttons** on all list sections (requests, sites, members, history)
- **Skeleton loaders** on section transitions
- **`safeHtml()`** used on all user-controlled content rendered to innerHTML
- **Error element state** correctly hidden before new fetches, shown on failure
- **Signed-out redirect** on `SIGNED_OUT` event
- **No hardcoded Supabase URLs** in JS

### Remaining Gaps (P3 / Future Sprint)
| Gap | Recommendation |
|-----|---------------|
| No `popstate` listener for history API navigation | Wire `window.addEventListener('popstate', restoreNavState)` in `DOMContentLoaded` |
| No correlation IDs in error toasts/display | Wire `_corrId()` into error display for operational triage |
| No structured frontend telemetry | Consider a lightweight `_evt(name, meta)` wrapper that can be swapped for Sentry/Datadog in production |
| `loadMyAssignments` silently degrades to empty | Show UI warning to site_manager if assignment load fails (currently silent) |
| Stale `S.sites` used in site-detail (fetched at section open from local state) | Add `loadSiteDetail` refetch of live site status before showing edit controls |

---

## 8. Recommended Production Hardening Checklist

- [ ] Deploy BP09 JS changes to staging, verify all 81 BP09 tests pass
- [ ] Confirm `onAuthStateChange(session===null)` behaviour with Supabase JS v2 in target env
- [ ] Enable Supabase dashboard error alerting for repeated RLS rejections (403s in anon logs)
- [ ] Set up browser error reporting (Sentry or equivalent) with `_corrId` as correlation tag
- [ ] Wire `popstate` listener for full back/forward support (P3)
- [ ] Smoke test `confirm_completed_mission` with an already-validated request to verify graceful handling

---

## 9. Files Changed

| File | Action | Lines Δ | Description |
|------|--------|---------|-------------|
| `js/enterprise-dashboard-v1.js` | Modified | +58 / -18 | BP09 fixes: `_REASON_MSG`, `_safeMsg`, `_rpcErr`, `_corrId`; `confirmMission` data.ok guard; `onAuthStateChange` null-session guard; `visibilitychange` handler; all catch sites use `_safeMsg` |
| `tests/enterprise/bp09-resilience-observability-tests.js` | Created | +353 | 81 tests covering scenarios a–o, observability infrastructure, PII safety, concurrency guards, regressions |
| `docs/bp09-enterprise-observability-contract.md` | Created | +200+ | This document |

---

## 10. Test Results Summary

```
bp06-behavioral-tests.js       PASS  139/139
bp06-contract-tests.js         PASS   84/84
rc-hardening-tests.js          PASS   25/25
bp06-regression.js             PASS  133/134 (1 warn, 0 fail)
bp08f-frontend-mock-qa.js      PASS   39/39
bp08cd-frontend-mock-qa.js     PASS   38/38
bp08b-mock-qa.js               PASS   30/30
bp09-resilience-observability-tests.js  PASS  81/81
────────────────────────────────────────────
TOTAL                          PASS  569/570 (1 pre-existing warn)
```

---

## 11. Severity Breakdown

| Severity | Count | Status |
|---------|-------|--------|
| P0 | 1 | ✅ Fixed |
| P1 | 2 | ✅ Fixed |
| P2 | 3 | ✅ Fixed |
| P3 | 3 | ⚠️ Deferred (non-blocking for launch) |
| **Total** | **9** | **6 fixed, 3 deferred** |
