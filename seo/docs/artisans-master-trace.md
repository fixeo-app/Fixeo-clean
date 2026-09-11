# Artisan Data Dependency Trace

**Task:** Phase 1 Task 1.8 — Read-only investigation. No files modified.
**Date:** 2026-09-10
**Scope:** `data/artisans-master.json`, `js/fixeo-artisans-master-loader.js`,
`js/fixeo-supabase-loader.js`, `js/fixeo-local-flagship-v1.js`, and all dependents.

---

## 1. Search Methodology

Repository-wide search using `grep -rn` across all `.js`, `.html`, `.json`, `.md`, `.ts`, `.mjs` files, excluding `node_modules/` and `.git/`. Each match was individually inspected for context (active script tag, comment, dead reference, generator-emitted string, test-only, documentation).

**Identifiers searched:**

| Identifier | Total refs found |
|------------|-----------------|
| `artisans-master` | 11 |
| `fixeo-artisans-master-loader` | 4 |
| `FixeoArtisansMaster` | 0 |
| `fixeo-supabase-loader` | 43 |
| `fixeo-local-flagship-v1` | 708 |

---

## 2. `data/artisans-master.json`

### File facts
- **Size:** 155,897 bytes
- **Structure:** JSON array of 367 artisan objects
- **Sample fields:** `id`, `name`, `service`, `metier`, `city`, `rating`, `reviews`, `verified`, `availability`, `phone`, `score_qualification`, `premium`, `badge`, `experience`, `photo`, `_source`
- **ID range documented in loader:** 1000–1366

### All 11 references

| File | Line | Type | Detail |
|------|------|------|--------|
| `js/fixeo-artisans-master-loader.js` | 4, 17, 141, 147 | **Own file** — self-reference in header comment and `DATA_URL = '/data/artisans-master.json'` | Active code path inside the loader itself; but loader is not loaded by any active page |
| `js/fixeo-supabase-loader.js` | 9 | **Comment** — "Replaces: - fixeo-artisans-master-loader.js (fetch /data/artisans-master.json)" | Historical documentation only; not an active dependency |
| `index.html` | 6024 | **Disabled comment** — `<!-- fixeo-artisans-master-loader.js DISABLED - data now from Supabase -->` | Explicitly disabled; no `<script src>` tag present |
| `admin.html` | 1083 | **Disabled comment** — `<!-- fixeo-artisans-master-loader.js DISABLED — data now from Supabase -->` | Explicitly disabled; no `<script src>` tag present |
| `data/pricing/ux/prototype/tests/estimator-v2-10c0-artisan-readiness-tests.js` | 158–163 | **Offline test only** — `fs.readFileSync('…/data/artisans-master.json')` | Node.js test script; not deployed; reads the file on disk at test runtime; **not a browser runtime dependency** |

### Summary

**No active browser runtime reads `data/artisans-master.json`.**
The only non-self references are: one disabled HTML comment (×2 pages), one documentation comment in `fixeo-supabase-loader.js`, and one Node.js offline test script.

---

## 3. `js/fixeo-artisans-master-loader.js`

### All 4 references

| File | Line | Type | Detail |
|------|------|------|--------|
| `js/fixeo-artisans-master-loader.js` | 2 | **Own file** — header comment `* fixeo-artisans-master-loader.js` | Self |
| `js/fixeo-supabase-loader.js` | 9 | **Comment** — "Replaces: - fixeo-artisans-master-loader.js" | Historical documentation |
| `index.html` | 6024 | **Disabled comment** — `<!-- fixeo-artisans-master-loader.js DISABLED - data now from Supabase (fixeo-supabase-loader.js) -->` | No `<script src>` tag |
| `admin.html` | 1083 | **Disabled comment** — `<!-- fixeo-artisans-master-loader.js DISABLED — data now from Supabase (fixeo-supabase-loader.js) -->` | No `<script src>` tag |

**`FixeoArtisansMaster` (window global exposed by the loader): 0 references anywhere.**

### Loader behavior (internal — for reference only)

