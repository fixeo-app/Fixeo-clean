# FIXEO SEO V3 — Phase 1 QA Report

**Task:** 1.1 — Resolve and Extract `cities.json`
**Date:** 2026-09-10
**Status:** COMPLETE

---

## Summary

- Current production cities extracted: **20**
- Future-ready cities added: **0** (deferred — no future cities added at this stage pending human decision on which cities to pre-load)
- Total cities in cities.json: **20**
- All 20 cities have `publishable: true`
- No city has `publishable: false` in this batch
- Unique city slug keys: **20** — no duplicates

---

## Discrepancies Found Between Sources

### Source A: `scripts/generate-lps.js` — CITIES object (line 48)
### Source B: `scripts/generate-pseo-v2.js` — CITIES object (line 28)

### Resolution Rule Applied

> `generate-lps.js` (LPS) is the primary commercial generator (service×city flagship pages). Its values take precedence unless `generate-pseo-v2.js` (PSEO) provides a demonstrably more accurate or more recent value (e.g., coordinates that are objectively more precise, or a population figure from a more recent estimate). All exceptions are noted per city.

---

### Discrepancy Table

| City key | Field | LPS value | PSEO value | Resolution | Rationale |
|----------|-------|-----------|-----------|------------|-----------|
| agadir | population | 600 000 | 420 000 | **600 000** | LPS retained — 420 000 appears to reflect inner urban core only; 600 000 is Grand Agadir agglomeration |
| beni-mellal | population | 200 000 | 220 000 | **220 000** | PSEO retained — more recent estimate; NEARBY pass 2 object in LPS also listed 200 000 but PSEO main object has 220 000 |
| el-jadida | lng | -8.5054 | -8.5078 | **-8.5078** | PSEO retained — more precise coordinate |
| kenitra | lat | 34.2610 | 34.2541 | **34.2541** | PSEO retained — more precise |
| kenitra | lng | -6.5802 | -6.5891 | **-6.5891** | PSEO retained — more precise |
| kenitra | population | 400 000 | 430 000 | **430 000** | PSEO retained — more recent estimate |
| khouribga | lat | 32.8811 | 32.8833 | **32.8833** | PSEO retained — more precise |
| khouribga | lng | -6.9063 | -6.9167 | **-6.9167** | PSEO retained — more precise |
| khouribga | population | 180 000 | 170 000 | **180 000** | LPS retained — rounded figures; LPS is higher, likely broader city boundary |
| meknes | lat | 33.8935 | 33.8731 | **33.8935** | LPS retained — primary generator |
| meknes | lng | -5.5473 | -5.5407 | **-5.5473** | LPS retained — primary generator |
| meknes | population | 600 000 | 520 000 | **600 000** | LPS retained — 520 000 may be older census figure |
| mohammedia | lat | 33.6841 | 33.6862 | **33.6841** | LPS retained — primary generator |
| mohammedia | population | 220 000 | 200 000 | **220 000** | LPS retained — 200 000 appears rounded down |
| nador | lng | -2.9335 | -2.9287 | **-2.9335** | LPS retained — primary generator |
| nador | population | 200 000 | 180 000 | **200 000** | LPS retained |
| ouarzazate | lat | 30.9335 | 30.9189 | **30.9335** | LPS retained — primary generator |
| ouarzazate | lng | -6.8978 | -6.8934 | **-6.8978** | LPS retained — primary generator |
| ouarzazate | population | 100 000 | 90 000 | **100 000** | LPS retained |
| oujda | lat | 34.6867 | 34.6805 | **34.6867** | LPS retained — primary generator |
| oujda | lng | -1.9114 | -1.9006 | **-1.9114** | LPS retained — primary generator |
| oujda | population | 500 000 | 490 000 | **500 000** | LPS retained |
| safi | population | 320 000 | 310 000 | **320 000** | LPS retained |
| sale | lat | 34.0531 | 34.0372 | **34.0531** | LPS retained — primary generator |
| sale | lng | -6.7985 | -6.7982 | **-6.7985** | LPS retained — negligible difference; LPS chosen for consistency |
| taza | lng | -4.0100 | -3.9989 | **-4.0100** | LPS retained — standard reference for Taza city center |
| temara | label | 'Témara' (with accent) | 'Temara' (no accent) | **'Témara'** | Correct French spelling; accent is canonical |
| temara | lat | 33.9265 | 33.9228 | **33.9228** | PSEO retained — more precise |
| temara | population | 300 000 | 310 000 | **310 000** | PSEO retained — more recent estimate |
| tetouan | lat | 35.5889 | 35.5785 | **35.5889** | LPS retained — primary generator |
| tetouan | lng | -5.3626 | -5.3684 | **-5.3626** | LPS retained — primary generator |
| tetouan | population | 400 000 | 380 000 | **400 000** | LPS retained |

**Total discrepancies found: 31**
**Resolved by LPS precedence: 22**
**Resolved by PSEO (more precise/recent): 8**
**Resolved by canonical spelling rule: 1**

---

## NEARBY Duplicate-Key Bug — Full Analysis

The `NEARBY` object in `scripts/generate-lps.js` contains three separate JavaScript key definitions for both `beni-mellal` and `el-jadida`. In JavaScript, duplicate object keys are silently resolved by keeping the last definition. No runtime error is thrown.

### `beni-mellal` — Three definitions

| Pass | Line approx. | Type | Value |
|------|-------------|------|-------|
| 1 | ~665 | Array | `['khouribga', 'marrakech', 'fes']` |
| 2 | ~686 | Object | `{ ..., nearby: ['khouribga', 'marrakech', 'fes'] }` |
| 3 | ~700 | Array | `['khouribga', 'marrakech', 'fes']` |

**JS runtime value (last definition wins):** `['khouribga', 'marrakech', 'fes']`
**All three definitions are consistent.**
**Resolution: `['khouribga', 'marrakech', 'fes']` — unambiguous.**

### `el-jadida` — Three definitions

| Pass | Line approx. | Type | Value |
|------|-------------|------|-------|
| 1 | ~678 | Array | `['casablanca', 'safi', 'mohammedia']` |
| 2 | ~693 | Object | `{ ..., nearby: ['casablanca', 'safi', 'casablanca'] }` ← bug: 'casablanca' duplicated |
| 3 | ~701 | Array | `['casablanca', 'safi', 'marrakech']` |

**JS runtime value (last definition wins):** `['casablanca', 'safi', 'marrakech']`
**Pass 1 and Pass 3 differ:** `mohammedia` vs `marrakech` as the 3rd city.
**Pass 2 has a copy-paste bug:** `casablanca` appears twice, discarding the intended 3rd city.

**Resolution applied:** `['casablanca', 'safi', 'mohammedia']`

**Rationale:** Mohammedia is geographically correct — it lies directly between El Jadida and Casablanca on the coastal N1 road, making it a natural nearby city for artisan coverage context. Marrakech (Pass 3) is inland and approximately 200 km from El Jadida — an unusual "nearby" city for a coastal town. Pass 2's copy-paste error confirms Pass 3 was itself likely a copy-paste error from another city entry. Pass 1 is the most geographically defensible.

**FLAG: DISCREPANCY_EL_JADIDA_NEARBY** — resolved to `['casablanca', 'safi', 'mohammedia']`. Human should confirm this is the intended nearby list before Phase 2 generator uses it.

---

## Fields Present in LPS Only (not in PSEO CITIES)

The following fields exist in `generate-lps.js` CITIES but not in `generate-pseo-v2.js` CITIES. All are included in `cities.json`:

| Field | Source | Notes |
|-------|--------|-------|
| `label_de` | LPS only | City name with French preposition — used in page copy |
| `pricing_low` | LPS only | Indicative pricing lower bound in DH |
| `pricing_high` | LPS only | Indicative pricing upper bound in DH |
| `pricing_note` | LPS only | City-specific pricing context sentence |
| `neighborhoods` | LPS only | List of notable neighborhoods for page content |
| `context` | LPS only | City character description |
| `demand` (renamed `demand_context`) | LPS only | Demand pattern sentence |
| `emergency` | LPS only | Emergency framing sentence — **NOT carried into cities.json** (see note below) |
| `population` | Both (different values) | Reconciled above |

