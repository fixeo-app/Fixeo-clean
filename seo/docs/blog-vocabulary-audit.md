# Blog Product-Truth Vocabulary Audit

**Task:** Phase 1 Task 1.9 — Audit only. No files modified.
**Date:** 2026-09-10
**Policy reference:** FIXEO SEO V3 product-truth doctrine (Q2 approved vocabulary)

---

## 1. Blog Corpus Count

| Source | Count |
|--------|-------|
| `blog/*.html` files | **121** |
| `sitemap-blog.xml` entries (excl. `/blog` index) | 121 |
| `blog-index.html` (listing page, root) | 1 (separate — not in `/blog/` dir) |
| **Total indexable blog pages** | **122** |

All 121 blog-slug files appear in the sitemap. All sitemap slugs have a corresponding file. **No missing or extra files.**

Slug convention: `blog/{slug}.html` served at `/blog/{slug}` via vercel.json route `^/blog/([a-z][a-z0-9-]*)$`.

No duplicate or malformed slugs found.

---

## 2. Audit Methodology

1. **Content-guard scanner** (Task 1.4 module) run against all 121 blog files (stripped of HTML tags). Identified candidate phrase×file hits.
2. **Template pattern analysis**: Each recurring phrase classified by source — shared nav block, shared footer CTA, per-article inline CTA, or unique editorial body copy.
3. **Manual contextual review**: Every distinct wording pattern inspected in surrounding HTML context to distinguish FIXEO product claims from consumer advice, informational content, or external regulatory references.
4. **Structured data review**: JSON-LD blocks inspected separately for meta/title violations.
5. **blog-index.html** inspected separately (not in `blog/` scope but indexable).

---

## 3. Content-Guard Candidate Hits

| Metric | Value |
|--------|-------|
| Blog files scanned | 121 |
| Total phrase×file hits | 447 |
| Unique banned phrases matched | 13 of 24 |
| Files with ≥1 hit | **121 (100%)** |

**Phrases with zero hits** (across all 121 files):
`disponible immédiatement`, `dans l'heure`, `connecte instantanément`, `mise en relation instantanée`, `tarif garanti`, `prix garanti`, `disponibilité garantie`, `réponse garantie`, `intervention garantie`, `intervention gratuite`, `artisan qualifié` (as standalone, accented)

---

## 4. Hit Distribution by Phrase

| Phrase | Files hit | Source type | Classification |
|--------|-----------|-------------|----------------|
| `artisan vérifié` | **121** | Mixed — see §6 | Mixed A/C |
| `artisans vérifiés` | **121** | Mixed — see §6 | Mixed A/C |
| `devis gratuit` | **121** | Shared footer CTA | **A** |
| `artisan certifié` | 50 | Shared per-service inline CTA | **A** |
| `électricien qualifié` | 7 | Mixed — editorial body + FAQ | Mixed B/C |
| `24h/7` | 7 | Mixed — urgency pages + editorial | Mixed A/B |
| `électricien certifié` | 6 | Mixed — editorial body/FAQ/JSON-LD | Mixed B/C |
| `disponible maintenant` | 5 | Shared urgency CTA block | **A** |
| `24h/24` | 3 | JSON-LD meta description | **A** |
| `7j/7` | 2 | JSON-LD meta description | **A** |
| `plombier qualifié` | 2 | Editorial body (informational) | **B** |
| `prix fixe` | 1 | Pricing comparison table label | **B** |
| `serrurier qualifié` | 1 | JSON-LD meta description | **A** |

---

## 5. Template Source Identification

The violations are **not 121 independent editorial errors**. They originate from **3–4 repeating template blocks** injected by the blog generator(s) into every page:

### Block T1 — Shared Nav CTA (121 pages)
```html
<p>Artisans vérifiés disponibles dans votre ville.</p>
<a href="/?open=request" class="blog-cta-btn">Demander un devis</a>
```
**Location:** Navigation/sidebar CTA block, injected into every blog page.
**Contains:** `artisans vérifiés` — unsupported product-truth claim.

### Block T2 — Shared Footer CTA (121 pages)
```html
Fixeo vous met en relation avec des professionnels qualifiés dans votre ville au Maroc
— devis gratuit, paiement sécurisé après intervention.
```
**Location:** Footer CTA strip on every blog page.
**Contains:** `devis gratuit` — unsupported (FIXEO does not offer guaranteed free estimates).

### Block T3 — Inline Mid-Article CTA (121 pages, 2 variants)