The loader itself (`fixeo-artisans-master-loader.js`) would, if ever loaded:
1. Fetch `/data/artisans-master.json` via XHR
2. Inject records into `window.ARTISANS`, `window.replaceMarketplaceArtisans()`, `window.SearchEngine.artisans`
3. Dispatch `fixeo:marketplace-artisans-updated`
4. On failure: silently swallow the error (no fallback to another source)

**This code path is unreachable in production.** No active HTML page loads this script.

---

## 4. `js/fixeo-supabase-loader.js` — Active Consumers

43 references across all files. Active browser runtime consumers (active `<script src>` tags):

| Page | Role | Notes |
|------|------|-------|
| `index.html` | Homepage | `<script defer src="js/fixeo-supabase-loader.js?v=sl2">` — active |
| `artisans.html` | Artisan directory | `<script src="js/fixeo-supabase-loader.js?v=sl2" defer>` — active |
| `artisan-profile.html` | Public artisan profile | `<script src="/js/fixeo-supabase-loader.js?v=sl2" defer>` — active |
| `admin.html` | Admin dashboard | `<script src="js/fixeo-supabase-loader.js?v=sl2" defer>` — active |
| `dashboard-artisan.html` | Artisan dashboard | `<script src="js/fixeo-supabase-loader.js?v=sl1">` — active |
| `dashboard-client-v1.html` | Client dashboard | `<script src="js/fixeo-supabase-loader.js?v=sl1">` — active |

**Non-active references:** JS files (`fixeo-estimation-page-v1.js`, `fixeo-artisan-identity.js`, `fixeo-public-artisan-profile.js`, `marketplace-premium-patch.js`, `reservation.js`, `urgent-results.js`, `main.js`, `fixeo-pricing-marocain.js`, `fixeo-artisan-directory-v1.js`) reference it in comments, guard checks, or assume it pre-populates `window.ARTISANS` / `FixeoDB`. Pricing test scripts reference it in test assertions.

**Critical: `fixeo-supabase-loader.js` is NOT loaded on any SEO service×city page.** It is a marketplace/dashboard loader only.

### Supabase-loader fallback chain

```
Supabase query success → inject into window.ARTISANS + FixeoDB (localStorage)
Supabase query returns 0 artisans → fallback to FixeoDB (localStorage)
Supabase unreachable → fallback to FixeoDB (localStorage)
FixeoDB empty → inject empty array; marketplace renders "no artisans"
```

**Fallback destination: FixeoDB (localStorage). NOT artisans-master.json.**

---

## 5. `js/fixeo-local-flagship-v1.js` — Active Consumers

708 total references. Breakdown:

| Category | Count | Detail |
|----------|-------|--------|
| **Active `<script src>` in SEO HTML pages** | 349 | All service×city + problem + price + quartier HTML files |
| **Generator source strings** (`generate-lps.js`, `generate-pseo-v2.js`) | ~356 | Script tag emitted into generated HTML — explains 349 files + generator source lines |
| **Own file** (`fixeo-local-flagship-v1.js`) | 1 | Self-reference in header comment |
| **V3 data** (`seo/data/artisan-counts.json`) | 1 | Documentation reference in QA metadata |
| **V3 docs** (`seo/docs/phase1-qa-report.md`) | 1 | Phase 0 audit reference |

**All 349 active SEO HTML pages load `fixeo-local-flagship-v1.js`.**
This includes: service×city pages (118), problem pages (88), price pages (92), quartier pages (111) — but NOT `index.html`, `artisans.html`, dashboards, or admin.

### Flagship does NOT load or reference:
- `fixeo-supabase-loader.js` — not loaded on SEO pages; flagship initializes its own Supabase client independently
- `fixeo-artisans-master-loader.js` — no reference whatsoever
- `data/artisans-master.json` — no reference whatsoever
- `FixeoDB` / localStorage — no reference in the SEO artisan query path

---

## 6. Current SEO Artisan Data Source (Confirmed)

**Canonical artisan data source for all 349 service×city SEO pages: Supabase.**