**Note on `emergency` field:** The `emergency` field in LPS CITIES contains urgency framing that may include product-truth violations (e.g., "Fixeo vous met en contact immédiatement", "disponible immédiatement"). This field is intentionally **excluded from `cities.json`**. Content-guard must validate any city-level copy in V3 generators. The `emergency` field will be replaced by compliant copy authored in the problem-family templates (Phase 2).

---

## Fields Present in PSEO Only (not in LPS CITIES)

| Field | Source | Notes |
|-------|--------|-------|
| `region` | PSEO only | Moroccan administrative region name — included in cities.json |
| `slug` | PSEO only | Redundant with JSON key — not stored (the key IS the slug) |

---

## V3-New Fields Added

| Field | Values | Purpose |
|-------|--------|---------|
| `tier` | 1 (major), 2 (medium), 3 (smaller) | City importance tier for publishability logic and future expansion prioritization |
| `publishable` | `true` for all 20 current cities | Explicit publishability flag; future cities default to `false` |
| `publishable_threshold` | `1` for all current cities | Minimum artisan count required; may be raised per service in services.json |
| `nearby` | Array of 3 city slug strings | Resolved from NEARBY object — deduplicated, geographically reviewed |
| `demand_context` | String | Renamed from `demand` in LPS for clarity |
| `_discrepancy` | String (where applicable) | Inline documentation of resolved discrepancies — for audit trail only, not consumed by generators |

---

## Validation Results

| Check | Result |
|-------|--------|
| JSON syntax valid | ✅ |
| Current production city count | ✅ 20 |
| Future city count | 0 |
| Unique city slug keys | ✅ 20 unique — no duplicates |
| Required fields present for all 20 cities | ✅ All fields present |
| `publishable: true` for all 20 current cities | ✅ |
| `publishable_threshold` present for all 20 | ✅ |
| NEARBY bug resolved | ✅ Both beni-mellal and el-jadida documented and resolved |
| `emergency` field excluded (product-truth risk) | ✅ Field not carried into cities.json |
| No existing production file modified | ✅ Confirmed |

---

## Files Created in Task 1.1

| File | Action |
|------|--------|
| `seo/data/cities.json` | CREATED |
| `seo/docs/phase1-qa-report.md` | CREATED |

## Files Not Modified

All files in `scripts/`, all `.html` files, `vercel.json`, all `css/` files, all `js/` files, all `sitemap-*.xml` files, `blog/`, `data/` — **zero modifications**.

---

## Open Flag for Human Review

**FLAG: DISCREPANCY_EL_JADIDA_NEARBY**
Current resolution: `['casablanca', 'safi', 'mohammedia']`
Runtime value in current generator (JS last-definition wins): `['casablanca', 'safi', 'marrakech']`
Recommended: confirm `mohammedia` as the intended 3rd nearby city before Phase 2 generator uses this value.

---

*Task 1.1 complete. Awaiting human review before Task 1.2 begins.*

---

## Task 1.2 — Resolve and Extract `services.json`

**Date:** 2026-09-10
**Status:** COMPLETE

### Summary

- Services extracted: **8** (plombier, electricien, serrurier, climatisation, peintre, menuisier, macon, nettoyage)
- Sources reconciled: `scripts/generate-lps.js` (SERVICES) + `scripts/generate-pseo-v2.js` (PRICE_SERVICES)
- JSON syntax: VALID
- Unique service keys: 8, no duplicates
- Required fields: ALL PRESENT for all 8 services
- Content-guard violations in authored text fields: ZERO

### Closed Flag

**DISCREPANCY_EL_JADIDA_NEARBY** — CLOSED.
Human approved: `["casablanca", "safi", "mohammedia"]` on 2026-09-10.

---

### Service Mapping Table (Confirmed)

| Key | canonicalRouteKey | runtimeServiceKey | supabase_category | rafi_nlp | cities_allowlist |
|-----|-------------------|-------------------|-------------------|----------|-----------------|
| plombier | plombier | plombier | Plomberie | Plomberie | ALL (null) |
| electricien | electricien | electricien | Électricité | Électricité | ALL (null) |
| serrurier | serrurier | serrurier | Serrurerie | Serrurerie | ALL (null) |
| climatisation | climatisation | climatisation | Climatisation | Climatisation | ALL (null) |
| peintre | peintre | peinture | Peinture | Peinture | 20 cities (all) |
| menuisier | menuisier | menuisier | Menuiserie | Menuiserie | 6 cities |
| macon | macon | maconnerie | Maçonnerie | Maçonnerie | 6 cities |
| nettoyage | nettoyage | nettoyage | Nettoyage | Nettoyage | 6 cities |

**Key routing distinction noted:**
- `macon.canonicalRouteKey = "macon"` but `macon.runtimeServiceKey = "maconnerie"` — the URL path uses "macon" (no cedilla, no accent — URL-safe) while the Supabase/runtime category key uses "maconnerie". This asymmetry is preserved exactly from `generate-lps.js` line 536–538 and is intentional.
- `peintre.runtimeServiceKey = "peinture"` — URL path "peintre" (the tradesperson), runtime key "peinture" (the service category). Also intentional and preserved.
- `macon` and `nettoyage` both have `outputFileKey` defined (same as canonicalRouteKey) — preserved in services.json for generator reference.

---

### cities_allowlist Preservation

| Service | LPS source count | services.json count | Status |
|---------|-----------------|---------------------|--------|
| peintre | 20 | 20 | ✅ Exact match |
| menuisier | 6 | 6 | ✅ Exact match |
| macon | 6 | 6 | ✅ Exact match |
| nettoyage | 6 | 6 | ✅ Exact match |
| plombier | null | null | ✅ |
| electricien | null | null | ✅ |
| serrurier | null | null | ✅ |
| climatisation | null | null | ✅ |

**Note on peintre cities_allowlist:** The legacy generator defines all 20 cities explicitly in the allowlist. This is functionally equivalent to null (no restriction) but is preserved verbatim — do not silently set to null without verifying Supabase artisan coverage for all 20 cities under "Peinture" category.

---

### Discrepancies Between LPS and PSEO

The `generate-pseo-v2.js` PRICE_SERVICES object covers only 4 services (plomberie, electricite, serrurerie, climatisation — note: price pages only). The remaining 4 services (peintre, menuisier, macon, nettoyage) exist only in `generate-lps.js`. No conflicts exist between the two sources for the 4 shared services — PRICE_SERVICES only defines `tiers`, `factors`, and `faq` for pricing pages, which are complementary to LPS data.

**No conflicts to resolve between generators.** LPS is the primary and sole source for service identity fields (routing, Supabase, RAFI, situations, content).

---

### Function/Closure Fields Requiring Phase 2 Transformation

The following fields are JavaScript closures in `generate-lps.js` and cannot be stored as executable code in JSON. They are marked with `_is_function: true` companion fields in `services.json` and stored as template strings with `{{placeholder}}` tokens.

| Service | Field | Closure signature | Phase 2 action |
|---------|-------|------------------|----------------|
| all | `faq_flagship` | `(city) => [...]` | Phase 2 template engine resolves `{{city.label}}` etc. at generation time |
| all | `meta_desc` | `(city) => string` | Stored as `meta_desc_template` with `{{city.label}}` placeholder |
| all | `intro_template` | `(city) => string` | Phase 2 template engine resolves at generation time |
| all | `faq` (secondary) | `(city) => [...]` | **DEAD** — confirmed not rendered in current output; not carried into services.json as active field |

**Template placeholder convention (Phase 2):**
- `{{city.label}}` — e.g., "Casablanca"
- `{{city.label_de}}` — e.g., "de Casablanca"
- `{{city.pricing_low}}` — e.g., "150"
- `{{city.pricing_high}}` — e.g., "600"
- `{{city.pricing_note}}` — city-specific pricing context
- `{{city.neighborhoods}}` — neighborhood list string
- `{{city.demand_context}}` — demand pattern sentence

