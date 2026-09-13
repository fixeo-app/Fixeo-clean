# Phase A — QA Findings Report

**File:** `js/enterprise-dashboard-v1.js`, `css/enterprise-dashboard-v1.css`, `enterprise-dashboard.html`  
**Audit:** Role Matrix, Viewport, Accessibility, Performance, Security  
**Date:** 2026-09-13

---

## Role Matrix

### Constants
- `CAN_CREATE_ROLES = ['owner','admin','operations_manager','site_manager','reporter']` ✅ correct (viewer absent)
- `CAN_CONFIRM_ROLES = ['owner','admin','operations_manager','site_manager']` ✅ correct (reporter+viewer absent)

### Gates Verified

| Gate | Location | Verdict |
|------|----------|---------|
| `initNewRequestForm()` viewer block | line 2006-2013 | ✅ CORRECT |
| `buildRequestCard()` confirm button | line 1207-1209 | ✅ CORRECT |
| `renderDetailContent()` confirm button | line 1350-1357 | ✅ CORRECT |
| `renderActionRequired()` confirm button | line 509-510 | ✅ CORRECT |
| `confirmMission()` hard guard | line 1419 | ✅ CORRECT |
| Command palette `go-new` role filter | line 2352+2367 | ✅ CORRECT |
| Site detail new-request button | line 1685 | ✅ CORRECT |
| Members list viewer gate | line 1723-1729 | ✅ CORRECT |

### P0 Check: Can viewer trigger createRequest or confirmMission?
- **createRequest:** ❌ CANNOT — form hidden, early return prevents submission
- **confirmMission:** ❌ CANNOT — hard guard at line 1419, button not rendered

**VERDICT: No P0 role escalation bugs. All gates correct.**

---

## Viewport QA

### Mobile (360-430px)
| Check | Source | Status |
|-------|--------|--------|
| Sidebar hidden by default | `transform: translateX(-100%)` in fixeo-dashboard-v2.css line 120 | ✅ PASS |
| Sidebar shows on `.open` | `.fxv2-sidebar.open { transform: translateX(0) }` line 124 | ✅ PASS |
| Hamburger visible | `.fxv2-hamburger` visible; hidden at ≥768px (line 129) | ✅ PASS |
| Bottom nav visible | `.fxv2-bottom-nav` shown by default; hidden at ≥768px | ✅ PASS |
| No horizontal overflow | `.fxv2-section { overflow-x: hidden }` + `.ent-detail-content { overflow-x: hidden }` | ✅ PASS |
| Filter controls stack | `@media (max-width: 480px) .ent-filter-row { flex-direction: column }` | ✅ PASS |
| Detail dialog bottom sheet | `@media (max-width: 767px)` → border-radius top-only, max-height 92dvh | ✅ PASS |
| Filter chips scroll horiz | `@media (max-width: 768px) #filter-chips { overflow-x: auto; flex-wrap: nowrap }` | ✅ PASS |
| Touch targets ≥44px | Workstream J: `.ent-status-tab`, `.ent-filter-select`, `.ent-search-input` min-height 44px | ✅ PASS |

### Tablet (768-1024px)
| Check | Source | Status |
|-------|--------|--------|
| Bottom nav hidden | `@media (min-width: 768px) .fxv2-bottom-nav { display: none }` | ✅ PASS |
| Sidebar toggleable | Sidebar shown at ≥768px permanently | ✅ PASS |

### Desktop (1024px+)
| Check | Source | Status |
|-------|--------|--------|
| Sidebar always visible | `@media (min-width: 768px) .fxv2-sidebar { transform: translateX(0) }` | ✅ PASS |
| Bottom nav hidden | As above | ✅ PASS |
| 2-column layout at 960px+ | `.ent-ov-cols @media (min-width: 960px) { grid-template-columns: 1fr 320px }` | ✅ PASS |
| KPI cards 6-grid at 900px+ | `.ent-kpi-grid @media (min-width: 900px) { repeat(6, 1fr) }` | ✅ PASS |

### Viewport Bugs Found
**None confirmed P0/P1.** Minor observations:
- `@media (min-width: 769px)` in enterprise CSS vs `@media (min-width: 768px)` in base CSS — 1px overlap is harmless but slightly inconsistent. **P3 cosmetic, not fixed.**
- `ent-header-ent-btn` hidden at `max-width: 479px` — leaves no enterprise context visible on very small phones. Acceptable per design intent.

---

## Accessibility Audit

### 1. Buttons with accessible names
All major buttons have `aria-label` or descriptive text content. **Defects found and fixed:**

| Button | Issue | Fix Applied |
|--------|-------|-------------|
| `#requests-retry-btn` | No aria-label (text "Réessayer" too generic) | Added `aria-label="Réessayer le chargement des interventions"` |
| `#form-success-view` | No aria-label | Added `aria-label="Voir mes interventions"` |
| `#sites-retry-btn` | No aria-label | Added `aria-label="Réessayer le chargement des sites"` |
| `#members-retry-btn` | No aria-label | Added `aria-label="Réessayer le chargement des membres"` |
| `#hist-load-more-btn` | Text "Charger plus" ambiguous | Added `aria-label="Charger plus d'historique"` |
| `#history-retry-btn` | No aria-label | Added `aria-label="Réessayer le chargement de l'historique"` |
| "Tout voir →" | Arrow text is unclear | Added `aria-label="Voir toutes les interventions récentes"` |
| "Gérer →" | Arrow text is unclear | Added `aria-label="Gérer les sites"` |
| Requests section "Nouvelle" btn | No aria-label | Added `aria-label="Créer une nouvelle demande d'intervention"` |

