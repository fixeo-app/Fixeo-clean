# FIXEO Estimator UX Spec — Phase 7C.8A
## Status: DRAFT — NOT FOR PRODUCTION

---

## 1. Product Experience Principle

The FIXEO estimator must NOT feel like:
- a quote form
- a long wizard
- an insurance form
- a generic calculator
- a chatbot conversation
- a marketplace price-range widget

It must feel like:
> FIXEO understands the intervention, asks only what is necessary, then gives the correct commercial outcome.

**Visible journey:**
```
BESOIN → QUELQUES PRÉCISIONS → RÉSULTAT FIXEO
```

**Emotional sequence the user should experience:**
1. FIXEO understood my problem.
2. The questions make sense.
3. I know exactly what the price represents.
4. I understand what is included and excluded.
5. I can continue immediately.

---

## 2. Architecture Summary

### 2.1 Hybrid Surface

The estimator is hybrid by design:

| Condition | Surface |
|-----------|---------|
| 0–3 remaining questions, no measurement dependency | Modal (desktop) / Sheet (mobile) |
| 4+ remaining questions | Page (/estimation) recommended |
| Measurement dependency (painted_m2) | Page (/estimation) required |

### 2.2 Orchestrator as Authority

The UI is a pure consumer of orchestrator output.
- The UI renders, collects answers, submits answers, requests next steps.
- The UI does NOT calculate prices.
- The UI does NOT apply multipliers or surcharges.
- The UI does NOT reproduce monetary calculations.
- The Pricing Engine Core V1 is the sole price calculator. Always. No exception.

### 2.3 Entry Modes

Six entry modes are supported:
- `DIRECT_CTA` — user opens from homepage or generic CTA
- `SERVICE_CARD` — user opens from a specific service card
- `ARTISAN_PROFILE` — user opens from an artisan's profile
- `RAFI` — RAFI has pre-resolved intent
- `RESERVATION_FLOW` — within a reservation handoff
- `DEEP_LINK` — deep-linked URL with params

Known context from entry mode is reused. The user is never asked twice for information FIXEO already knows.

---

## 3. Question Discipline

### 3.1 One Question Per Screen

Show exactly one primary question per screen. No multi-field forms. No dense selects.

### 3.2 Question Priority Order

The orchestrator enforces the canonical order:
1. SAFETY
2. ROUTING_BOUNDARY
3. SERVICE_IDENTITY
4. ELIGIBILITY
5. QUANTITY_MEASUREMENT
6. PARTS_MATERIAL
7. COMMERCIAL_CLARIFICATION

### 3.3 Forbidden Questions

- **City** — zero price effect in V1. Never ask as a pricing question.
- **Urgency** — zero price effect in V1. Never ask as a pricing question.

### 3.4 Je ne sais pas

Include "Je ne sais pas" only when uncertainty is semantically valid.
Do not force false certainty.

---

## 4. Outcome Hierarchy

### 4.1 Price Result (PRICE_READY)

The price is the dominant visual element.

```
Votre intervention est identifiée ✓
[Service Name]

[AMOUNT] MAD    ← dominant: 48px/700 weight
PRIX FIXEO

Compris :        ← scope list
[items]

Non compris :
[items]

[scope doctrine copy]

[Continuer avec ce prix — [AMOUNT] MAD]    ← gradient CTA
[Modifier mon besoin]
```

### 4.2 Calculated Price (FIXEO_CALCULATED_PRICE)

Basis must be shown. Never hidden.

```
[Service Name]
[basis line: e.g. "2 prestataires × 3 heures × 65 MAD"]    ← muted
[AMOUNT] MAD    ← dominant
Prix FIXEO calculé
```

### 4.3 Labour + Part (FIXEO_LABOUR_PRICE_PLUS_PART)

Two visually distinct cards. Never summed.

```
┌──────────────────────────┐
│ Main-d'œuvre FIXEO       │
│ [AMOUNT] MAD             │
└──────────────────────────┘

┌──────────────────────────┐
│ Pièce / matériel         │
│ Non compris dans les     │
│ [AMOUNT] MAD             │
└──────────────────────────┘

[Disclosure copy — artisan part approval policy]

[Continuer — Main-d'œuvre [AMOUNT] MAD]
```

### 4.4 Diagnostic (FIXEO_DIAGNOSTIC)

Exact integer. Métier-specific absorption. No "environ".

Canonical amounts:
- Plomberie: **180 MAD**
- Électricité: **200 MAD**
- Climatisation: **250 MAD**

No universal absorption rule across métiers.

### 4.5 Quote Required (QUOTE_REQUIRED)

Valid outcome. Not an error. No apology tone. No fake price range.

```
Cette intervention nécessite un devis.
[Brief service-specific reason]

[Demander un devis]
[Modifier mon besoin]
```

### 4.6 Route Required (ROUTE_REQUIRED)

Not an error. Clear redirect.

```
Cette intervention relève plutôt de la [target métier].
FIXEO vous redirige vers le bon type d'artisan.

[Continuer en [target métier]]
[Modifier mon besoin]
```

### 4.7 Safety Stop (SAFETY_STOP)

No price. Serious, calm, factual. No red fear interface.

```
Une vérification est nécessaire avant de continuer.
[Factual explanation]
[Next action per orchestrator]
```

### 4.8 Requalification

Client copy: "Votre besoin dépasse le périmètre du prix standard."
Never expose the word "REQUALIFY" to the user.