Content-guard runs on the **resolved** string (after placeholder substitution), never on the raw template string. This prevents false positives from placeholder tokens.

---

### Proposed Thresholds Requiring Human Approval

**`min_artisan_threshold = 1` for all 8 services**

This is a V3 policy decision. No threshold was defined in either legacy generator — publishability was implicit (all combinations were generated regardless of artisan count, with some combinations explicitly excluded from the sitemap).

**Rationale for proposed value of 1:** A page with at least 1 referenced artisan profile is considered minimally publishable. This matches the conservative approach: a page with 0 artisans in Supabase renders an empty grid and provides no product value.

**Human decision required:** Is `min_artisan_threshold = 1` acceptable for all 8 services? Or should higher thresholds apply to specific services? For example:
- Emergency services (plombier, serrurier, electricien): threshold = 2 or 3 (a page promising referral with only 1 artisan carries coverage risk)?
- Project services (peintre, menuisier, macon): threshold = 1 is likely sufficient (project work is less time-critical)?

This decision affects which city×service combinations are published. It is documented here and must be confirmed before `publishability.js` (Task 1.5) produces its validation run.

---

### Dead Fields Not Carried into services.json

| Field | Status | Reason |
|-------|--------|--------|
| `faq` (3-question secondary) | DEAD | Confirmed not rendered by current `buildPage()`. Not carried. |
| `urgency_services` | UNCERTAIN/LIKELY DEAD | Defined per service but not found in current HTML output. Documented as `urgency_services_status: UNCERTAIN/LIKELY_DEAD`. Not carried as renderable data. |
| `emergency` (city-level in CITIES) | EXCLUDED | Contains product-truth violations (urgency framing). Excluded from `cities.json` in Task 1.1. Not referenced in services.json. |
| LPS `faq` (secondary closure) | DEAD | Not rendered; not carried. |

---

### Content-Guard Check on Authored Fields

Newly authored text fields in `services.json` (hub_page_intro, meta_desc_template, title_suffix, h1_prefix) scanned against full banned-terms list:

**Result: ZERO violations ✅**

---

### Files Created/Modified in Task 1.2

| File | Action |
|------|--------|
| `seo/data/services.json` | CREATED |
| `seo/docs/phase1-qa-report.md` | UPDATED (this section appended) |

### Files Not Modified

All generators, all HTML, vercel.json, all CSS, all JS, all sitemaps, blog/, cities.json — **zero modifications to any previously existing file**.


---

## Task 1.4 — Implement `content-guard.js`

**Date:** 2026-09-10
**Status:** COMPLETE

### Files Created

| File | Purpose |
|------|---------|
| `seo/generators/shared/content-guard.js` | Content guard module — `check()` and `checkFields()` exports |
| `seo/generators/shared/content-guard.test.js` | Dependency-free self-test runner |

### BANNED_TERMS Inventory (24 terms)

| # | Term |
|---|------|
| 01 | artisan vérifié |
| 02 | artisans vérifiés |
| 03 | artisan qualifié |
| 04 | artisan certifié |
| 05 | électricien certifié |
| 06 | électricien qualifié |
| 07 | plombier qualifié |
| 08 | serrurier qualifié |
| 09 | disponible immédiatement |
| 10 | disponible maintenant |
| 11 | dans l'heure |
| 12 | 24h/7 |
| 13 | 24h/24 |
| 14 | 7j/7 |
| 15 | devis gratuit |
| 16 | intervention gratuite |
| 17 | connecte instantanément |
| 18 | mise en relation instantanée |
| 19 | tarif garanti |
| 20 | prix fixe |
| 21 | prix garanti |
| 22 | disponibilité garantie |
| 23 | réponse garantie |
| 24 | intervention garantie |

### Self-Test Results

**Total tests: 51 — Passed: 51 — Failed: 0**

| Category | Tests | Result |
|----------|-------|--------|
| A — Banned terms (must throw) | 24 | ✅ All threw |
| B — Compliant phrases (must NOT throw) | 9 | ✅ None threw |
| C — Capitalisation variants (must throw) | 6 | ✅ All threw |
| D — Apostrophe variants — U+2019, U+2018 (must throw) | 2 | ✅ All threw |
| E — Q11-approved time wording (must NOT throw) | 2 | ✅ None threw |
| F — Isolated generic words (must NOT throw) | 8 | ✅ None threw |

### Semantic Rules Confirmed

- `disponible` alone → PASSES (not banned)
- `disponibilité` alone → PASSES (not banned)
- `qualifié` alone → PASSES (not banned)
- `garantie` alone (product quality context) → PASSES
- `gratuit` alone → PASSES
- `prix` alone → PASSES
- `intervention` alone → PASSES
- `fixe` alone (adjective) → PASSES
- Q11 form: "Votre demande est enregistrée à toute heure. L'artisan confirme sa disponibilité et le créneau dans les meilleurs délais." → PASSES ✅

### No Existing Production File Modified

Confirmed: zero modifications to any pre-existing file.


---

## Task 1.3 — Author `problems.json` with Compliant Vocabulary

**Date:** 2026-09-10
**Status:** COMPLETE

### Files Created

| File | Action |
|------|--------|
| `seo/data/problems.json` | CREATED — 8 problems, full V3 structure, compliant vocabulary |
| `seo/docs/phase1-qa-report.md` | UPDATED (this section appended) |

### Validation Results

| Check | Result |
|-------|--------|
| JSON syntax valid | ✅ |
| Problem count | ✅ 8 |
| Unique slugs | ✅ No duplicates |
| Required fields present (all 8) | ✅ |
| Valid service_key (all 8) | ✅ |
| Valid parent_service_route (all 8) | ✅ |
| Blog slugs verified to exist on disk | ✅ 20/20 |
| content-guard violations | ✅ ZERO |
| Manual review — unsupported claims | ✅ NONE FOUND |
| Existing production file modified | ✅ NONE |

### Problem → Service → Parent Route Mapping

| Problem | service_key | parent_service_route | Q11 wording |
|---------|-------------|---------------------|-------------|
| fuite-eau | plombier | /plombier | YES |
| wc-bouche | plombier | /plombier | YES |
| chauffe-eau-en-panne | plombier | /plombier | no |
| porte-bloquee | serrurier | /serrurier | YES |
| serrure-cassee | serrurier | /serrurier | YES |
| panne-electrique | electricien | /electricien | YES |
| disjoncteur-saute | electricien | /electricien | no |
| climatisation-en-panne | climatisation | /climatisation | YES |

### Q11 Wording: Used Where Contextually Justified (6 of 8)

| Problem | Q11 used | Justification |
|---------|----------|---------------|
| fuite-eau | YES | Active water leak escalates structurally by the hour — genuine urgency |
| wc-bouche | YES | Sanitation emergency, especially in occupied households |
| chauffe-eau-en-panne | **NO** | Daily discomfort, not structural/safety critical. Q11 would falsely imply guaranteed response speed. |
| porte-bloquee | YES | Being locked out is a genuine emergency — especially at night or with children |
| serrure-cassee | YES | Broken lock = immediate home security compromise |
| panne-electrique | YES | Range from minor trip to serious fault; Q11 accurate without implying guaranteed response speed |
| disjoncteur-saute | **NO** | Recurring/diagnostic situation, not an emergency. No safety hazard in most cases. Q11 would be misleading. |
| climatisation-en-panne | YES | Peak summer heat in Morocco — genuine health risk for elderly/children |

### Dead Legacy Fields Removed from V3 Data Model