**Variant A — Generic** (used on ~71 pages):
```html
<p class="blog-cta-title">Besoin d'un artisan vérifié ?</p>
<p class="blog-cta-desc">Fixeo vous met en relation avec des professionnels qualifiés
dans votre ville au Maroc — devis gratuit, paiement sécurisé après intervention.</p>
```
**Contains:** `artisan vérifié`, `devis gratuit`.

**Variant B — Service-specific plombier** (used on ~25 pages):
```html
<span>Trouver un plombier vérifié</span>
<p class="blog-intro-cta-desc">Intervention rapide, devis gratuit, artisan certifié Fixeo</p>
```
**Contains:** `artisan certifié`, `devis gratuit`.

**Variant C — Service-specific électricien** (used on ~25 pages):
```html
<span>Trouver un électricien vérifié</span>
<p class="blog-intro-cta-desc">Artisan certifié, intervention rapide, paiement sécurisé.</p>
```
**Contains:** `artisan certifié`.

### Block T4 — Urgency CTA Block (5 pages)
```html
<span>Artisan disponible maintenant, intervention en moins de 2h au Maroc.</span>
```
**Location:** Inline urgency banner on 5 urgency-topic pages.
**Contains:** `disponible maintenant` + implied instant availability guarantee — unsupported.

**Root cause: The blog generator (`generate-blog-v2.js` or equivalent) injects T1–T4 into every page at build time. Correcting the shared template source corrects all 121 pages simultaneously. This is NOT 121 independent editorial corrections.**

---

## 6. Classification — All Findings

### Category A — Direct FIXEO Product-Truth Violations

#### A1 — `devis gratuit` (121 blog pages + T2 block)

**Pattern:** `"— devis gratuit, paiement sécurisé après intervention"` in shared footer CTA (T2) and inline mid-article CTA (T3A/B).

**Context:** FIXEO CTA encouraging form submission with promise of free estimate.

**Violation:** FIXEO does not guarantee a free devis. The platform connects users with artisans who then determine whether to provide a free or paid estimate. This is an unsupported commercial promise.

**Affected pages:** 121 blog pages (template-origin, single source fix corrects all)

**Also appears in JSON-LD of specific pages:**
- `plombier-fes-medina.html`: `"description": "Artisans vérifiés, connaissance des canalisations anciennes. **Devis gratuit** et rapide."` → A (meta description, JSON-LD)
- `climatisation-agadir.html`: `"description": "… artisans vérifiés … **Devis gratuit**."` → A (JSON-LD)
- `electricien-rabat-agdal.html`: `"description": "… **Devis gratuit**."` → A (JSON-LD)

**Recommended future replacement:** `"votre demande est enregistrée sans frais"` or `"décrivez votre problème, sans engagement"` or simply remove the "devis gratuit" claim and rely on the call-to-action button text.

---

#### A2 — `artisan vérifié` / `artisans vérifiés` as FIXEO product claim (121 pages — partial)

**Pattern instances (by source):**

| Instance | Source | Classification |
|----------|--------|----------------|
| T1 nav: `"Artisans vérifiés disponibles dans votre ville"` | Template block | **A** — unsupported claim about artisan verification status |
| T3A: `"Besoin d'un artisan vérifié ?"` | Inline CTA | **A** — unsupported marketing claim |
| `artisan-verifie-maroc.html` title/meta/H1/JSON-LD | Unique editorial article about the concept | **C** — ambiguous; the article itself discusses the concept, but the specific FIXEO product description in JSON-LD and meta `"Qu'est-ce qu'un artisan vérifié Fixeo ?"` asserts a verification process that may not be live |
| `avis-artisans-fixeo.html`: `"Chaque artisan Fixeo est vérifié, noté et assuré."` | Unique body copy | **A** — direct FIXEO product claim: "verified, rated, and insured" — three unsupported simultaneous assertions |
| `garantie-intervention-fixeo.html`: `"Chaque artisan Fixeo est vérifié, noté et assuré."` | Unique body copy | **A** — same as above |
| `comment-choisir-plombier-maroc.html` FAQ: `"Sur Fixeo, chaque artisan a été vérifié : identité confirmée, photos de réalisations validées"` | JSON-LD FAQ answer | **A** — specific unsupported process claim in structured data |
| `securite-paiement-fixeo.html`: `"Chaque artisan Fixeo est vérifié, noté et assuré."` | Body copy | **A** |

**Recommended future replacement:** `"artisan référencé"`, `"professionnel référencé"`, `"profils référencés sur FIXEO"`

