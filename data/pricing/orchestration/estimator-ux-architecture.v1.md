# FIXEO Estimator V1 — UX Architecture Design
## Phase 7C.6

**Status:** DESIGN ONLY — Dormant | **Date:** 2026-08-09

---

## EXPLICIT UX RECOMMENDATION ANSWERS

### 1. Should FIXEO use a modal?
**YES — for simple and medium-complexity services.**

A modal provides the fastest path from intent to price for services requiring ≤ 3 questions (the majority: serrurerie, plomberie standard, electricite prise/interrupteur, bricolage fixed services, nettoyage canape/matelas, menuiserie standard). These reach a contractual price in under 90 seconds. Forcing a page navigation for these flows adds friction with no UX benefit.

### 2. Should FIXEO have a dedicated /estimation page?
**YES — as continuation target for complex flows.**

Required for: painted_m2 measurement assistant, multi-step qualification (climatisation installation, nettoyage team/hours), quote flows, deep-links, shareable results, back-button navigation, and resumed sessions. The `/estimation` page also enables future SEO price publication without impacting the booking modal.

### 3. Should it use both?
**YES — Hybrid Architecture (recommended).**

See Section 6 below.

### 4. Where exactly should estimator CTA appear on homepage?
**Primary:** Hero secondary CTA — "Estimer mon intervention" (alongside "Trouver un artisan")
**Secondary:** Individual service cards — each card gets an "Estimer" button alongside "Réserver"

Do NOT add a floating persistent CTA on the homepage — it competes with the RAFI and Need Builder. Do NOT add a dedicated navigation item in V1 (insufficient brand equity for estimator yet).

### 5. How should RAFI connect to estimator?
RAFI provides `metier_hint` + `service_hint` + `free_text` + urgency context to the orchestrator. Orchestrator validates hint against canonical registry and starts at SERVICE_SELECTION if valid. **RAFI must NEVER calculate a price.** Urgency from RAFI has zero price effect.

### 6. How should estimator connect to reservation?
Estimator outputs a `pricing_context_token`. Reservation consumes the token. **Reservation MUST NOT recalculate price using legacy reservation.js / reservation-v2.js logic.** The token contains `service_code`, `commercial_output_type`, `final_amount_mad`, `labour_amount_mad`, `policy_refs`, and a future signature. This is the P0 production prerequisite.

### 7. What should happen for simple vs complex services?
**Simple:** Complete inside modal. ≤ 2 questions → price → CTA → Reservation.
**Complex:** Start modal → expand / navigate to `/estimation` page when question count exceeds threshold (recommended: > 3 questions pending, or measurement assistant required, or QUOTE_REQUIRED with form).

### 8. What should happen on mobile?
Modal renders as **bottom sheet**. Large touch targets (≥ 44px). Numeric keyboard for quantity inputs. Price result sticky at bottom of sheet. Back navigation returns to previous question. ESC / swipe-down closes sheet. Input never hidden behind keyboard.

### 9. What must NOT be duplicated with Need Builder?
- Need Builder: helps client EXPRESS their need (free text, category choice, situation description)
- Estimator: QUALIFIES scope and produces FIXEO_PRICE
- Do NOT make Need Builder ask pricing questions
- Do NOT make Estimator replace the Need Builder's natural-language triage
- Suggested integration: Need Builder output → RAFI → Estimator (one direction, not parallel)

### 10. What must remain blocked before production?
See Section 9 — Production Activation Gates.

---

## ARCHITECTURE COMPARISON

| Criterion | Modal Only | Page Only | Hybrid (Recommended) |
|-----------|-----------|-----------|----------------------|
| Simple service conversion | ✅ Fast | ❌ Page load overhead | ✅ Fast (modal) |
| Complex service support | ❌ Cramped | ✅ Full screen | ✅ Expands to page |
| Mobile UX | ✅ Bottom sheet | ⚠️ Scroll risk | ✅ Bottom sheet → page |
| Deep-linking | ❌ Hard | ✅ Native | ✅ Page handles links |
| SEO price publication | ❌ No | ✅ Yes | ✅ Page handles SEO |
| RAFI integration | ✅ Modal launch | ⚠️ Redirect | ✅ Modal launch |
| Reservation handoff | ✅ Token passthrough | ✅ Token passthrough | ✅ Token passthrough |
| Back-button behavior | ❌ Loses state | ✅ Native | ✅ Page has history |
| Shareability | ❌ No URL | ✅ URL | ✅ /estimation?params |
| Painted-m² assistant | ❌ Too wide | ✅ Full screen | ✅ Expand to page |
| Quote forms | ❌ Too wide | ✅ Full screen | ✅ Expand to page |

**Recommendation: HYBRID** — Modal for simple/medium, page for complex/quote/measurement.

---