| Field | Legacy location | Status | Reason |
|-------|----------------|--------|--------|
| `intro_variants` (array of 2 closures) | `PROBLEMS[x].intro_variants` | **DEAD in V3** | Both variants contained banned terms in ALL 8 problems. V3 uses a single compliant `intro_template` per problem. Variant rotation concept is not carried forward. |
| `meta_desc` (function) | `PROBLEMS[x].meta_desc` | Replaced by `meta_desc_template` | Was a closure `(city) => string`; stored as template string with `{{city.label}}` in V3. |
| `h1` (function) | `PROBLEMS[x].h1` | Replaced by `h1_template` | Same as meta_desc — closure → template string. |
| Title template (hardcoded in generator) | `generate-pseo-v2.js:453` | **BANNED** | `"${prob.label} à ${city.label} — Artisan disponible maintenant \| Fixeo"` — contains banned term `disponible maintenant`. V3 uses `title_template` in problems.json. |
| `body_sections` (inline HTML in generator) | `generateProblemPages()` HTML template | **BANNED + Replaced** | Legacy hardcoded two banned blocks: urgency box `"Disponible 24h/7"` and trust card `"Artisans vérifiés"`. V3 uses explicit `body_sections` array in problems.json with compliant copy. |
| `faq` field in PROBLEMS | Not present in legacy PROBLEMS | N/A | Legacy PROBLEMS had no faq field. The FAQ in PRICE_SERVICES is for price pages only. V3 adds problem-specific `faq` per problem entry. |

### Meaningful Content Changes from Legacy

1. **Title templates**: All 8 legacy titles contained `"Artisan disponible maintenant"` (banned). V3 titles use compliant framing ("plombier référencé disponible", "électricien référencé pour diagnostic", etc.).

2. **Meta descriptions**: All 8 legacy meta_desc functions contained at least one banned term (plombier disponible maintenant, intervention 24h/7, artisan vérifié, devis gratuit, disponible immédiatement). All replaced with compliant copy.

3. **intro_variants**: Both variants were banned for all 8 problems. Selected key facts from legacy variants (city context, technical problem description) were retained; banned claims stripped and rewritten.

4. **Body sections**: Legacy urgency box `"🕐 Disponible 24h/7 à [city]"` and trust card `"Artisans vérifiés"` replaced by compliant `"Profils référencés"` and `"Tarif confirmé avant intervention"`.

5. **FAQ**: Newly authored — not present in legacy PROBLEMS. Each problem has 3–4 genuinely problem-specific FAQ questions.

6. **Problem-specificity**: Each of the 8 problems is substantively different:
   - fuite-eau: joint/tuyau/raccord diagnostic, structural damage framing, how to shut water
   - wc-bouche: ventouse vs furet distinction, obstruction types, prevention advice
   - chauffe-eau-en-panne: brand knowledge (Maroc market), repair vs replace threshold, calcaire context
   - porte-bloquee: non-destructive opening techniques, whether to replace after opening
   - serrure-cassee: cylinder certification (A2P), single-visit replacement stock
   - panne-electrique: ONE/RADEEF compteur context, when to cut power
   - disjoncteur-saute: under-dimensioned installation diagnosis, when not to rearm in a loop
   - climatisation-en-panne: brand knowledge (Maroc market), repair vs replace at age thresholds, seasonal demand context

### content-guard Result

Scanned fields: `title_template`, `meta_desc_template`, `h1_template`, `intro_template`, all `body_sections` text (steps, cards, items, section titles), all `faq` questions and answers — with `{{city.label}}` resolved to `"Casablanca"` for accurate matching.

**Result: ZERO violations ✅**


---

## Task 1.7 — Artisan Coverage Snapshot (`artisan-counts.json`)

**Date:** 2026-09-10
**Status:** COMPLETE

### Files Created

| File | Action |
|------|--------|
| `seo/data/artisan-counts.json` | CREATED — 20×8 matrix, 160 cells |
| `seo/docs/phase1-qa-report.md` | UPDATED (this section) |

---

### 1. Live Eligibility Filter Contract (extracted from `js/fixeo-local-flagship-v1.js`)

Source: `fixeo-local-flagship-v1.js` lines 400–407

```js
client
  .from('artisans')
  .select('id, legacy_id, name, city, category, verified, description, photo_url, price_from, price_label')
  .ilike('city', '%' + ctx.city + '%')         // substring match, case-insensitive
  .ilike('category', ctx.cat + '%')             // PREFIX match, case-insensitive
  .order('rating', { ascending: false })        // display order only
  .limit(MAX_CARDS);                            // MAX_CARDS=3 — display only
```

**Where:**
- `ctx.city = city.label.toLowerCase().trim()` (e.g. `"casablanca"`)
- `ctx.cat  = supabase_category.toLowerCase()` (e.g. `"plomberie"`)

**No additional filters exist:**

| Filter type | Present in live query? |
|------------|----------------------|
| `status` / `active` | ❌ NOT PRESENT |
| `verified = true` | ❌ NOT PRESENT (`verified` fetched for card display only) |
| `claimed` / `unclaimed` | ❌ NOT PRESENT |
| `onboarding_complete` | ❌ NOT PRESENT |
| `public_visibility` | ❌ NOT PRESENT |
| Minimum `rating` | ❌ NOT PRESENT |

**Important product-truth implication:** The `verified` field is fetched from the `artisans` table but is **not used as an eligibility filter** — it is used only to conditionally render a badge on the artisan card. As of the snapshot, `verified = false` for essentially all rows in the DB (all sampled rows returned `false`). V3 vocabulary uses "profils référencés" not "artisans vérifiés".

---

### 2. Supabase Access Method

- **Endpoint:** `https://ztwtbgoqanqzvwiibtuh.supabase.co`
- **Key type:** Public publishable key (already embedded in browser-served JS; not a secret)
- **Method:** REST API, `GET /rest/v1/artisans?select=id,city,category`, paginated at 1000 rows/page
- **Mode:** READ ONLY. No mutations, no RPC, no schema changes.
- **Total rows fetched:** 1,383

---

### 3. City and Service Mapping Rules

**City matching:** `ilike(city, '%{city.label.toLowerCase()}%')` — case-insensitive substring of the canonical `label` field from `cities.json`.

**⚠️ Accent gap identified:** Several DB city values are stored without accents (e.g. `"Temara"` vs canonical label `"Témara"`; `"Tetouan"` vs `"Tétouan"`). The live query `ilike('%témara%')` does **not** match the DB value `"Temara"` — this is a live production data quality issue, not a V3 error. The count matrix faithfully replicates this live behavior. Artisans stored under `"Temara"` (14 rows) are currently invisible to the live SEO page for Témara.

**Service (category) matching:** `ilike(category, '{prefix}%')` — case-insensitive prefix. Prefix map (lowercased supabase_category from services.json):

| V3 service_key | category prefix | Matches |
|---------------|-----------------|---------|
| plombier | plomberie | Plomberie, Plomberie Chauffage |
| electricien | électricité | Électricité |
| serrurier | serrurerie | Serrurerie |
| climatisation | climatisation | Climatisation |
| peintre | peinture | Peinture |
| menuisier | menuiserie | Menuiserie, Menuiserie /, Menuiserie Artisanale, Menuiserie Bois, Menuiserie Inox, Menuiserie MDF, Menuiserie Mobilier, Menuiserie bois |
| macon | maçonnerie | Maçonnerie |
| nettoyage | nettoyage | Nettoyage |

---

### 4. Full Matrix Validation

| Check | Result |
|-------|--------|
| JSON valid | ✅ |
| City keys | ✅ 20 |
| Service keys per city | ✅ 8 |
| Total cells | ✅ 160 |
| All counts non-negative integers | ✅ |
| Zero-count cells explicitly present | ✅ |
| No publishability decision made | ✅ |
| min_artisan_threshold not modified | ✅ |

---

### 5. Count Matrix

