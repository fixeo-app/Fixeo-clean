# Phase 7C.8A — FIXEO Estimator UX Prototype Contract
## Delivery Report

**Status:** COMPLETE — READY FOR DORMANT VISUAL PROTOTYPE IMPLEMENTATION  
**Date:** 2026-08-09

---

## 1. Repository Path
`/home/work/fixeo-clean`

## 2. Starting HEAD
`ff27ea6dc83f4033f11258f4946c78ab9fe403bb`

## 3. Ending HEAD
_(committed after this report — see git log)_

## 4. Baseline Validator Results (re-run before 7C.8A work)

| Validator | Pass | Fail | Total |
|-----------|------|------|-------|
| Orchestrator flow tests | 225 | 0 | 225 |
| Golden orchestration fixtures | 142 | 0 | 142 |
| Orchestrator validator | 105 | 0 | 105 |
| States covered | 16/16 | — | — |
| Métiers covered | 8/8 | — | — |

## 5. Ideal Desktop Modal Width
**600px** (acceptable range: 560–620px)

## 6. Mobile Modal/Sheet Behavior
Bottom sheet. Collapsed: 65–80% viewport. Expanded: near-full (100% - 40px top safe area). Rounded top corners (16px). Independent body scroll. Sticky header + footer. Close always visible. Keyboard-aware. Safe-area-aware.

## 7. Header Structure
RAFI glyph + "Estimation FIXEO" + Close ×. Optional subline: "Identifions l'intervention et son prix." No illustration, no marketing banner, no trust badges.

## 8. Progress Design
3 macro stages: **Besoin → Précisions → Résultat FIXEO**. Subtle indicator (small dots or minimal step bar). Forbidden: "Question 4/9" or any n/total counter.

## 9. First-Screen Design
Headline: "Que faut-il réparer, installer ou entretenir ?" Large natural-language input. Placeholder: "Ex. Ma porte frotte au sol et ferme mal". Optional métier shortcuts. CTA: "Continuer". RAFI is not a chatbot.

## 10. RAFI Visual Role
Subtle intelligence indicator only. Patterns: "RAFI a identifié : [Métier] — [Service]" / "RAFI vérifie quelques détails avant d'afficher le prix." No chat bubbles. No alternating messages. No excessive animation.

## 11. Question-Card Design
One question per screen. AnswerCard: 52–64px height, 44px min touch target. Selected state: accent gradient + visible checkmark (no color-only state). Short non-technical labels.

## 12. Standard Price Hierarchy
`Votre intervention est identifiée ✓` → Service name → **[AMOUNT] MAD (48px/700)** → "PRIX FIXEO" → ScopeList → Scope doctrine copy → Gradient CTA with price → Secondary modify.

## 13. Calculated-Price Hierarchy
Service name → Basis line (muted, e.g. "2 prestataires × 3 heures × 65 MAD") → **[AMOUNT] MAD (48px/700)** → "Prix FIXEO calculé" → ScopeList → CTA. Basis never hidden.

## 14. Labour + Part Hierarchy
Two distinct cards: Card 1: "Main-d'œuvre FIXEO / [AMOUNT] MAD". Card 2: "Pièce / matériel / Non compris dans les [AMOUNT] MAD". Disclosure copy (artisan part approval policy). CTA: labour amount only. Never summed.

## 15. Diagnostic Hierarchy
"Votre intervention nécessite d'abord un diagnostic." → **[AMOUNT] MAD (48px/700)** → "Diagnostic FIXEO" → Métier-specific absorption copy → CTA: "Réserver le diagnostic — [AMOUNT] MAD". No "environ". Exact integer.

## 16. Quote Hierarchy
"Cette intervention nécessite un devis." → Brief service-specific reason → CTA: "Demander un devis" → Secondary: "Modifier mon besoin". No fake price. No apology tone. Valid outcome.

## 17. Route Hierarchy
"Cette intervention relève plutôt de la [métier]." → "FIXEO vous redirige vers le bon type d'artisan." → CTA: "Continuer en [métier]" → Secondary: "Modifier mon besoin". Not an error.

