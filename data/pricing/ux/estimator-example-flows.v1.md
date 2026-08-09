# Estimator Example Flows — Phase 7C.8A
## Status: DRAFT — NOT FOR PRODUCTION

---

## Flow A — Menuiserie: Door Adjustment → 300 MAD

**Entry mode:** DIRECT_CTA  
**User input:** "Ma porte frotte au sol et ferme mal"  

| Step | State | Surface | Content |
|------|-------|---------|---------|
| 1 | START | Modal | Free-text entry. User types description. |
| 2 | METIER_SELECTION | Modal | RAFI a identifié : Menuiserie. Transition to service selection. |
| 3 | SERVICE_SELECTION | Modal | AnswerCard: "Réglage porte intérieure" selected. |
| 4 | QUESTION_REQUIRED (SAFETY) | Modal | Safety: "Y a-t-il des signes de dommages structurels ?" → Non |
| 5 | READY_FOR_ENGINE | Modal | No further questions (0 remaining). |
| 6 | PRICE_READY | Modal | Result screen. |

**Result screen:**
```
Votre intervention est identifiée ✓
Réglage porte intérieure

300 MAD   [large — 48px bold]
PRIX FIXEO

Compris :
• Déplacement
• Réglage et alignement
• Petites fournitures standard
• Test final

Non compris :
• Remplacement du piston ou charnières défectueuses (si nécessaire)

Ce prix s'applique au périmètre indiqué. Si l'intervention réelle est
différente, l'artisan doit vous l'expliquer et obtenir votre accord
avant de continuer.

[Continuer avec ce prix — 300 MAD]
[Modifier mon besoin]
```

**Orchestrator recommendation:** MODAL_OK  
**Questions asked:** 1 (safety)  
**Engine called:** Yes  
**UX mode:** Modal throughout  

---

## Flow B — Plomberie: Robinet Remplacement → Labour + Part

**Entry mode:** SERVICE_CARD  
**Known context:** métier=plomberie, service=plomberie.robinet_remplacement  

| Step | State | Surface | Content |
|------|-------|---------|---------|
| 1 | METIER_SELECTION | Modal | Context strip: "Remplacement robinet" — skipped (known). |
| 2 | QUESTION_REQUIRED (SAFETY) | Modal | "Y a-t-il une fuite active ?" → Non |
| 3 | QUESTION_REQUIRED (ELIGIBILITY) | Modal | "Le robinet est-il standard (cuisine/salle de bain) ?" → Oui |
| 4 | READY_FOR_ENGINE | Modal | 0 remaining. Engine called. |
| 5 | LABOUR_PLUS_PART_READY | Modal | Result screen. |

**Result screen:**
```
Votre intervention est identifiée ✓
Remplacement robinet

┌─────────────────────────────────┐
│  Main-d'œuvre FIXEO             │
│  250 MAD                        │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  Pièce / matériel               │
│  Non compris dans les 250 MAD   │
└─────────────────────────────────┘

Si l'artisan fournit la pièce, son prix doit être communiqué
et approuvé avant installation.

[Continuer — Main-d'œuvre 250 MAD]
[Modifier mon besoin]
```

**Orchestrator recommendation:** MODAL_OK  
**Questions asked:** 2  
**Engine called:** Yes (LABOUR_FIXED_PART_SEPARATE)  
**UX mode:** Modal throughout  
**Forbidden:** Never sum labour and part into a fake total  

---

## Flow C — Electricité: Diagnostic → 200 MAD

**Entry mode:** DIRECT_CTA  
**User input:** "Prise électrique qui chauffe et disjoncte parfois"  

| Step | State | Surface | Content |
|------|-------|---------|---------|
| 1 | START | Modal | Free-text entry. |
| 2 | METIER_SELECTION | Modal | RAFI a identifié : Électricité. |
| 3 | SERVICE_SELECTION | Modal | Orchestrator: diagnostic route for ambiguous electrical fault. |
| 4 | QUESTION_REQUIRED (SAFETY) | Modal | "Y a-t-il une odeur de brûlé ou des traces de carbonisation ?" → Non |
| 5 | DIAGNOSTIC_READY | Modal | Engine called. Outcome: FIXEO_DIAGNOSTIC. |

**Result screen:**
```
Votre intervention nécessite d'abord un diagnostic.

200 MAD   [large — 48px bold]
Diagnostic FIXEO

Si un travail est réalisé suite au diagnostic, les 200 MAD
sont déduits de la prestation.

[Réserver le diagnostic — 200 MAD]
```

**Orchestrator recommendation:** MODAL_OK  
**No "environ 200 MAD" — exact integer only**  
**Absorption copy is electricite-specific**  

---

## Flow D — Nettoyage: Calculated Price

**Entry mode:** SERVICE_CARD  
**Known context:** métier=nettoyage, service=nettoyage.menage_domicile  

| Step | State | Surface | Content |
|------|-------|---------|---------|
| 1 | QUESTION_REQUIRED (QUANTITY) | Modal | "Combien de prestataires ?" → QuantityInput: 2 |
| 2 | QUESTION_REQUIRED (QUANTITY) | Modal | "Combien d'heures ?" → QuantityInput: 3 |
| 3 | READY_FOR_ENGINE | Modal | Engine called. |
| 4 | PRICE_READY | Modal | FIXEO_CALCULATED_PRICE. |