| City | plombier | electricien | serrurier | climatisation | peintre | menuisier | macon | nettoyage | **City total** |
|------|----------|-------------|-----------|---------------|---------|-----------|-------|-----------|---------------|
| casablanca | 69 | 117 | 9 | 32 | 23 | 225 | 4 | 17 | **496** |
| rabat | 10 | 15 | 3 | 7 | 2 | 5 | 3 | 1 | **46** |
| marrakech | 15 | 44 | 9 | 13 | 13 | 29 | 6 | 2 | **131** |
| fes | 3 | 12 | 0 | 1 | 1 | 15 | 0 | 0 | **32** |
| tanger | 57 | 12 | 3 | 16 | 1 | 6 | 1 | 4 | **100** |
| agadir | 10 | 10 | 0 | 1 | 0 | 11 | 0 | 7 | **39** |
| meknes | 6 | 2 | 1 | 5 | 2 | 5 | 0 | 0 | **21** |
| oujda | 4 | 5 | 0 | 4 | 0 | 6 | 0 | 1 | **20** |
| kenitra | 3 | 7 | 0 | 4 | 4 | 1 | 0 | 1 | **20** |
| temara | 1 | 1 | 0 | 1 | 0 | 3 | 0 | 0 | **6** |
| sale | 4 | 10 | 0 | 20 | 1 | 19 | 1 | 1 | **56** |
| mohammedia | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | **1** |
| el-jadida | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | **3** |
| beni-mellal | 2 | 3 | 0 | 0 | 1 | 1 | 0 | 0 | **7** |
| khouribga | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| safi | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **1** |
| nador | 2 | 3 | 0 | 2 | 0 | 1 | 0 | 0 | **8** |
| taza | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **1** |
| ouarzazate | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **1** |
| tetouan | 10 | 3 | 1 | 0 | 0 | 0 | 0 | 0 | **14** |
| **Service total** | **199** | **247** | **26** | **106** | **48** | **328** | **15** | **34** | **1003** |

---

### 6. Distribution

| Bucket | Cell count | % of 160 |
|--------|-----------|----------|
| 0-artisan | 74 | 46.3% |
| 1-artisan | 24 | 15.0% |
| 2-artisan | 7 | 4.4% |
| 3+-artisan | 55 | 34.4% |

**46.3% of the 160 combinations have zero artisans under the live filter.** This is a critical input for the threshold policy decision (human review after Task 1.7).

---

### 7. Zero-Count Combinations (74 cells)

Complete list: fes×serrurier, fes×macon, fes×nettoyage, agadir×serrurier, agadir×peintre, agadir×macon, meknes×macon, meknes×nettoyage, oujda×serrurier, oujda×peintre, oujda×macon, kenitra×serrurier, kenitra×macon, temara×serrurier, temara×peintre, temara×macon, temara×nettoyage, sale×serrurier, mohammedia×plombier, mohammedia×electricien, mohammedia×serrurier, mohammedia×climatisation, mohammedia×peintre, mohammedia×macon, mohammedia×nettoyage, el-jadida×plombier, el-jadida×serrurier, el-jadida×climatisation, el-jadida×peintre, el-jadida×menuisier, el-jadida×macon, el-jadida×nettoyage, beni-mellal×serrurier, beni-mellal×climatisation, beni-mellal×macon, beni-mellal×nettoyage, khouribga×all 8 services, safi×electricien, safi×serrurier, safi×climatisation, safi×peintre, safi×menuisier, safi×macon, safi×nettoyage, nador×serrurier, nador×peintre, nador×macon, nador×nettoyage, taza×electricien, taza×serrurier, taza×climatisation, taza×peintre, taza×menuisier, taza×macon, taza×nettoyage, ouarzazate×electricien, ouarzazate×serrurier, ouarzazate×climatisation, ouarzazate×peintre, ouarzazate×menuisier, ouarzazate×macon, ouarzazate×nettoyage, tetouan×climatisation, tetouan×peintre, tetouan×menuisier, tetouan×macon, tetouan×nettoyage

**Full zero cities: khouribga** (all 8 services = 0). **Near-zero: mohammedia** (7/8 services = 0; menuisier = 1). **safi, taza, ouarzazate** (7/8 services = 0; plombier = 1 each).

---

### 8. Unknown / Unmapped Values

**Unmapped categories (203 rows, 14.7% of DB):**
Top: Aluminium (43), Déménagement (18), Construction (17), Vernissage bois (15), Transport (11), Jardinage (11), Marbre (10), Bricolage (10), Carrelage (10), Étanchéité (8), Fer forgé (7), Maintenance (7), Placo (7), Multi-service (5), null (5), plus 14 others.

These do not prefix-match any of the 8 canonical service keys and are correctly excluded from all matrix counts. No coercion performed.

**Unmapped city values (195 rows, 14.1% of DB):**
Top: "Ville à qualifier" (55), "Unknown" (42), "Aïn Harrouda" (16), "Temara" (14 — accent gap, see below), "Sud Maroc" (13), "Khénifra" (12), "Driouch" (7), "Kelaa" (7), "Dar Bouazza" (6), plus 16 others.

**⚠️ Accent gap — "Temara" (14 rows):** The DB stores `"Temara"` (no accent). Canonical label is `"Témara"` (accented). `ilike('%témara%')` does not match `"Temara"` — these 14 rows are currently invisible to the live SEO pages for Témara, and are correctly excluded from the matrix (faithful to live behavior). This is a **data quality issue in the artisan DB**, not a V3 defect. Recommendation for human review: a data cleanup pass to normalize `"Temara"` → `"Témara"` would unlock these artisans on the live pages.

---

### 9. Plausibility Check

| Metric | Value |
|--------|-------|
| DB total rows | 1,383 |
| Matrix grand total | 1,003 |
| Unmapped category rows | ~203 |
| Unmapped city rows | ~195 |
| Rows excluded (both city + category unmapped — overlap) | ~177 (est.) |
| Rows excluded from matrix (net) | ~380 |

Explanation for `grand total (1,003) < DB rows (1,383)`:
- Rows with city not substring-matching any of the 20 canonical city labels are excluded entirely (195 rows partially overlap with unmapped categories)
- Rows with category not prefix-matching any canonical service are excluded entirely (203 rows)
- Some rows are excluded by both city AND category not matching
- A single artisan row can only be counted in ONE service column (category prefix match is specific)
- A single artisan row could theoretically be counted in MULTIPLE city columns if its city value substring-matches more than one canonical label (rare but possible — e.g. a city value "Salé / Casablanca" would match both salé and casablanca)

The matrix grand total (1,003) accounts for 72.5% of the 1,383 DB rows. The remaining ~380 rows are artisans with unqualified or out-of-scope city/service data. This is consistent with the known DB quality state (many "Ville à qualifier" and "Unknown" entries).

---

### 10. No Publishability Decision Made

This task is data collection only. The threshold policy (min_artisan_threshold per service) will be decided by human review after this snapshot, before Task 1.5 (`publishability.js`) is approved.

`min_artisan_threshold` values in `services.json` remain unchanged at provisional `1`.


---

## Task 1.5 — Publishability Policy (`publishability.js`)

**Date:** 2026-09-10
**Status:** COMPLETE

### Files Created

| File | Action |
|------|--------|
| `seo/generators/shared/publishability.js` | CREATED |
| `seo/docs/phase1-qa-report.md` | UPDATED (this section) |

---

### 1. Decision Model and API

**Module:** `seo/generators/shared/publishability.js`

**Constants:**
- `NEW_THRESHOLD = 3` — minimum artisan count for a new (non-preserved) page

**Status values:**
| Status | Meaning |
|--------|---------|
| `publish` | New combination meeting all criteria — safe to publish |
| `preserve` | Existing URL with ≥1 artisan — SEO equity retained, do not destroy |
| `review` | Existing URL with 0 artisans — flag for human decision; do NOT auto-retire |
| `block` | Must not be published or indexed |

**Return shape:** `{ publishable: boolean, status: string, reason: string }`

**API:**
```js
const { decide, runMatrix, buildPreservedSet, simulateThreshold, NEW_THRESHOLD, STATUS } = require('./publishability');

// Single decision
decide(citySlug, serviceKey, count, isPreserved, citiesData, servicesData)

// Full 20×8 matrix
runMatrix(citiesData, servicesData, countsData, preservedSet)

// Build preserved set from existing HTML filenames
buildPreservedSet(servicesData, existingFiles)  // handles multi-word slugs (beni-mellal, el-jadida)

// Threshold simulation (new combinations only)
simulateThreshold(matrixResults, threshold)
```

**Decision logic (6 cases):**