## SECTION 1: MACRO FLOW — 3-STEP PROGRESSIVE DISCLOSURE

```
[1. Besoin]          [2. Quelques précisions]          [3. Résultat FIXEO]
 Choose métier    →   Safety + eligibility questions  →   Price / Quote / Route
 Choose service       Quantity / measurement              Next action CTA
```

- Simple service (e.g. porte claquée): Steps 1 + 3 only (0 questions in step 2)
- Medium service (e.g. disjoncteur): Steps 1 + 2 (≤4 questions) + 3
- Complex service (e.g. peinture all-in): Steps 1 + 2 (→ /estimation page) + 3

---

## SECTION 2: HOMEPAGE ENTRY POINTS

### Recommended

| Entry Point | Type | Position | Priority |
|-------------|------|----------|----------|
| Hero secondary CTA: "Estimer mon intervention" | Button | Hero section, below main CTA | **PRIMARY** |
| Service card "Estimer" button | Inline | Each service card on homepage | **SECONDARY** |

### Not Recommended in V1

| Entry Point | Reason |
|-------------|--------|
| Floating/sticky CTA | Competes with RAFI, Need Builder CTAs |
| Navigation menu item | Too early — estimator not established brand |
| Artisan card "Estimer" (without artisan context) | Confuses with "Réserver" |

---

## SECTION 3: NEED BUILDER RELATIONSHIP

| Component | Role | NOT Responsible For |
|-----------|------|---------------------|
| Need Builder | Express need in natural language | Pricing, qualification |
| RAFI | Understand + triage need | Pricing, canonical registry |
| Estimator | Qualify scope, canonical price | Free text parsing, booking |
| Reservation | Book intervention | Pricing calculation |

**Integration flow:**
```
Client free text → Need Builder → RAFI (metier_hint + service_hint) → Estimator (validates, qualifies, prices) → Reservation (books)
```

No direct Need Builder → Reservation shortcut that bypasses estimator.

---

## SECTION 4: /estimation PAGE ROLE

The `/estimation` page serves:

1. **Deep links** — `/estimation?metier=plomberie`, `/estimation?service=peinture.mur_interieur.all_in`
2. **Complex flows** — > 3 pending questions, measurement assistant, multi-step qualification
3. **Back navigation** — Browser back/forward works natively
4. **Resume state** — sessionStorage-persisted session restores on reload
5. **Quote forms** — QUOTE_REQUIRED outcome expands to full devis request
6. **Shareable result future** — URL + result snapshot can be shared
7. **Painting measurement assistant future** — GUIDED_MEASUREMENT_ASSISTANT needs full-width UI
8. **SEO price pages future** — `/estimation/plomberie`, `/estimation/peinture` (not in V1 scope)

The `/estimation` page is NOT a replacement for the modal. It is the continuation target for flows that exceed modal capacity.

---

## SECTION 5: ARTISAN PROFILE ENTRY CONTRACT

When estimator is launched from artisan profile:
- Artisan métier → `metier_hint` in entry context
- `artisan_id` retained as context for reservation handoff
- Estimator starts at SERVICE_SELECTION within that métier
- **Artisan cannot force incompatible service**
- **Canonical price unchanged — no artisan-specific modifier**
- If artisan's displayed legacy range conflicts with canonical price: canonical wins

---

## SECTION 6: HYBRID ARCHITECTURE DETAIL

```
                    ┌──────────────────────────────────────────────┐
                    │        FIXEO ESTIMATOR V1 — HYBRID           │
                    └──────────────────────────────────────────────┘

  HOMEPAGE / ARTISAN PROFILE / RAFI
         │
         ▼
  ┌─────────────────────────────┐
  │  COMPACT ESTIMATOR MODAL    │   ← Bottom sheet on mobile
  │                             │
  │  [Step 1: Besoin]           │   ← Métier + Service selection
  │  [Step 2: Précisions]       │   ← 0–3 questions (safety first)
  │                             │
  │  Simple/medium services:    │   ← ≤3 questions total
  │  Complete in modal          │
  │  Price → CTA → Reservation  │
  │                             │
  │  Complex services:          │   ← >3 questions OR measure needed
  │  "Continuer" →              │──→ /estimation (page)
  └─────────────────────────────┘
                                         │
                                         ▼
                               ┌──────────────────────┐
                               │  /estimation PAGE    │
                               │                      │
                               │  Deep-link support   │
                               │  Back navigation     │
                               │  Measurement future  │
                               │  Quote form          │
                               │  Shareable result    │
                               │                      │
                               │  Step 3: Résultat    │
                               │  Price / Quote /     │
                               │  Route / Safety      │
                               │                      │
                               │  → pricing_context_  │
                               │    token             │
                               │  → RESERVATION       │
                               └──────────────────────┘
```

---