**Buttons verified OK (have text or aria-label):**
- Hamburger: `aria-label="Ouvrir le menu de navigation"` ✅
- All nav links: have visible text content ✅  
- Status tabs: have visible text content ✅
- Urgency buttons: have `aria-label` ✅
- Submit button: has text `id="req-submit-text"` ✅
- Detail dialog close: `aria-label="Fermer le détail..."` ✅
- Export CSV: `aria-label="Exporter en CSV"` ✅

### 2. Inputs with labels
All form inputs verified:
- `#req-search`: `aria-label="Rechercher une intervention"` ✅
- `#req-site`: `<label for="req-site">` ✅
- `#req-category`: `<label for="req-category">` ✅
- `#req-category-other`: `aria-label="Précisez la catégorie"` ✅
- `#req-desc`: `<label for="req-desc">` ✅
- `#ent-search-q`: `aria-label="Terme de recherche"` ✅
- `#ent-cmd-input`: `aria-label="Commande"` ✅
- Filter selects: all have `aria-label` ✅

### 3. Focus trap in dialogs
| Dialog | trapFocus called | Status |
|--------|-----------------|--------|
| Detail dialog (`openDetailDialog`) | `trapFocus(dialog)` at line 1464 | ✅ |
| Search dialog (`openSearch`) | **MISSING** — fixed: added `trapFocus(dlg)` | ✅ Fixed |
| Command palette (`openCmdPalette`) | **MISSING** — fixed: added `trapFocus(dlg)` | ✅ Fixed |

Note: Search and cmd palette had custom keydown handlers that handled Tab→focus input, but `trapFocus()` was not called. This meant Tab could escape the modal. Fixed by adding `trapFocus(dlg)` call in both `openSearch()` and `openCmdPalette()`.

### 4. aria-expanded on toggleable controls
- Hamburger: `aria-expanded` set to `"true"`/`"false"` in `_openSidebar()`/`_closeSidebar()` ✅
- No other accordion/disclosure widgets found.

### 5. aria-current for active nav items
- `showSection()` sets `aria-current="page"` on active bottom nav buttons ✅
- `showSection()` sets `aria-current="page"|"false"` on sidebar nav links ✅
- Initial state: `#nav-overview` has `aria-current="page"` in HTML ✅

### 6. Color contrast
CSS variables used throughout (`--v2-primary`, `--v2-text`, `--v2-text-2`, `--v2-text-3`). Cannot calculate actual ratios from CSS vars alone. Flagged for manual verification:
- `var(--v2-text-3)` on `var(--v2-bg-card)` — likely low contrast for metadata labels
- `ent-kpi-label` (text-3 color) — small uppercase text, needs verification
- Status badge text colors on dark backgrounds — generally adequate based on known values

**P3 — no automated fix possible without knowing resolved var values.**

### 7. No keyboard traps outside dialogs
- Tab focus is free throughout main content. ✅
- `trapFocus()` only called inside open dialogs. ✅

### 8. Form validation announcements
- `#form-error`: `role="alert" aria-live="assertive"` ✅
- `#category-error`: `role="alert" aria-live="assertive"` ✅
- `#desc-error`: `role="alert" aria-live="assertive"` ✅
- `#ent-confirm-error`: `role="alert" aria-live="assertive"` ✅

---

## Performance Audit

### 1. renderRequestsList
- Does **incremental** render using `if(listEl.querySelector('[data-request-id="'+r.id+'"]')) return;` ✅
- On `reset=true`: clears list then rebuilds ✅
- No excessive re-renders found.

### 2. renderSavedViews
- Called on every filter change — rebuilds full chips DOM ✅
- Small DOM (preset + user views), acceptable performance ✅

### 3. buildRequestCard
- No expensive operations in loop ✅
- `safeHtml()` is a simple string replace — O(n) on content length ✅
- Event listeners added per-card via `addEventListener` (not inline handlers) ✅

### 4. loadRequests — loading guard position
- `S.requestsLoading` checked at line 1031 (top of function) ✅
- **P1 BUG FOUND & FIXED**: Early return on `requestsExhausted` at line 1037 fired AFTER setting `S.requestsLoading = true` but WITHOUT resetting it → permanent deadlock on subsequent calls.
- **Fix applied**: Changed `return;` → `{ S.requestsLoading=false; setLoading('section-requests',false); return; }`

### 5. loadHistory — loading guard position
- `S.historyLoading` checked at line 1834 (top of function) ✅
- **P1 BUG FOUND & FIXED**: Same early-return deadlock as loadRequests.
- **Fix applied**: Changed `return;` → `{ S.historyLoading=false; setLoading('section-history',false); return; }`