---

#### A3 — `artisan certifié` in FIXEO CTAs (50 pages)

**Pattern:** `"Intervention rapide, devis gratuit, artisan certifié Fixeo"` (plombier variant) and `"Artisan certifié, intervention rapide, paiement sécurisé"` (électricien variant) in Template Block T3B/T3C.

**Violation:** FIXEO does not certify artisans. "Artisan certifié Fixeo" is a direct unsupported product claim. The term "certifié" implies a formal quality certification that FIXEO has not established.

**Affected pages:** 50 blog pages (template-origin; single generator template source change corrects all)

**Recommended future replacement:** `"artisan référencé Fixeo"` + `"paiement sécurisé après intervention"`

---

#### A4 — `disponible maintenant` in urgency CTA block (5 pages)

**Pattern:** `"Artisan disponible maintenant, intervention en moins de 2h au Maroc"` — Urgency CTA block (T4).

**Files:** `urgence-electricien-rabat.html`, `urgence-electricien-tanger.html`, `urgence-plombier-casablanca.html`, `urgence-plombier-fes.html`, `urgence-serrurier-marrakech.html`

**Violation:** Asserts real-time artisan availability ("disponible maintenant") and a guaranteed intervention time ("en moins de 2h") — neither of which FIXEO can guarantee. This is a simultaneous availability + response-time guarantee claim.

**Recommended future replacement:** `"Décrivez votre urgence — votre demande est transmise aux artisans disponibles dans votre ville"` or `"Déposez votre demande d'urgence — un artisan référencé vous contacte"`

---

#### A5 — `24h/7`, `24h/24`, `7j/7` in JSON-LD / meta descriptions (urgency pages)

**Files and locations:**

| File | Phrase | Location |
|------|--------|----------|
| `urgence-plombier-casablanca.html` | `24h/7`, `24h/24`, `7j/7` | Title + JSON-LD description |
| `urgence-plombier-fes.html` | `24h/7` | JSON-LD description |
| `urgence-electricien-tanger.html` | `24h/7` | JSON-LD description |
| `urgence-serrurier-marrakech.html` | `24h/24` | JSON-LD description |
| `plombier-casablanca-quartiers.html` | `24h/7` | Body — internal link/cross-link block |
| `urgence-serrurier-marrakech.html` | `24h/7` | Body — related articles cross-link |