## SECTION 7: RESULT OUTCOME DISPLAY PATTERNS

### FIXEO_PRICE / FIXEO_CALCULATED_PRICE
```
┌─────────────────────────────────────────────┐
│  ✅ Votre intervention FIXEO                 │
│                                              │
│  Prix FIXEO    220 MAD                       │
│                                              │
│  Inclus: Ouverture porte standard            │
│  Exclus: Porte blindée                       │
│                                              │
│  [Continuer vers la réservation]             │
│  [Choisir un artisan]                        │
└─────────────────────────────────────────────┘
```

### FIXEO_LABOUR_PRICE_PLUS_PART
```
┌─────────────────────────────────────────────┐
│  🔧 Main-d'œuvre FIXEO                       │
│  250 MAD                                     │
│                                              │
│  🔩 Cylindre / Pièce        Séparé           │
│  Communiqué et approuvé avant installation   │
│                                              │
│  [Continuer vers la réservation]             │
└─────────────────────────────────────────────┘
```

### FIXEO_DIAGNOSTIC
```
┌─────────────────────────────────────────────┐
│  🔍 Diagnostic FIXEO                         │
│  200 MAD                                     │
│                                              │
│  ℹ️  Absorbé si réparation standardisée      │
│     effectuée lors de la même visite         │
│                                              │
│  [Réserver le diagnostic]                    │
└─────────────────────────────────────────────┘
```

### QUOTE_REQUIRED
```
┌─────────────────────────────────────────────┐
│  📋 Votre intervention nécessite un devis.   │
│                                              │
│  Votre besoin dépasse le périmètre des       │
│  interventions à prix fixe FIXEO.            │
│                                              │
│  [Demander un devis]                         │
└─────────────────────────────────────────────┘
```

### SAFETY_STOP
```
┌─────────────────────────────────────────────┐
│  ⚠️  Situation nécessitant attention         │
│                                              │
│  Les signes décrits (odeur de brûlé) peuvent│
│  indiquer un risque électrique.              │
│                                              │
│  Nous vous recommandons de couper le         │
│  disjoncteur principal et de contacter       │
│  les services d'urgence si nécessaire.       │
│                                              │
│  [Contacter FIXEO Support]                   │
└─────────────────────────────────────────────┘
```

---

## SECTION 8: STATE PERSISTENCE RECOMMENDATION

**V1 Recommendation: IN_MEMORY + URL_PARAMS**

| Storage | Use | Rationale |
|---------|-----|-----------|
| In-memory (JS object) | Primary session state during active flow | No persistence overhead. Lost on close (acceptable for simple flows). |
| URL params | `?metier=`, `?service=`, `?step=` | Deep-links, back navigation, share links |
| sessionStorage | Complex flow persistence (painting assistant, quote form) | Tab-scoped. Not shared. Cleared on tab close. |
| localStorage | NOT RECOMMENDED for pricing data | Risk of stale prices. Pricing state must not persist across sessions. |
| Server-side token | Future — for reservation validation | Required when pricing_context_token needs server-side signature |

---

## SECTION 9: PRODUCTION ACTIVATION GATES

| Gate | Status | Notes |
|------|--------|-------|
| P0: Peinture contradiction resolved | ❌ BLOCKED | reservation.js (800–1500) vs reservation-v2.js (20–60) on 353 pages |
| P0: reservation.js booking total replaced | ❌ BLOCKED | Must use pricing_context_token, not legacy SERVICE_PRICING |
| HRQ-002: Painted m² UX designed | ❌ BLOCKED | GUIDED_MEASUREMENT_ASSISTANT not designed |
| HRQ-004: NET-030 field validation | ❌ BLOCKED | LOW evidence |
| HRQ-005: Low/medium confidence pilot | ❌ BLOCKED | Pilot missions not complete |
| HRQ-006: CLIM-025 copper add-on | ❌ BLOCKED | Calibration unresolved |
| HRQ-008: Legal + Darija copy review | ❌ BLOCKED | Copy not reviewed |

**Estimator design: NOT BLOCKED.**
**Dormant orchestrator implementation: NOT BLOCKED.**
**Production activation: BLOCKED (all 7 gates above).**

---

## SECTION 10: LEGACY MIGRATION BOUNDARY

Once estimator production activates, the following transition must occur atomically:

```
FORBIDDEN after activation:
  reservation.js SERVICE_PRICING → any price display
  reservation-v2.js SVC_PRICING_FB → any price display
  fixeo-estimation-engine-v1.js → any estimation
  fixeo-pricing-marocain.js → any card price

REQUIRED after activation:
  evaluateFixeoPrice() → sole price source
  pricing_context_token → sole reservation price input
  canonical approved prices → sole displayed amounts
```

No partial migration. No dual-authority period.

---

*This document is DORMANT. No production UI implemented. No deployment.*