---

## 5. Special Doctrine

### 5.1 Painting

- `painted_m2` is the only canonical measurement.
- Engine receives `painted_m2` directly.
- No floor→painted conversion. No 1.6x or 2.0x factor.
- If client knows surface: direct numeric input.
- If client does not know: guided measurement assistant (FUTURE DEPENDENCY — not V1).
- Always PAGE_REQUIRED.

### 5.2 Cleaning

- `PER_CLEANER_HOUR` ≠ `PER_HOUR`. Semantics must not be collapsed.
- V1 supports integer hours only. No half-hour billing.
- Basis must be shown in the calculated price result.

### 5.3 Menuiserie Batch

- hinge_count = 1 (standardized for V1)
- drawer_count = 1 (standardized for V1)
- If quantity > 1: QUOTE_REQUIRED / requalification per orchestrator
- Experimental +50/+100 MAD batch rules: DORMANT. Never expose in UX.

### 5.4 City / Urgency Neutrality

V1: city_affects_price = false, urgency_affects_price = false.
No surcharges. No multipliers. No legacy modifier logic.
Rounding policy: `EXACT_INTEGER_MAD`.

---

## 6. RAFI Visual Role

RAFI is intelligence infrastructure, not a chatbot.

**Correct usage:**
- "RAFI a identifié : Menuiserie — Réglage porte intérieure"
- "RAFI vérifie quelques détails avant d'afficher le prix."

**Forbidden:**
- Chat bubbles
- Alternating message layout
- Excessive animation
- RAFI taking over the interface

---

## 7. Modal → Page Transition

When the orchestrator changes recommendation from MODAL_OK to PAGE_RECOMMENDED:

1. Show transition screen inside current modal/sheet:
   > "Cette intervention demande quelques précisions supplémentaires."
   > [Continuer l'estimation]
2. Navigate to `/estimation`.
3. Session is fully preserved. No restart. No progress lost.
4. Page resumes at the next_step from orchestrator session.

This transition must not feel like failure.

---

## 8. /estimation Page Layout

**Desktop:**
- Left column (~60%): main estimator question flow
- Right column (~40%): EstimatorSummary (sticky)
  - Shows: métier, service, known answers, progress indicator
  - Does NOT show price before engine result
  - No fake running estimate

**Mobile:**
- Single column
- Summary compressed to small strip above questions

---

## 9. Navigation and Back Behavior

| Action | Behavior |
|--------|----------|
| Estimator back button | Previous question in orchestrator session |
| Close button (×) | Exit estimator (confirm if mid-flow) |
| Browser back on /estimation | Restore prior step where feasible via history state |

These are distinct behaviors. They must not be conflated.

---

## 10. Future Entry Points (Design Only — Do Not Implement)

| Surface | CTA Label |
|---------|-----------|
| Homepage | "Estimer mon intervention" (secondary CTA) |
| Service cards | "Estimer" |
| RAFI | "Voir le prix FIXEO" |
| Artisan profile | "Estimer cette intervention" or "Voir le prix FIXEO" |

Artisan does NOT set the canonical price.

---

## 11. Need Builder / Estimator / Reservation Boundary

| Layer | Responsibility |
|-------|---------------|
| Need Builder | Express need |
| RAFI | Understand + route |
| Estimator | Qualify + canonical commercial outcome |
| Reservation | Schedule + booking + artisan flow |

Reservation must consume `pricing_context_token`.
Reservation must NOT recalculate the price using any logic.

---

## 12. Pricing Context Token

The dormant token is built by `buildPricingContextToken(session)`.
It contains: service_code, engine_version, price_version, inputs_hash, qualification_result, commercial_output_type, final_amount_mad, labour_amount_mad, variable_part_separate, scope_snapshot, policy_refs, session_id, created_at.

In this phase:
- `production_valid = false`
- `signature = null`
- No production crypto/signature created.

---

## 13. Acceptance Gate

Phase 7C.8A passes only if:

| Criterion | Standard |
|-----------|----------|
| Simple case speed | Faster than current booking |
| Unnecessary questions | Absent |
| Price dominates result | ✓ |
| Scope understandable | ✓ |
| Parts clearly separated | ✓ |
| Quote not treated as failure | ✓ |
| Safety never shows price | ✓ |
| Modal never becomes long-form | ✓ |
| Modal→page preserves context | ✓ |
| RAFI feels intelligent not chatty | ✓ |
| Mobile close always visible | ✓ |
| Sticky CTA never hides content | ✓ |
| No UI price calculation | ✓ |
| No legacy price fallback | ✓ |

---

## 14. Production Blockers (Carry Forward)

These do NOT block 7C.8A design. They block production activation.

- **P0:** Peinture reservation display contradiction (reservation.js vs reservation-v2.js)
- **P0:** reservation.js booking total replacement / migration
- **HRQ-002:** Painting UX measurement review
- **HRQ-004:** NET-030 field validation
- **HRQ-005:** LOW/MEDIUM confidence services pilot validation
- **HRQ-006:** CLIM-025 calibration
- **HRQ-008:** Legal + Darija commercial copy review

---

## 15. Production Status

| Component | Status |
|-----------|--------|
| Pricing Engine Core V1 | DORMANT |
| Estimator Orchestrator V1 | DORMANT |
| Production Estimator UI | NOT IMPLEMENTED |
| Production Activation | BLOCKED |
| Deployments | ZERO |