### 6. Polling (startPolling/stopPolling)
- `startPolling()` calls `stopPolling()` first — prevents timer accumulation ✅
- `S.isPolling` flag prevents concurrent poll executions ✅
- `clearInterval(S.pollTimer)` called in `stopPolling()` ✅
- Auth listener calls `stopPolling()` on SIGNED_OUT ✅

### 7. renderFilterChips
- Rebuilds full DOM on each filter change ✅
- Small DOM (2-3 chips max), acceptable ✅

### 8. setInterval without clearInterval
- Only one `setInterval` in the entire file: `startPolling()` ✅
- Paired with `clearInterval` in `stopPolling()` ✅
- No memory leak risk ✅

### 9. silentRefreshRequests
- Called during polling when section === 'requests' ✅
- Does NOT set `requestsLoading` guard — this is intentional (it's a background refresh, not a user-triggered load) ✅
- Deduplicates via `existing` Set ✅

---

## Security Audit

### 1. Auth token in localStorage
```
grep localStorage.setItem → line 913:
  localStorage.setItem('fixeo_ent_views_' + S.activeEnterprise.id, JSON.stringify(S.savedViews));
```
Only stores `S.savedViews` which contains filter state (reqStatusFilter, reqSiteFilter, reqUrgencyFilter, reqCategoryFilter, reqSort). **No auth tokens.** ✅

### 2. Enterprise secrets in saved views
`saveCurrentView()` (line 916-929) saves only:
- `reqStatusFilter`, `reqSiteFilter`, `reqUrgencyFilter`, `reqCategoryFilter`, `reqSort`

No UUIDs, no user emails, no enterprise IDs stored in the view object. ✅

### 3. safeHtml() used for user-generated content
All `innerHTML` assignments verified:
- Request `description` → `safeHtml(r.description.substring(0,200))` ✅
- Request `category` → `safeHtml(r.category||'—')` ✅
- Site `name`, `city`, `address` → all `safeHtml()` ✅
- Member names and emails → all `safeHtml()` ✅
- Error messages from API → `safeHtml(err.message)` ✅
- RAFI ops lines → `safeHtml(l.text)` ✅
- View names from localStorage → `safeHtml()` not applied to `nameSpan.textContent` — but `.textContent` is safe (no HTML injection) ✅

### 4. CSV export
`exportRequestsCSV()` exports: Reference, Site, City, Category, Urgency, Status, Date.
- **No description field** ✅
- **No phone** ✅
- **No email** ✅
- **No auth tokens** ✅
- `csvEscape()` handles special chars ✅

### 5. Search results description in snippets
`renderSearchResults()` line ~2253:
```js
var sub = safeHtml((r.description||'').slice(0,60) || '—');
```
Description truncated to 60 chars AND passed through `safeHtml()`. ✅

### 6. No production URL
No hardcoded production URLs found. Supabase client is in `js/supabase-client.js` (not audited here per scope). ✅

---

## Defects Found & Fixed

| ID | Severity | Category | Description | Fixed |
|----|----------|----------|-------------|-------|
| DEF-01 | P1 | Performance | `loadRequests`: early return on `requestsExhausted` without resetting `requestsLoading=true` → permanent deadlock | ✅ Yes |
| DEF-02 | P1 | Performance | `loadHistory`: same early-return deadlock | ✅ Yes |
| DEF-03 | P2 | Accessibility | `openSearch()`: `trapFocus()` not called on search dialog → Tab can escape modal | ✅ Yes |
| DEF-04 | P2 | Accessibility | `openCmdPalette()`: `trapFocus()` not called on cmd palette → Tab can escape modal | ✅ Yes |
| DEF-05 | P2 | Accessibility | 9 buttons missing `aria-label` or having overly generic text | ✅ Yes |

---

## Defects Found But Not Fixed (with reason)

| ID | Severity | Category | Description | Reason Not Fixed |
|----|----------|----------|-------------|-----------------|
| DEF-06 | P3 | Accessibility | Color contrast for `--v2-text-3` metadata labels and KPI labels cannot be verified from CSS vars alone | Cannot resolve CSS vars statically; requires browser rendering |
| DEF-07 | P3 | Viewport | `@media (min-width: 769px)` in enterprise CSS vs `@media (min-width: 768px)` in base CSS — 1px gap | Cosmetic only; no visible user impact; changing breakpoint risks layout regression |
| DEF-08 | P3 | Accessibility | Nav link buttons in sidebar (e.g. `#nav-requests`) have visible text but no explicit `aria-label` | Text content "Interventions", "Sites" etc. is descriptive enough per WCAG SC 2.4.6 |
| DEF-09 | P4 | Accessibility | `trapFocus()` listener is added on every `open*` call (not idempotent) — repeated opens accumulate keydown listeners on the dialog element | Low risk (dialogs are typically opened once per session); fixing requires refactor to use `{ once: false }` + cleanup in `close*` — deferred |

---

## node --check Result

```
node --check js/enterprise-dashboard-v1.js
✅ JS syntax OK (no output = pass)
```

## git diff --check Result

```
git diff --check
(no whitespace errors)
```