| Case | Condition | Status | publishable |
|------|-----------|--------|------------|
| 1 | Unknown city or service | block | false |
| 2 | city.publishable ≠ true (new combo) | block | false |
| 3 | New combo, count < 3 | block | false |
| 4 | New combo, count ≥ 3 + city.publishable = true | **publish** | **true** |
| 5 | Existing URL, count ≥ 1 | **preserve** | **true** |
| 6 | Existing URL, count = 0 | review | **false** (do NOT auto-retire) |

---

### 2. Validation Results

| Check | Result |
|-------|--------|
| 160 cells covered | ✅ |
| Sum = 160 | ✅ |
| Preserved set = 118 | ✅ |
| No unknown status | ✅ |
| khouribga×plombier (preserved, count=0) → review | ✅ |
| casablanca×plombier (preserved, count=69) → preserve | ✅ |
| beni-mellal×plombier (preserved, count=2) → preserve | ✅ |
| el-jadida×electricien (preserved, count=3) → preserve | ✅ |
| meknes×menuisier (new, count=5) → publish | ✅ |
| Multi-word city slug parsing (beni-mellal, el-jadida) | ✅ |

---

### 3. Current 160-Cell Distribution

| Status | Count | Description |
|--------|-------|-------------|
| **preserve** | 74 | Existing URLs with ≥1 artisan — SEO equity intact |
| **review** | 44 | Existing URLs with 0 artisans — human decision needed |
| **block** | 38 | New combinations below threshold |
| **publish** | 4 | New combinations with ≥3 artisans |
| **TOTAL** | **160** | |

**Publish cells (new combinations, count ≥ 3):**
- meknes × menuisier (count=5)
- oujda × menuisier (count=6)
- temara × menuisier (count=3)
- sale × menuisier (count=19)

*(Note: el-jadida×electricien count=3 and beni-mellal×electricien count=3 are PRESERVED — they already have existing HTML files — so they are `preserve`, not `publish`.)*

---

### 4. Threshold Simulation (New Combinations Only — 42 cells)

| Threshold | Would publish | Would block | Notes |
|-----------|--------------|-------------|-------|
| 1 | 12 | 30 | Allows pages with 1 artisan |
| 2 | 4 | 38 | Allows pages with ≥2 artisans |
| **3 (approved)** | **4** | **38** | Current policy |

Existing URLs (preserve + review) are **not affected** by the threshold — their fate is governed by the preserve/review logic, not by this threshold.

---

### 5. How Existing SEO Equity Is Protected

`buildPreservedSet()` parses the 118 existing `{service}-{city}.html` files in the repository root. Any combination present in this set bypasses the `NEW_THRESHOLD` gate entirely:

- If count ≥ 1 → `preserve` (page lives, SEO equity retained)
- If count = 0 → `review` (page is flagged, NOT automatically retired, redirected, or noindexed)

A `review` result means: "a human must inspect this combination before any destructive action." The module never destroys an existing URL automatically.

---

### 6. How Future Cities Are Blocked by Default

Future cities added to `cities.json` default to `publishable: false`. The `decide()` function short-circuits for new combinations when `city.publishable !== true`, returning `block` with reason `"city-not-publishable"`. No new page can become indexable without an explicit `publishable: true` flag in `cities.json`.

All 20 current production cities are `publishable: true` — they were set during Task 1.1.

---

### 7. Temara/Témara Alias Note

**Issue:** Supabase DB stores 14 artisan rows with city `"Temara"` (no accent). Canonical label is `"Témara"` (accented). The live `ilike('%témara%')` query does not match `"Temara"` — these rows are invisible on live Témara pages.

**Impact on publishability:**
- `temara` counts in `artisan-counts.json` reflect this live behavior (undercounted by ~14 artisans)
- `temara × serrurier` = 0 → `review` status (existing URL)
- `temara × menuisier` = 3 → `publish` status (new combination)

**V3 resolution planned:** A future city-alias layer will allow `"Temara"` and `"Témara"` to resolve to the same canonical city at query time — no DB mutation required. This is documented here and in the Task 1.7 section.

**What is NOT done:** No modification to Supabase, no alteration of `artisan-counts.json` to hide the mismatch, no special-casing in `publishability.js`.

---

### 8. Note on services.json min_artisan_threshold

The `min_artisan_threshold = 1` provisional values in `services.json` remain unchanged. The publishability policy is now implemented in `publishability.js` with `NEW_THRESHOLD = 3`. The two do not conflict — `services.json` carries the provisional field as documentation; the `publishability.js` module is the authoritative runtime source for policy decisions. No data-model adjustment to `services.json` is required for Task 1.5 to function.


---

## Task 1.6 — Quartier Retirement Strategy

**Date:** 2026-09-10
**Status:** COMPLETE (documentation only — `vercel.json` not modified)

### Files Created

| File | Action |
|------|--------|
| `seo/docs/quartier-decision.md` | CREATED — full retirement specification |
| `seo/docs/phase1-qa-report.md` | UPDATED (this section) |

### Validation

| Check | Result |
|-------|--------|
| quartier HTML files count | ✅ 111 (37 plombier + 37 electricite + 37 serrurerie) |
| Service families | ✅ plombier, electricien, serrurier |
| Current vercel.json rewrite rules verified | ✅ 3 rewrite rules match documented state exactly |
| Future redirect rules use correct syntax | ✅ `src` + `headers.Location` + `status: 301` |
| `$2` (quartier) discarded in destination | ✅ destination = `/{service}/$1` only |
| No redirect chain introduced | ✅ 3-segment → 301 → 2-segment (one hop; 2-segment is a transparent rewrite) |
| No production file modified | ✅ |

### Phase Boundary Confirmed

Task 1.6 = documentation only. `vercel.json` modification = Phase 3 only.


---

## Task 1.8 — Legacy Artisan Data Dependency Trace

**Date:** 2026-09-10
**Status:** COMPLETE (read-only investigation — no files modified)

### Files Created

| File | Action |
|------|--------|
| `seo/docs/artisans-master-trace.md` | CREATED — full dependency trace |
| `seo/docs/phase1-qa-report.md` | UPDATED (this section) |

### Key Findings

| Question | Answer |
|----------|--------|
| What reads `artisans-master.json`? | Only: the loader itself (inactive), disabled HTML comments (×2), a documentation comment in `fixeo-supabase-loader.js`, and one offline Node.js pricing test |
| Which pages load `fixeo-artisans-master-loader.js`? | **Zero active pages.** Disabled on `index.html` and `admin.html` via HTML comment |
| SEO artisan source | **Supabase only** — via `fixeo-local-flagship-v1.js` + `FixeoSupabaseClient` |
| Active consumers of `fixeo-supabase-loader.js` | 6 non-SEO pages: `index.html`, `artisans.html`, `artisan-profile.html`, `admin.html`, `dashboard-artisan.html`, `dashboard-client-v1.html` |
| Active consumers of `fixeo-local-flagship-v1.js` | 349 SEO HTML pages |
| Fallback to `artisans-master.json` possible? | **NO** — no code path exists |
| Generator dependency on `artisans-master.json`? | **NO** — zero references in any generator script |
| Deletion risk: `artisans-master.json` | Low for production; blocks pricing test 16 (offline test only) |
| Deletion risk: `fixeo-artisans-master-loader.js` | **Negligible** — zero active references |
| V3 canonical data source | **Supabase** |
| V3 new dependency on legacy JSON? | **Prohibited** (Phase 2 architectural rule) |


---

## Task 1.9 — Blog Product-Truth Vocabulary Audit

**Date:** 2026-09-10
**Status:** COMPLETE (audit only — no files modified)

### Files Created

| File | Action |
|------|--------|
| `seo/docs/blog-vocabulary-audit.md` | CREATED — full vocabulary audit |
| `seo/docs/phase1-qa-report.md` | UPDATED (this section) |

### Key Findings Summary

| Metric | Value |
|--------|-------|
| Blog pages audited | 121 (`blog/*.html`) + 1 (`blog-index.html`) = **122 total** |
| Content-guard candidate hits | 447 phrase×file hits, 13 unique phrases, 121/121 files affected |
| Category A (direct violations) | 6 unique patterns |
| Category B (contextual/generic) | 5 patterns — NOT violations |
| Category C (ambiguous/human review) | 3 patterns — `artisan-verifie-maroc.html` article premise; `court-circuit-maison.html` meta; `urgence casablanca 24h/7` link label |
| Category D (technical/non-indexable) | 0 |