## 18. Safety Hierarchy
"Une vérification est nécessaire avant de continuer." → Factual explanation → Next action. No price. Safety surface (#FFF8F0). Serious, calm, factual. No red fear interface. Progress hidden.

## 19. Requalification Hierarchy
Client copy: "Votre besoin dépasse le périmètre du prix standard." + reason. Forbidden word "REQUALIFY" never shown to user. CTA depends on outcome.

## 20. Modal → Page Transition
Trigger: orchestrator returns PAGE_RECOMMENDED mid-flow. Copy: "Cette intervention demande quelques précisions supplémentaires." CTA: "Continuer l'estimation". No failure framing. Navigate to /estimation. Session fully preserved. No restart. No progress lost.

## 21. /estimation Page Layout
Desktop: two-column (60% main flow + 40% EstimatorSummary sticky right). Mobile: single column. Summary shows métier, service, known answers, progress. No price before engine result. No fake running estimate.

## 22. Painting Measurement UX
Copy: "Pour calculer correctement votre prix, nous avons besoin de la surface à peindre." Two options: "Je connais la surface" (→ painted_m2 direct numeric input) / "Aidez-moi à la calculer" (FUTURE DEPENDENCY). Always PAGE_REQUIRED. No floor→painted conversion. No 1.6x or 2.0x factor. `painted_m2` is the only canonical measurement.

## 23. Homepage Future CTA Placement
"Estimer mon intervention" — secondary CTA. Design only. Do NOT implement now.

## 24. Service-Card Future CTA
"Estimer" — Design only. Do NOT implement now.

## 25. RAFI Future CTA
"Voir le prix FIXEO" — Design only. Do NOT implement now.

## 26. Artisan-Profile Future CTA
"Estimer cette intervention" or "Voir le prix FIXEO". Artisan does NOT set canonical price. Design only. Do NOT implement now.

## 27. Need Builder Boundary
Need Builder: expresses need. RAFI: understands + routes. Estimator: qualifies + canonical commercial outcome. Reservation: schedules + booking. No duplicate forms. Reservation must consume `pricing_context_token`. Reservation must NOT recalculate price.

## 28. Component Inventory
**23 components defined:**
EstimatorLauncher, EstimatorModal, EstimatorSheet, EstimatorHeader, EstimatorProgress, EstimatorContext, EstimatorQuestion, AnswerCard, YesNoChoice, QuantityInput, MeasurementInput, EstimatorFooter, PriceResult, CalculatedPriceResult, LabourPartResult, DiagnosticResult, QuoteResult, RouteResult, SafetyResult, ScopeList, EstimatorPage, EstimatorSummary, RAFIIndicator.

## 29. Screen-State Count
**16 annotated screen states** (see `estimator-screen-states.v1.draft.json`).

## 30. Example-Flow Count
**8 example flows** (Flows A–H, see `estimator-example-flows.v1.md`).

## 31. Responsive Rules
- Mobile: ≤767px → bottom sheet
- Tablet: 768–1023px → modal/sheet adaptive
- Desktop: ≥1024px → centered modal (600px)
- /estimation desktop: two-column. Mobile: single column.

## 32. Keyboard / Mobile Rules
Sheet resizes upward when keyboard appears. Input always visible. CTA accessible when keyboard open. Close always reachable. Min touch target: 44px.

## 33. Animation Policy
Question transition: 180–240ms. Selection feedback: 120–180ms. Modal open desktop: fade + scale. Sheet open: slide up 280ms. Result: subtle fade-in. Forbidden: confetti, fake AI thinking, excessive RAFI animation.

## 34. Accessibility Policy
aria-labelledby on modal. Focus trap active. Focus return on close. ESC closes desktop. Visible focus indicator. aria-live on results. Semantic question heading. Error announcements assertive. Min contrast 4.5. 44px touch targets. No color-only states.

## 35. Commercial Copy Status
French: DRAFT. `LEGAL_REVIEW_REQUIRED` flagged on all commercial copy. Darija: NOT DRAFTED. `DARIJA_NATIVE_REVIEW_REQUIRED` flagged. No copy deployed.

## 36. Legacy Isolation Confirmation
UX code artifacts contain zero `require()` or `import` calls to legacy files. Production files (reservation.js, fixeo-pricing-marocain.js, etc.) isolated. Not referenced by any UX code artifact.

## 37. No-Price-Calculation Confirmation
UI data boundary enforced by contract: UI must NOT calculate_price, apply_multiplier, apply_surcharge, derive_painted_m2_from_floor, execute_dormant_batch_rules, or read_legacy_pricing_tables. Validated by Section 2 and Section 10 of validator.

## 38. Runtime Reference Check
Zero production runtime references in `data/pricing/ux/`. Validator Section 11: 4/4 PASS.

## 39. Production Activation Status
BLOCKED. No homepage modified. No reservation modified. No engine activated. No orchestrator activated. No deployment performed.

## 40. Files Created

All under `data/pricing/ux/`:

| File | Size (bytes) |
|------|-------------|
| estimator-visual-contract.v1.draft.json | 4,426 |
| estimator-component-map.v1.draft.json | 8,165 |
| estimator-screen-states.v1.draft.json | 13,113 |
| estimator-responsive-contract.v1.draft.json | 3,441 |
| estimator-copy.v1.draft.json | 5,506 |
| estimator-modal-page-handoff.v1.draft.json | 2,479 |
| estimator-example-flows.v1.md | 8,721 |
| estimator-ux-spec.v1.md | 9,818 |
| validate-7c8a.js | ~28,000 |
| README.md | 3,628 |
| phase-7c8a-report.md | this file |

## 41. Files Modified
None outside `data/pricing/ux/`.

## 42. Validator Results

| Validator | Pass | Fail | Total |
|-----------|------|------|-------|
| 7C.8A validator | **205** | 0 | **205** |

## 43. Git Diff
Scope: `data/pricing/ux/` only. 11 files created. 0 files modified outside scope.

## 44. Commit SHA
_(see `git log --oneline -1` after commit)_

## 45. PRODUCTION RUNTIME = 0 DIFF
✅ CONFIRMED

## 46. NO DEPLOYMENT PERFORMED
✅ CONFIRMED

## 47. ENGINE STILL DORMANT
✅ CONFIRMED — Pricing Engine Core V1 not activated.

## 48. ORCHESTRATOR STILL DORMANT
✅ CONFIRMED — Estimator Orchestrator V1 not activated.

## 49. ZERO PRODUCTION REFERENCES
✅ CONFIRMED — No UX code artifact references any production runtime.

---

## Final Status

**PHASE 7C.8A — FIXEO ESTIMATOR UX PROTOTYPE CONTRACT**  
**— COMPLETE — READY FOR DORMANT VISUAL PROTOTYPE IMPLEMENTATION**

STOP. Do not implement 7C.8B automatically.
Do not create production estimator UI.
Do not modify homepage.
Do not modify reservation.
Do not activate Pricing Engine.
Do not activate Estimator Orchestrator.
Do not deploy.