**Result screen:**
```
Votre intervention est identifiée ✓
Ménage à domicile

2 prestataires × 3 heures × 65 MAD   [muted basis line]

390 MAD   [large — 48px bold]
Prix FIXEO calculé

Compris :
• 2 prestataires professionnels
• Matériel de nettoyage standard
• 3 heures d'intervention

Non compris :
• Produits spéciaux sur demande
• Surfaces supérieures à [scope limit]

[Continuer avec ce prix — 390 MAD]
[Modifier mon besoin]
```

**PER_CLEANER_HOUR semantics preserved**  
**Integer hours only — no half-hour billing**  

---

## Flow E — Peinture: PAGE_REQUIRED

**Entry mode:** SERVICE_CARD  
**Known context:** métier=peinture, service=peinture.peinture_interieure  

| Step | State | Surface | Content |
|------|-------|---------|---------|
| 1 | QUESTION_REQUIRED (SAFETY) | Modal | Safety question → OK |
| 2 | ORCHESTRATOR recommends PAGE_REQUIRED | Modal | Transition screen shown. |
| 3 | Transition | Modal | "Cette intervention demande quelques précisions supplémentaires." [Continuer l'estimation] |
| 4 | Navigate to /estimation | Page | Session preserved. No restart. |
| 5 | QUESTION_REQUIRED (MEASUREMENT) | Page | "Pour calculer correctement votre prix, nous avons besoin de la surface à peindre." |
| 6 | MeasurementInput | Page | Options: "Je connais la surface" / "Aidez-moi à la calculer" |
| 7a | If known: | Page | painted_m2 numeric input. Proceed to engine. |
| 7b | If unknown: | Page | Guided measurement assistant — FUTURE DEPENDENCY. |

**No floor→painted conversion**  
**No 1.6x or 2.0x factor**  
**painted_m2 is the only canonical measurement input**  
**Desktop: two-column layout with EstimatorSummary right**  

---

## Flow F — Quote Required Intervention

**Entry mode:** DIRECT_CTA  
**Scenario:** User describes a multi-split climatisation install requiring assessment.  

| Step | State | Surface | Content |
|------|-------|---------|---------|
| 1–3 | Qualification | Modal | Questions answered. Orchestrator determines: ROUTE_REQUIRED or QUOTE_REQUIRED. |
| 4 | QUOTE_REQUIRED | Modal | Result. |

**Result screen:**
```
Cette intervention nécessite un devis.

[Service-specific reason — e.g. "L'installation multi-split nécessite
une évaluation technique sur place."]

[Demander un devis]
[Modifier mon besoin]
```

**No fake price range**  
**QUOTE_REQUIRED is a valid successful outcome**  
**No apologetic tone**  

---

## Flow G — Safety Stop

**Entry mode:** DIRECT_CTA  
**User input:** "Odeur de brûlé dans le tableau électrique"  

| Step | State | Surface | Content |
|------|-------|---------|---------|
| 1 | START | Modal | Free-text. |
| 2 | METIER_SELECTION | Modal | RAFI: Électricité. |
| 3 | QUESTION_REQUIRED (SAFETY) | Modal | "Y a-t-il une odeur de brûlé ou des traces de carbonisation ?" → Oui |
| 4 | SAFETY_STOP | Modal | Result. Surface: safety (#FFF8F0). |

**Result screen:**
```
Une vérification est nécessaire avant de continuer.

[Factual explanation from orchestrator safety doctrine.]

[Next action per orchestrator — e.g. contact relevant authority]
```

**No price shown**  
**No fear-heavy red interface**  
**Calm, factual, serious visual treatment**  
**Progress hidden**  

---

## Flow H — RAFI-Prefilled Intervention

**Entry mode:** RAFI (context pre-resolved)  
**RAFI has resolved:** métier=serrurerie, service=serrurerie.remplacement_cylindre  

| Step | State | Surface | Content |
|------|-------|---------|---------|
| 1 | Context known | Modal | Context strip immediately visible. "RAFI a identifié : Serrurerie — Remplacement cylindre" |
| 2 | QUESTION_REQUIRED | Modal | Only remaining questions asked (safety + eligibility). |
| 3 | PRICE_READY | Modal | Result. |

**Generic first screen skipped**  
**Never ask user twice for information FIXEO already knows**  
**Entry context from RAFI is reused directly**  

---

## Flow Count Summary

| Flow | Métier | Outcome | UX Mode |
|------|--------|---------|---------|
| A | Menuiserie | PRICE_READY (300 MAD) | Modal |
| B | Plomberie | LABOUR_PLUS_PART_READY | Modal |
| C | Électricité | DIAGNOSTIC_READY (200 MAD) | Modal |
| D | Nettoyage | PRICE_READY (calculated) | Modal |
| E | Peinture | PRICE_READY (page required) | Page |
| F | Climatisation | QUOTE_REQUIRED | Modal |
| G | Électricité | SAFETY_STOP | Modal |
| H | Serrurerie | PRICE_READY (RAFI-prefilled) | Modal |

**Total example flows documented: 8**