**Classification:**
- JSON-LD / title / meta description uses → **A** (indexed product claims about artisan availability around the clock)
- `plombier-casablanca-quartiers.html` body usage: `"urgence casablanca 24h/7"` in related-article link → **C** (ambiguous — it's a link label to a page titled that way; could be read as editorial cross-reference rather than a FIXEO claim)
- `prix-electricien-maroc.html` body/JSON-LD: `"certains électriciens sont disponibles 24h/7 avec un tarif d'urgence spécifique"` → **B** (generic market fact about the electrician profession, not a FIXEO product claim)
- `prix-plombier-maroc.html` table: `"plombier urgence 24h/7"` as a category label in a market rate comparison table → **B** (market pricing table; describes a market segment, not FIXEO's service)

**Recommended future replacement (A cases):** Remove from meta/JSON-LD. Approved alternative: `"votre demande d'urgence est enregistrée à toute heure"` (per Q11 policy).

---

#### A6 — `serrurier qualifié` in JSON-LD (1 page)

**File:** `serrure-multipoints-bloquee.html`

**Context:** JSON-LD description: `"diagnostiquer et débloquer une serrure 3 points coincée avec l'aide d'un serrurier qualifié Fixeo"`

**Classification:** **A** — `"serrurier qualifié Fixeo"` is a direct FIXEO product claim asserting that Fixeo's serrurers are formally qualified. This is unsupported.

**Recommended replacement:** `"serrurier référencé Fixeo"`

---

### Category B — Contextual / Generic Content (Not Violations)

#### B1 — `électricien qualifié` in editorial body copy (7 pages)

**Examples:**
- `cablage-maison-renovation.html`: `"Un électricien qualifié réalise un audit : vérification de la section des câbles"` — generic consumer advice about what a skilled electrician does; not a FIXEO product claim.
- `tableau-electrique-upgrade.html`: `"demandez un électricien qualifié qui travaille avec des composants de marques reconnues"` — consumer purchasing advice.
- `tableau-divisionnaire.html`: `"Seul un électricien qualifié peut réaliser ces travaux en toute sécurité"` — safety advisory.
- `disjoncteur-saute-souvent.html` FAQ: `"un électricien qualifié est nécessaire pour intervenir en sécurité"` — safety FAQ answer.
- `domotique-maison-maroc.html` FAQ: `"oui, un électricien qualifié est recommandé"` — generic advice.

**Classification:** **B** — These describe a general market category (qualified electrician as a professional type), not a FIXEO-specific claim. They advise users to hire a skilled professional without asserting that FIXEO provides one.

#### B2 — `électricien certifié` in regulatory / safety editorial body (6 pages — 4 instances)

**Examples:**
- `panneau-solaire-installation.html`: `"installation par un électricien certifié IRESEN"` — refers to a Moroccan regulatory body (IRESEN) certification; factual regulatory context. **B**
- `prix-electricien-maroc.html`: `"un électricien certifié ONEE coûte plus cher mais assure un travail conforme"` — describes ONEE (Office National de l'Électricité) certification; factual market context. **B**
- `installation-borne-recharge-voiture.html` FAQ: `"Faut-il un électricien certifié pour installer une borne VE ?"` — FAQ about regulatory requirements; not a FIXEO claim. **B**
- `installation-prise-electrique.html` FAQ: `"tout travail impliquant le tableau électrique … doit être fait par un électricien certifié"` — generic safety/regulatory advice. **B**
- `court-circuit-maison.html` meta description: `"réparation sécurisée par un électricien certifié"` — ambiguous meta description; could be read as FIXEO providing certified electricians → **C** (see §7)
- `installation-chauffe-eau-electrique.html` FAQ: `"la connexion électrique doit être réalisée par un électricien certifié"` — safety advice. **B**

#### B3 — `plombier qualifié` in editorial body (2 pages)

- `pression-eau-faible-maison.html`: `"un plombier qualifié réalisera un diagnostic complet et proposera la meilleure solution"` — generic advice. **B**
- `prix-plombier-maroc.html` table: `"Plombier qualifié (5+ ans exp.)"` as a market rate category label. **B**

#### B4 — `24h/7` and market pricing context (2 pages)

- `prix-electricien-maroc.html` FAQ: `"certains électriciens sont disponibles 24h/7 avec un tarif d'urgence spécifique"` — describes the market, not FIXEO's promise. **B**
- `prix-plombier-maroc.html` rate table: `"Plombier urgence 24h/7"` as category label. **B**

#### B5 — `prix fixe` in product comparison table (1 page)

- `prix-climatisation-maroc.html` table header: `"Prix fixe (MAD)"` — describes fixed-speed (non-inverter) air conditioner pricing column in a product comparison table. **B** — this is a product attribute label, not a FIXEO pricing guarantee.

---

### Category C — Ambiguous / Human Review Required

#### C1 — `artisan-verifie-maroc.html` — Entire article premise

**Issue:** The entire article is titled "Pourquoi choisir un artisan vérifié Fixeo au Maroc" and its content describes a verification process ("identité confirmée, photos de réalisations validées, historique de missions"). This article was presumably written when FIXEO had or planned a verification system.

**The article's body claims:**
- FIXEO artisans have been verified
- Identities confirmed
- Realisation photos validated
- Mission history reviewed
- "Avis laissés par les clients sont authentifiés — impossibles à falsifier"

**Classification:** **C** — The article makes multiple specific claims about FIXEO's internal processes (identity verification, photo validation, anti-falsification) that may or may not reflect live operational reality. This is the most concentrated set of unsupported product-truth claims in the corpus. It requires human review before Phase 2 to determine: (a) which process claims are factually accurate today; (b) what wording is acceptable going forward.

**Cannot be auto-corrected by a generator template fix.**

#### C2 — `court-circuit-maison.html` meta description

**Text:** `"réparation sécurisée par un électricien certifié"`

**Classification:** **C** — Could be read as Fixeo providing certified electricians (A) or as a description of what the article discusses (B). The body content is safety-editorial; the meta description is indexable.

#### C3 — Cross-link label `"urgence casablanca 24h/7"` in body of `plombier-casablanca-quartiers.html`

**Text:** `"urgence casablanca 24h/7 : fuite, wc bouché, intervention rapide"` — internal cross-link to another blog article.

**Classification:** **C** — It references the title of another article rather than making a new FIXEO claim. However, if that anchor text is indexed as body content, it could reinforce the 24h/7 promise. Flagged for human review.

---

### Category D — Non-Indexable / Technical

No D-category findings. All violations exist in indexable HTML (meta, body, JSON-LD), not in scripts, server-side code, or build comments.

---

## 7. Classification Summary

| Category | Unique patterns | Affected pages |
|----------|----------------|----------------|
| **A — Direct violations** | 6 patterns | 121 (A1 devis gratuit — all pages), 121 (A2 partial), 50 (A3 certifié), 5 (A4 disponible), 7+ (A5 24h), 1 (A6 serrurier qualifié) |
| **B — Contextual/generic** | 5 patterns | 13 files |
| **C — Ambiguous/human review** | 3 patterns | 3 files |
| **D — Technical/non-indexable** | 0 | 0 |

---

## 8. Highest-Impact Repeated Violations (by affected-page count)

| Rank | Violation | Pages | Source | Fix scope |
|------|-----------|-------|--------|-----------|
| 1 | `devis gratuit` in footer/inline CTA | **121** | Template T2 + T3A/B | Single generator template |
| 2 | `artisans vérifiés disponibles` in nav CTA | **121** | Template T1 | Single generator template |
| 3 | `artisan vérifié` in inline CTA header | **~121** | Template T3A | Single generator template |
| 4 | `artisan certifié Fixeo` in inline CTA | **50** | Template T3B/C | Single generator template |
| 5 | `disponible maintenant, intervention en moins de 2h` | **5** | Template T4 (urgency variant) | Single urgency template block |
| 6 | `24h/7` / `24h/24` in JSON-LD descriptions | **5** | Per-article JSON-LD (editorial) | 5 individual files |
| 7 | `artisan vérifié/certifié` in unique body copy | **3** | Editorial body (`artisan-verifie-maroc`, `avis-artisans-fixeo`, `garantie-intervention-fixeo`, `securite-paiement-fixeo`) | Per-file surgical edit |

---

## 9. Meta/Title Violations vs. Body-Copy Violations

### Meta / Title / JSON-LD violations (indexed structured content)

| File | Element | Phrase | Classification |
|------|---------|--------|----------------|
| `urgence-plombier-casablanca.html` | `<title>` | `24h/7` | A |
| `urgence-plombier-casablanca.html` | JSON-LD description | `24h/24 et 7j/7` | A |
| `urgence-plombier-fes.html` | JSON-LD description | `24h/7` | A |
| `urgence-electricien-tanger.html` | JSON-LD description | `24h/7` | A |
| `urgence-serrurier-marrakech.html` | JSON-LD description | `24h/24` | A |
| `serrure-multipoints-bloquee.html` | JSON-LD description | `serrurier qualifié Fixeo` | A |
| `court-circuit-maison.html` | meta description | `électricien certifié` | C |
| `artisan-verifie-maroc.html` | `<title>`, meta, JSON-LD headline | `artisan vérifié Fixeo` | C |
| `climatisation-agadir.html` | JSON-LD description | `artisans vérifiés … devis gratuit` | A |
| `electricien-rabat-agdal.html` | JSON-LD description | `artisans vérifiés disponibles 7j/7 … devis gratuit` | A |
| `plombier-fes-medina.html` | JSON-LD description | `artisans vérifiés … devis gratuit` | A |
| `comment-choisir-plombier-maroc.html` | JSON-LD FAQ answer | `artisan vérifié … identité confirmée` | A |

### Body-copy violations (template-origin)

- All 121 pages: T1 nav block + T2 footer CTA + T3 inline CTA (see §5)
- 5 urgency pages: T4 urgency CTA block

### Body-copy violations (editorial — unique per file)

- `avis-artisans-fixeo.html`: `"Chaque artisan Fixeo est vérifié, noté et assuré"` in article body
- `garantie-intervention-fixeo.html`: same phrase
- `securite-paiement-fixeo.html`: same phrase
- `artisan-verifie-maroc.html`: entire article body premise (C)

---

## 10. Generator / Template Root Cause

The blog generator (most likely `scripts/generate-blog-v2.js` — the v2 generator identified in Phase 0 as the active V2 blog builder) injects shared CTA blocks into every generated page. The following **4 template blocks** are responsible for the overwhelming majority of violations:

| Block | Generator variable / template | Violations introduced |
|-------|-------------------------------|-----------------------|
| T1 — Nav CTA | Blog nav sidebar template | `artisans vérifiés disponibles` |
| T2 — Footer CTA | Blog page footer template | `devis gratuit` |
| T3A — Generic inline CTA | Mid-article CTA block (generic variant) | `artisan vérifié`, `devis gratuit` |
| T3B — Plombier inline CTA | Mid-article CTA block (plombier variant) | `artisan certifié Fixeo`, `devis gratuit` |
| T3C — Électricien inline CTA | Mid-article CTA block (électricien variant) | `artisan certifié` |
| T4 — Urgency block | Urgency page CTA block | `disponible maintenant`, `intervention en moins de 2h` |

**Finding:** The generator is responsible for > 95% of violation instances by page count. The editorial violations (items in §8 rank 7) are limited to 4 specific article files.

**This is NOT a mass editorial quality problem.** It is a template design problem.

---

## 11. Whether a Surgical Correction Pass Is Required in Phase 2

**Answer: YES — but scoped and surgical, not mass regeneration.**

### Required corrections

| Scope | Action | Effort |
|-------|--------|--------|
| Generator template T1 | Replace `"artisans vérifiés disponibles"` → `"profils référencés disponibles"` or `"artisans référencés dans votre ville"` | 1 generator fix → fixes 121 pages |
| Generator template T2 | Remove or replace `"devis gratuit"` → `"décrivez votre problème, sans engagement"` | 1 generator fix → fixes 121 pages |
| Generator template T3A | Replace `"artisan vérifié"` + `"devis gratuit"` | 1 generator fix → fixes 121 pages |
| Generator template T3B | Replace `"artisan certifié Fixeo"` + `"devis gratuit"` | 1 generator fix → fixes ~25 pages |
| Generator template T3C | Replace `"artisan certifié"` | 1 generator fix → fixes ~25 pages |
| Generator template T4 | Replace `"disponible maintenant, intervention en moins de 2h"` | 1 generator fix → fixes 5 pages |
| JSON-LD descriptions: 5 urgency pages | Remove `24h/7`, `24h/24`, `7j/7` from JSON-LD | 5 surgical file edits |
| `serrure-multipoints-bloquee.html` | Replace `"serrurier qualifié Fixeo"` in JSON-LD | 1 surgical edit |
| `avis-artisans-fixeo.html`, `garantie-intervention-fixeo.html`, `securite-paiement-fixeo.html` | Replace `"vérifié, noté et assuré"` in body copy | 3 surgical edits |
| `artisan-verifie-maroc.html` | Human review of entire article premise | Human decision required first |
| `comment-choisir-plombier-maroc.html` | Replace FAQ JSON-LD answer re: verification process | 1 surgical edit |

### NOT required
- Full corpus regeneration from scratch
- Deletion of any blog page
- Modification of any URL

---

## 12. Whether Mass Blog Regeneration Is Necessary

**No.** Mass regeneration is NOT recommended.

**Rationale:**
- The violations are template-origin, not editorial-origin for 95%+ of pages
- Correcting the generator template + regenerating from the same template produces compliant HTML without losing any editorial content
- The 121 blog articles contain high-quality informational content (guides, troubleshooting, pricing, installation advice) — this content should be preserved
- Regenerating only the shared template blocks (T1–T4) is equivalent to a surgical in-place correction
- 4 articles require per-file editorial review/edits that are independent of regeneration

**The correct Phase 2 path:**
1. Fix the generator template CTA blocks (T1–T4) to use V3-compliant vocabulary
2. Regenerate the 121 blog pages from the corrected template (or apply surgical patch to affected blocks)
3. Surgically edit the 8–10 files with per-file editorial violations
4. Conduct human review of `artisan-verifie-maroc.html` article premise before correction

---

## Appendix A — Files with No A-Category Violations (body copy only — template violations still present)

All 121 files contain template violations (T1+T2+T3). The following have **no per-file editorial A-category violations** beyond the shared template:

Most files (≈105/121) fall into this category — their only violations are the 3–4 shared template blocks. Only the files named explicitly in §6 and §9 carry unique editorial violations.

---

## Appendix B — Broken Internal Blog References Found During Audit

No broken internal cross-references discovered during the scope of this audit (only blog × blog links reviewed). Blog articles link to other blog articles via `/blog/{slug}` paths; all referenced slugs checked against the 121-file corpus — no 404-generating references found.

---

## Appendix C — blog-index.html

`blog-index.html` (served at `/blog/`) also contains violations:
- `artisan vérifié` (nav/header listing block)
- `artisans vérifiés` (listing metadata)
- `24h/7` (article teaser for urgency articles)
- `7j/7` (article teaser)

This file is in scope for the same template correction pass. It is not in `blog/` directory but is served at the `/blog` route.