Script load order on a service×city page (e.g. `plombier-casablanca.html`):

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="/js/supabase-client.js?v=sc2"></script>
<!-- ... other scripts ... -->
<script src="/js/fixeo-local-flagship-v1.js?v=fxlp-v12" defer></script>
```

**NOT present on SEO pages:** `fixeo-supabase-loader.js`, `fixeo-artisans-master-loader.js`.

### Flagship Supabase query (verified from source):

```js
client
  .from('artisans')
  .select('id, legacy_id, name, city, category, verified, description, photo_url, price_from, price_label')
  .ilike('city', '%' + ctx.city + '%')
  .ilike('category', ctx.cat + '%')
  .order('rating', { ascending: false })
  .limit(3)
```

The `FixeoSupabaseClient` is initialized by `supabase-client.js` and consumed directly by `fixeo-local-flagship-v1.js`. If `FixeoSupabaseClient` is unavailable, the flagship retries up to `MAX_PATCH=10` times at `RETRY_MS` intervals before calling `_renderEmpty()`.

---

## 7. Fallback Analysis — Can `artisans-master.json` Become Active?

| Scenario | Does artisans-master.json activate? | Evidence |
|----------|-------------------------------------|---------|
| Supabase unreachable on SEO page | **NO** — flagship calls `_renderEmpty()` (renders "Aucun profil correspondant actuellement" UI) | `fixeo-local-flagship-v1.js` lines 390–393, 413, 439, 466 |
| Supabase returns 0 results on SEO page | **NO** — `_renderEmpty()` is called | Line 276 |
| `FixeoSupabaseClient` unavailable after retries | **NO** — `_renderEmpty()` after MAX_PATCH retries | Lines 463–466 |
| `fixeo-supabase-loader.js` Supabase failure | **NO** — falls back to FixeoDB (localStorage), not artisans-master.json | `fixeo-supabase-loader.js` lines 274–278 |
| Someone manually loads `fixeo-artisans-master-loader.js` | Would inject into `window.ARTISANS`/`SearchEngine` — irrelevant to flagship's Supabase query | Loader is not referenced by flagship |

**Conclusion: There is no fallback path that activates `data/artisans-master.json` in any current production code path.**

---

## 8. Generator and Tooling Dependencies

| Script | Depends on artisans-master.json? | Depends on master-loader? |
|--------|----------------------------------|--------------------------|
| `scripts/generate-lps.js` | **NO** | **NO** |
| `scripts/generate-pseo-v2.js` | **NO** | **NO** |
| `scripts/generate-blog.js` | **NO** | **NO** |
| `scripts/generate-blog-v2.js` | **NO** | **NO** |
| `scripts/generate-authority-blog-v3.js` | **NO** | **NO** |
| `scripts/unify-footer.py` | **NO** | **NO** |
| `data/pricing/ux/prototype/tests/estimator-v2-10c0-artisan-readiness-tests.js` | **YES** — reads file via `fs.readFileSync` at test runtime | **NO** |

**Only dependency on `artisans-master.json` outside the loader itself: one offline Node.js test file** (`estimator-v2-10c0-artisan-readiness-tests.js`). This is not deployed to production and is not part of the SEO V3 build pipeline.

---

## 9. Deletion-Risk Assessment

> ⚠️ **This section documents evidence only. No deletion decision is made here.
> Neither file has been or will be deleted as part of Task 1.8.**

### Scenario A — Delete `data/artisans-master.json`

| Surface | Risk |
|---------|------|
| Production SEO pages (349) | **NONE** — flagship queries Supabase directly |
| Homepage, artisans.html, dashboards | **NONE** — supabase-loader falls back to FixeoDB, not this file |
| Admin dashboard | **NONE** — loader explicitly disabled |
| `generate-lps.js`, `generate-pseo-v2.js` | **NONE** — no reference |
| Offline pricing test (`estimator-v2-10c0-artisan-readiness-tests.js`, test 16) | **⚠️ Test 16 would FAIL** — it reads the file via `fs.readFileSync` and asserts existence of Plomberie + Casablanca artisans |

**Before deletion can be considered:** The pricing test file must be reviewed and either updated or the test removed/skipped. This is outside SEO V3 scope.

### Scenario B — Delete `js/fixeo-artisans-master-loader.js`

| Surface | Risk |
|---------|------|
| Production SEO pages | **NONE** — file not loaded on any SEO page |
| Homepage, dashboards, admin | **NONE** — explicitly disabled; `<script src>` tag does not exist |
| Any other page | **NONE** — 0 active `<script src>` references anywhere |
| `FixeoArtisansMaster` window global | **NONE** — 0 references to this global anywhere |

**Files to recheck before any future deletion decision:**
1. `data/pricing/ux/prototype/tests/estimator-v2-10c0-artisan-readiness-tests.js` — read dependency on `artisans-master.json`
2. `js/fixeo-supabase-loader.js` — references loader in comment (documentation only; not a runtime dependency)
3. Any CI pipeline or npm script that runs the pricing tests (none found in current repo root, but not in scope to fully audit)

---

## 10. V3 Canonical Data Source Conclusion

**Supabase is the canonical artisan data source for FIXEO SEO V3.**

Evidence:
1. All 349 existing SEO pages already query Supabase via `fixeo-local-flagship-v1.js` + `FixeoSupabaseClient`
2. The master loader was explicitly disabled on both pages where it appeared (`index.html`, `admin.html`); the disabling comment names Supabase as the replacement
3. `fixeo-supabase-loader.js` header says: "Replaces: fixeo-artisans-master-loader.js"
4. `data/artisans-master.json` (367 records) contains fewer than half the artisan rows in Supabase (1,383 rows in the live DB per Task 1.7 count)
5. `artisan-counts.json` (Task 1.7) was built directly from Supabase — it is the ground truth for V3 publishability decisions

**V3 does not introduce any new dependency on `data/artisans-master.json` or `fixeo-artisans-master-loader.js`.** These files are retained as compatibility/rollback assets pending an explicit cleanup decision outside this project's scope.

---

## 11. Phase 2 Architectural Rule

**SEO V3 generators and templates must NOT introduce any new dependency on `data/artisans-master.json`.**

Specifically:
- V3 generators must not `require()` or `readFileSync()` `artisans-master.json`
- V3 HTML templates must not include `<script src="…/fixeo-artisans-master-loader.js">`
- V3 artisan seed data (if any) must come from Supabase queries or `artisan-counts.json`
- V3 content-guard and publishability modules must not reference the legacy JSON

---

## 12. Files to Recheck Before Future Legacy Cleanup

The following files must be reviewed before any future decision to delete the legacy artisan assets:

| File | Why |
|------|-----|
| `data/pricing/ux/prototype/tests/estimator-v2-10c0-artisan-readiness-tests.js` | Test 16 reads `artisans-master.json` via `fs.readFileSync`; would fail if file deleted |
| `js/fixeo-supabase-loader.js` | Documents loader replacement in header comment; comment should be updated after cleanup |
| Any CI/test runner configuration | Not found in repo root but should be checked before any deletion |

---

## Appendix — Reference Classification Summary

### artisans-master.json references by class

| Class | Files | Active? |
|-------|-------|---------|
| Self (inside loader) | `js/fixeo-artisans-master-loader.js` | N/A — loader itself inactive |
| Disabled HTML comment | `index.html`, `admin.html` | ❌ No |
| Documentation comment | `js/fixeo-supabase-loader.js` | ❌ No |
| Offline test (Node.js) | `data/pricing/ux/prototype/tests/estimator-v2-10c0-artisan-readiness-tests.js` | ⚠️ Test-only |

### fixeo-local-flagship-v1.js references by class

| Class | Count | Active? |
|-------|-------|---------|
| Active `<script src>` in HTML | 349 | ✅ Yes — all SEO pages |
| Generator source string | ~2 | ✅ Yes — emits the script tag |
| Self-reference | 1 | N/A |
| V3 documentation | 2 | ❌ No |

### fixeo-supabase-loader.js references by class

| Class | Count | Active? |
|-------|-------|---------|
| Active `<script src>` in HTML | 6 | ✅ Yes — non-SEO pages only |
| JS file references (comments/guards) | ~9 | ⚠️ Indirect |
| Pricing test assertions | ~4 | ⚠️ Test-only |
| Documentation | remaining | ❌ No |