### Highest-Impact Violations

| Violation | Pages | Origin |
|-----------|-------|--------|
| `devis gratuit` in CTA | **121** | Shared generator template |
| `artisans vérifiés disponibles` in nav CTA | **121** | Shared generator template |
| `artisan vérifié` in inline CTA | **~121** | Shared generator template |
| `artisan certifié Fixeo` in inline CTA | **50** | Shared generator template |
| `disponible maintenant` + `en moins de 2h` | **5** | Shared urgency CTA template |
| `24h/7`/`24h/24`/`7j/7` in JSON-LD | **5** | Per-article editorial |

### Root Cause

> 95% of violations are template-origin (4 shared CTA blocks injected by the blog generator). Not mass editorial failures — a template design problem.

### Remediation Scope

- **Mass regeneration: NOT required**
- Generator template fix (T1–T4 blocks): 1 fix → corrects ~121 pages
- Surgical per-file edits: 8–10 files
- Human review before correction: `artisan-verifie-maroc.html` article premise
- Phase 2 action: fix generator templates → regenerate → surgical edits


---

## Task 1.10 — Legacy Blog Generator Dependency Verification

**Date:** 2026-09-10
**Status:** COMPLETE (investigation only — no files modified)

### Files Changed

| File | Action |
|------|--------|
| `seo/docs/phase1-qa-report.md` | UPDATED (this section) |

No dedicated documentation file created (findings are self-contained and do not require a separate document beyond this section).

---

### 1. Exact Role of `scripts/generate-blog.js` (v1)

`scripts/generate-blog.js` (bloggen-v1a, 2026-06-12) is the **original blog generator**. It reads `blog/_content/*.json` and produces `blog/{slug}.html` + `blog-index.html` + sitemap entries.

**Current corpus contribution: ZERO.**

The generator emits `<meta name="generator" content="fixeo-bloggen-v1a">`. Not a single current `blog/*.html` file carries this tag. The entire current blog corpus was produced by:
- **`generate-authority-blog-v3.js`** (authority-v3a/v3b): 100 files (from `blog/_content/authority/`)
- **`generate-blog-v2.js`** (bloggen-v2a): 21 files (from `blog/_content/` root)

The 21 root-`_content` files include 5 urgency pages that show `generator=fixeo-bloggen-v2a` but include structural elements (`blog-intro-cta`, `blog-article-v3.css`) that do not appear in the current `generate-blog-v2.js` source. These pages were likely regenerated by a transitional state of one of the generators before the current source versions were committed; the generator tag was not updated. **This is a generator-tag/artifact mismatch, not a v1 artifact.** `generate-blog.js` (v1) produced none of them.

---

### 2. Reference Count and Context

| Identifier | Refs found | Active invocation |
|------------|-----------|-------------------|
| `generate-blog.js` (v1) | 3 | **0** — all self-references in the file's own comments and usage string; 1 in `seo/docs/artisans-master-trace.md` (table cell, documentation) |
| `generate-blog-v2.js` | 1 | **0** — 1 self-reference in artisans-master-trace.md (table cell) |
| `generateBlog` (function symbol) | 0 | 0 |

No reference in: `package.json` (absent), CI/CD workflows (`.github/` absent), `Makefile` (absent), shell scripts (absent), `vercel.json` (build/installCommand both null), other generators, runtime JS, HTML pages, tests.

---

### 3. Build/Deployment Dependency Result

`vercel.json` has no `buildCommand`, no `installCommand`, no `framework`. Vercel deploys the repository as a static site. **No generator is invoked at deploy time.** All HTML files are pre-generated and committed. `generate-blog.js` (v1) is never called by any automated process.

---

### 4. Current Generator Ownership (Source of Truth)

| Generator | Content source | Files produced | Template blocks |
|-----------|---------------|----------------|-----------------|
| `generate-authority-blog-v3.js` | `blog/_content/authority/*.json` (100 files) | 100 `blog/*.html` | T1 (sidebar CTA), T3 (intro CTA via `CATEGORY_CTA` + `DEFAULT_CTA`), shared footer CTA |
| `generate-blog-v2.js` | `blog/_content/*.json` root (21 files) | 21 `blog/*.html` | T2 (footer CTA block "artisan vérifié / devis gratuit"), T1 (sidebar "artisans vérifiés disponibles") |
| `generate-blog.js` (v1) | `blog/_content/*.json` root | **0** current files | — |

---

### 5. Exact Owner of T1–T4 Template Blocks

| Block | Description | Owner file | Location |
|-------|-------------|------------|----------|
| **T1** — Sidebar CTA: `"Artisans vérifiés disponibles dans votre ville"` | Injected into every page's sidebar | **Both** `generate-blog-v2.js` (line 519) and `generate-authority-blog-v3.js` (line 501) | `blog-sidebar-widget` div |
| **T2** — Footer CTA: `"Besoin d'un artisan vérifié … devis gratuit … professionnels qualifiés"` | Post-article CTA block | **`generate-blog-v2.js`** (lines 490–493) + **`generate-authority-blog-v3.js`** (lines 476–477) | `blog-cta-v2` div after author block |
| **T3A** — Generic inline CTA (generic pages) | `"Trouver un artisan vérifié … artisan certifié … devis gratuit"` mapped to DEFAULT_CTA | **`generate-authority-blog-v3.js`** line 90 (`DEFAULT_CTA`) | `blog-intro-cta` injected after intro section |
| **T3B** — Plomberie inline CTA | `"Trouver un plombier vérifié … devis gratuit, artisan certifié Fixeo"` | **`generate-authority-blog-v3.js`** line 85 (`CATEGORY_CTA.plomberie`) | `blog-intro-cta` injected after intro section |
| **T3C** — Électricité/Serrurerie/Clim inline CTA | Same CATEGORY_CTA structure | **`generate-authority-blog-v3.js`** lines 86–89 | Same |
| **T4** — Urgency banner: `"Artisan disponible maintenant, intervention en moins de 2h"` | Appears in 5 urgency blog pages; `generator=fixeo-bloggen-v2a` tag present but structural elements (`blog-intro-cta`, `blog-article-v3.css`) match authority-v3 template | **Source ambiguous** — likely generated by a transitional version of a generator, or the urgency JSON was run through authority-v3 despite being in the root `_content/` directory. The T4 desc string does not appear in any current generator source file. It was either: (a) previously in `CATEGORY_CTA` for an `urgence` key that was later removed, or (b) manually patched post-generation. |

**Critical Phase 2 implication:** T4 does not exist in any current generator source. The 5 urgency pages carrying this phrase require **per-file surgical edits** regardless of generator template fixes.

---

### 6. Unique Logic in `generate-blog.js` (v1) vs V2

| Feature | v1 | v2 |
|---------|----|----|
| Reads `blog/_content/*.json` root | ✅ | ✅ |
| Reading time badge | ❌ | ✅ |
| Table of contents | ❌ | ✅ |
| FAQ accordion (details/summary) | ❌ | ✅ |
| Related articles section | ❌ | ✅ |
| Author block | ❌ | ✅ |
| JSON-LD (Article + FAQ + Breadcrumb) | ❌ | ✅ |
| OG + Twitter card meta | ❌ | ✅ |
| Canonical URL | Basic | Full clean URL |
| Internal LP link injection | ❌ | ✅ |
| CSS: `blog-v2.css` | ❌ | ✅ |
| `blog-index.html` generation | ✅ | ✅ |
| Sitemap update | ✅ | ✅ |
| Generator meta tag | `fixeo-bloggen-v1a` | `fixeo-bloggen-v2a` |

**v1 has NO unique logic not present in v2.** It is a strict subset of v2 functionality. All v2 capabilities supersede v1.

---

### 7. Archive Safety Assessment

Deleting or moving `scripts/generate-blog.js` (v1) today would break:

| Surface | Impact |
|---------|--------|
| Production HTML | **None** — v1 produced 0 current files |
| Blog regeneration | **None** — v2 and authority-v3 handle all 121 articles |
| Deployment | **None** — no build step calls any generator |
| Tests | **None** — no test references found |
| Tooling/maintenance | **None** — no cross-references found |
| Developers | **Minimal** — source comment in v2 says "V2 — Enhanced blog generator"; v1 is the implied predecessor. Moving it to `scripts/legacy/` makes this history explicit without losing it. |

**Archive is safe.** No production or operational workflow blocks it.

---

### 8. Conditions Required Before Phase 2 Archival

The following must be confirmed/completed before the archive move:

1. ✅ **Current generator ownership confirmed** — `generate-authority-blog-v3.js` (100 files) + `generate-blog-v2.js` (21 files); v1 produces 0 files.
2. ✅ **Unique logic check** — v1 has no unique logic not present in v2.
3. ⏳ **Task 1.9 template remediation source identified** — T1/T2 owners identified (both v2 and authority-v3); T3 owner (authority-v3); T4 owner ambiguous (manual patch or removed CATEGORY_CTA key — per-file surgical fix required). Phase 2 must correct v2 + authority-v3 generator templates.
4. ✅ **Rollback path documented** — see §9 below.

**Archival is authorized for Phase 2 once the above conditions are verified.** No further human approval is required to execute the move in Phase 2 (it was pre-approved in the Task 1.10 planning).

---

### 9. Rollback Procedure

If archived and later needed:

```bash
git mv scripts/legacy/generate-blog-v1.js scripts/generate-blog.js
git commit -m "revert: restore generate-blog.js from legacy archive"
```

No data is lost; the file is preserved in git history at all times.

---

### 10. Whether Task 1.10 Changes Any Production File

**No production file modified.** Task 1.10 is investigation + documentation only. `scripts/generate-blog.js` is not moved, renamed, or modified in this task.

---

### Task 1.10 Validation Summary

| Check | Result |
|-------|--------|
| `generate-blog.js` (v1) active production dependency | **NONE** |
| Referenced by package.json / CI / deployment | **NO** (no package.json, no CI, no build command) |
| Current blog files produced by v1 | **0 / 121** |
| Current blog files produced by v2 | **21 / 121** |
| Current blog files produced by authority-v3 | **100 / 121** |
| v1 has unique logic not in v2 | **NO** |
| T1 owner | `generate-blog-v2.js` + `generate-authority-blog-v3.js` |
| T2 owner | `generate-blog-v2.js` + `generate-authority-blog-v3.js` |
| T3 owner | `generate-authority-blog-v3.js` (`CATEGORY_CTA` + `DEFAULT_CTA`) |
| T4 owner | **Ambiguous** — not in current generator source; 5 urgency pages require per-file surgical fix |
| Archive safe today | **YES** |
| Move performed in Task 1.10 | **NO** (Phase 2 only) |


---

## Phase 1 Final QA — Consistency Check

**Date:** 2026-09-10
**Outcome:** **PASS WITH DOCUMENTATION NOTE**

---

### Automated Checks

| Section | Check | Result |
|---------|-------|--------|
| A. Cities | 20 cities, unique slugs, all publishable=true, nearby valid, no self-ref | ✅ |
| B. Services | 8 services, unique keys, supabase_category present, supersession documented | ✅ |
| C. Problems | 8 problems, unique slugs, service_key valid, all V3 fields present, blog_links exist, zero guard violations | ✅ |
| D. Artisan Counts | 160 cells, all non-negative integers, snapshot framing correct | ✅ |
| E. Publishability | All 6 cases pass, distribution=160, NEW_THRESHOLD=3 | ✅ |
| F. Content Guard | 51/51 tests pass, banned terms throw, compliant phrases pass, generic isolated words pass | ✅ |
| G. Quartier | 111 files (37×3), 3 rewrites in vercel.json, no Phase 3 redirect yet, no /$2 in client-facing dest | ✅ |
| H. Artisan Source | Flagship on 349 pages, master loader disabled, legacy files present | ✅ |
| I. Blog | 121 files, 121 sitemap entries, v3a=100/v2a=21/v1a=0 | ✅ |
| J. Legacy Generator | generate-blog.js present, not archived, not in vercel.json | ✅ |
| K. Cross-file | No stale contradictions; two regex false-positives verified harmless (see note below) | ✅ |
| L. Git Scope | No unintended staged changes; 6 pricing files unstaged as expected | ✅ |

---

### K — False Positive Clarifications

**artisans-master-trace.md pattern match:** Sentence reads "Test 16 reads `artisans-master.json` via `fs.readFileSync`; would fail **if file deleted**." This is a hypothetical risk statement, not a record that deletion occurred. File is confirmed present on disk.

**blog-vocabulary-audit.md pattern match:** The document correctly *classifies* "artisan vérifié Fixeo" as a FIXEO product-truth violation (Category A) — i.e., it identifies it as an unsupported claim made by the current blog content. This is the intended output of the audit. No stale assumption.

---

### services.json — `min_artisan_threshold` Field Note

The `_min_artisan_threshold_note` on each service still reads "proposed … Flag for human approval." This wording predates the Task 1.5 approval. For clarity:

**Supersession statement (final, as of 2026-09-10):**

> The `min_artisan_threshold` field in `services.json` was set to `1` provisionally during Task 1.2 and flagged for human approval. That approval occurred via Task 1.7 → Task 1.5. The approved final policy is implemented in `seo/generators/shared/publishability.js`:
> - **New combinations:** `NEW_THRESHOLD = 3` (must have ≥3 artisans AND `city.publishable = true`)
> - **Existing/preserved URLs:** governed by preserve/review logic; `min_artisan_threshold` does not apply
>
> The `min_artisan_threshold = 1` value in `services.json` is a **documentation artifact only**. It must not be used as a publishability gate by any V3 code. `publishability.js` is the sole authoritative runtime policy module.

No modification to `services.json` is required — the `_min_artisan_threshold_note` field is documentation metadata, not runtime logic.

---

### Final Canonical Phase 1 Decisions

| Decision | Value |
|----------|-------|
| Production cities | 20 |
| Canonical services | 8 |
| Problem slugs | 8 |
| Artisan count matrix | 20 × 8 = 160 cells |
| Publishability threshold (new) | `NEW_THRESHOLD = 3` |
| Publishability (existing URL, count ≥1) | preserve |
| Publishability (existing URL, count = 0) | review (no auto-retire) |
| Artisan vocabulary | "artisan référencé", "professionnel référencé", "profils référencés sur FIXEO" |
| 24/7 wording | Form submission only; artisan availability/response claims banned |
| Artisan data source | Supabase (via `fixeo-local-flagship-v1.js`) |
| Blog generators active | `generate-authority-blog-v3.js` (100 files) + `generate-blog-v2.js` (21 files) |
| Blog generator to archive in Phase 2 | `scripts/generate-blog.js` → `scripts/legacy/generate-blog-v1.js` |
| T1–T3 template violation source | `generate-authority-blog-v3.js` + `generate-blog-v2.js` |
| T4 urgency violation source | Ambiguous (no current generator source); 5 files require surgical per-file fix |
| Quartier redirects | Phase 3 only; 3 rewrite rules currently in vercel.json |
| Quartier HTML files | 111 retained as rollback assets |
| Schema target | `Organization + Service + BreadcrumbList` (NOT `LocalBusiness`) |
| CTA destination | `/?service=…&city=…#hero-quick-search` (human-readable labels) |
| CSS policy | `artisan-card-v3.css` new; `artisan-card-conversion-v1.css` frozen |

---

### Phase 1 Completion Status

**All 10 Phase 1 tasks are complete and approved:**
1.1 cities.json · 1.2 services.json · 1.3 problems.json · 1.4 content-guard ·
1.5 publishability · 1.6 quartier-decision · 1.7 artisan-counts · 1.8 artisans-master-trace ·
1.9 blog-vocabulary-audit · 1.10 legacy-generator-verification

**Phase 2 is safe to start.**

