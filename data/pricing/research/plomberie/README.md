# FIXEO Plumbing Pricing Research — V0 Methodology

**Status: RESEARCH_V0_NOT_PRODUCTION**  
**Version:** 0.1.0  
**Research completed:** 2026-08-09  
**Registry:** `fixeo_plumbing_pricing`  
**Conducted as part of:** Phase 7B.3 — FIXEO Fair Price Research — Plumbing Morocco Pilot  

---

## ⚠️ Non-Production Notice

This directory contains research artifacts only. These files:

- ARE NOT loaded by any production JavaScript runtime
- ARE NOT referenced by any HTML page
- ARE NOT imported from any JS module
- ARE NOT connected to any pricing surface (cards, estimator, reservation, booking, profiles, SEO)
- MUST NOT be displayed to users without a formal product review cycle

The prices in this registry represent external market research evidence. They are not FIXEO's commercial prices.

---

## Purpose

This registry converts the Phase 7B.3 independent market research on Moroccan plumbing pricing into a structured, source-traceable, machine-readable canonical dataset.

It exists to:
1. Provide an auditable evidence base for future production pricing decisions
2. Establish FIXEO's internal fair-price methodology for plumbing
3. Identify which services are ready for standardization vs. which require quotes
4. Enable honest comparison between market evidence and FIXEO's current legacy pricing

---

## File Architecture

```
data/pricing/research/plomberie/
├── registry.v0.json      Primary canonical service registry (19 entries)
├── evidence.v0.json      Raw evidence observations with normalization notes
├── sources.v0.json       Source registry (11 sources, 8 usable)
├── exclusions.v0.json    Complete log of rejected observations (16 entries)
└── README.md             This file — methodology documentation
```

**Legacy comparison:** `data/pricing/research/plomberie/legacy-comparison.md` (see Section 10 below)

---

## Pricing Doctrine

**Core rule:** All FIXEO reference prices for plumbing services represent **LABOUR + TRAVEL ONLY**.

```
RULE 1: Labour + Travel baseline
  Basic consumables (téflon, joint d'étanchéité, pâte de joint) ≤50 DH
  are absorbed into the forfait per universal Moroccan market consensus.

RULE 2: Separate parts invoicing
  Any replacement part costing >50 DH MUST be quoted separately
  and confirmed with the client BEFORE installation begins.

RULE 3: Equipment separation
  All fixtures (robinet, chauffe-eau, WC, lavabo, mécanisme de chasse)
  are invoiced separately — NEVER silently bundled into a "forfait".

RULE 4: Client sourcing right
  Client has the right to purchase materials themselves
  (Bricoma, droguerie, Aswak Assalam).
  If artisan supplies materials, client may request the purchase receipt.

RULE 5: Diagnostic fee independence
  A diagnostic/call-out fee is charged even if the client does not
  proceed with the repair. This is confirmed Moroccan market practice.
  The diagnostic fee is NOT automatically deductible from the repair price.
```

---

## Service Taxonomy

### Final canonical service codes (19 entries)

| Code | Label | Mode | Status |
|------|-------|------|--------|
| `plomberie.diagnostic` | Déplacement et diagnostic | STANDARDIZED | Priced |
| `plomberie.fuite_simple` | Réparation fuite simple (visible, accessible) | NARROW_RANGE | Priced |
| `plomberie.fuite_localisation` | Localisation fuite cachée (détection seule) | DIAGNOSIS_FIRST | Priced (LOW) |
| `plomberie.fuite_encastree` | Réparation fuite encastrée (cassage requis) | DIAGNOSIS_FIRST | Priced (LOW) |
| `plomberie.debouchage_evier` | Débouchage évier ou lavabo (manuel) | NARROW_RANGE | Priced |
| `plomberie.debouchage_wc_simple` | Débouchage WC (manuel) | NARROW_RANGE | Priced |
| `plomberie.debouchage_wc_professionnel` | Débouchage WC (équipement motorisé) | ESTIMATION | Priced (LOW) |
| `plomberie.robinet_remplacement` | Remplacement robinet/mitigeur (MO seule) | STANDARDIZED | Priced |
| `plomberie.chasse_eau` | Remplacement mécanisme chasse d'eau (MO seule) | STANDARDIZED | Priced |
| `plomberie.chauffe_eau_reparation` | Dépannage chauffe-eau (diagnostic inclus) | DIAGNOSIS_FIRST | Priced (LOW) |
| `plomberie.chauffe_eau_installation_electrique` | Installation chauffe-eau électrique (MO seule) | ESTIMATION | Priced (LOW) |
| `plomberie.chauffe_eau_installation_gaz` | Installation chauffe-eau à gaz (MO seule) | ESTIMATION | Priced (LOW) |
| `plomberie.debouchage_colonne` | Débouchage colonne ou canalisation principale | ESTIMATION | Priced (LOW) |
| `plomberie.sanitaire_lavabo` | Pose lavabo/vasque (MO seule) | ESTIMATION | Priced (LOW, 1 source) |
| `plomberie.sanitaire_wc_standard` | Pose WC standard (MO seule) | ESTIMATION | Priced (LOW, 1 source) |
| `plomberie.sanitaire_wc_suspendu` | Pose WC suspendu + bâti-support (MO seule) | ESTIMATION | Priced (LOW, 1 source) |
| `plomberie.flexible_remplacement` | Remplacement flexible | STANDARDIZED | NULL — absorbed into fuite_simple |
| `plomberie.siphon_remplacement` | Remplacement siphon | STANDARDIZED | NULL — absorbed into other services |
| `plomberie.salle_de_bain` | Rénovation salle de bain | QUOTE_REQUIRED | NULL — permanently quote-required |
| `plomberie.urgence` | Modificateur urgence/nuit/week-end | QUOTE_REQUIRED | NULL — qualitative only |

**Taxonomy decisions:**

The original 15-service list from Phase 7B.3 was expanded to 19+1 entries:
- `plomberie.fuite_diagnostic` was split into `fuite_localisation` (detection only) and `fuite_encastree` (access + repair) — evidence confirmed these are incompatible scopes with non-overlapping price ranges
- `plomberie.debouchage_wc` was split into `debouchage_wc_simple` and `debouchage_wc_professionnel` — sources explicitly distinguish manual vs motorized methods
- `plomberie.chauffe_eau_installation` was split into `_electrique` and `_gaz` — different materials policy, different compliance requirements, different price tier
- `plomberie.sanitaire_installation` was split into `sanitaire_lavabo`, `sanitaire_wc_standard`, `sanitaire_wc_suspendu` — prices differ significantly (200 vs 800+ DH)
- `plomberie.urgence` retained as an explicit entry to document the urgency evidence and legacy comparison — but no numeric price is assigned

---

## Unit Doctrine

Only these units apply to Moroccan plumbing:

| Unit | Definition | Services |
|------|-----------|---------|
| `FLAT_INTERVENTION` | Fixed forfait per completed intervention. Includes labour + travel. | Most repair and installation services |
| `FLAT_DIAGNOSTIC` | Fixed forfait for a diagnostic/detection visit. May or may not lead to repair. | plomberie.diagnostic, fuite_localisation |
| `QUOTE_ONLY` | No reference price applicable. Artisan quote required before work. | salle_de_bain, urgence, canalisation_renovation |

**No per-m², per-linear-metre, per-item, or hourly units are used for plumbing in this registry.** The Moroccan market operates exclusively on forfait per intervention for residential plumbing.

---

## Fair-Price Methodology

### Source quality weighting

| Grade | Weight | Criteria |
|-------|--------|----------|
| B+ | 0.50 | Structured observation methodology declared, 300+ data points (afous.ma) |
| C+ | 0.35 | Multiple services with explicit scope, materials noted, plausible methodology |
| C | 0.15 | Platform editorial, no methodology, reasonable consistency |
| D | 0.00 | Artisan self-published, undated, incompatible scope |

### Calculation

```
fair_price = Σ(source_midpoint × source_weight) / Σ(weights)

fair_low = P30 of the included observation band
  → minimum observed value from C+ or better sources
  → must be ≥ artisan economic floor

fair_high = P75 of the included observation band
  → ceiling normalized to exclude scope-creep upper values
```

### Artisan economic floor (Casablanca, standard hours)

```
Minimum viable job: ≥150 DH
  (based on: 30 DH fuel, 50 DH tools/overhead, 15% FIXEO commission,
   monthly income target 6,000 DH / 22 days / 3 jobs per day = ~91 DH gross)

Any price below 150 DH for Casablanca standard-hours:
  → flag as artisan economic floor risk
  → do not display as "fair low" without explicit disclosure
```

### Exclusion criteria

Values excluded from fair_price calculation:
- Upper bound observations that include scope-creep (e.g., complex installation bundled with standard installation)
- Observations where labour cannot be separated from materials
- Single-source observations with conflicting ranges from other sources (document in exclusions.v0.json)
- Internal FIXEO T0/T1 data (never used as external evidence — circular validation)
- City-specific observations excluded from national aggregate (retained for geographic analysis only)

---

## Confidence Methodology

| Level | Minimum criteria |
|-------|-----------------|
| HIGH | ≥3 independent publishers, afous.ma P30–P70 available, 0% source conflict |
| MEDIUM | ≥2 independent publishers including ≥1 B+ or C+ source, tight convergence |
| LOW | 1 independent publisher only, OR significant source conflict, OR scope-creep uncertainty |
| INSUFFICIENT | 0 usable observations, or service is structurally not priceable |

**No service reaches HIGH confidence in V0.** The maximum achievable with current research is MEDIUM (requires at least 3 truly independent publishers including afous.ma).

---

## Materials Doctrine

| Policy | Definition |
|--------|-----------|
| `LABOUR_ONLY` | Artisan provides only labour. All parts/fixtures supplied by client or invoiced separately by artisan |
| `LABOUR_PLUS_BASIC_CONSUMABLES` | Labour + basic sealing materials (téflon, joint, pâte d'étanchéité) ≤50 DH total, universally absorbed |
| `LABOUR_ONLY_EQUIPMENT_SEPARATE` | Chauffe-eau, sanitaire — client supplies equipment; artisan invoices equipment separately if they supply it |
| `NONE_APPLICABLE` | Débouchage — no materials consumed |
| `UNKNOWN` | Source did not specify |

---

## Geography Doctrine

**V0 geographic scope: NATIONAL_MOROCCO with Casablanca as reference city.**

Geographic price variation is confirmed qualitatively:

```
4-cluster model (evidence-supported, ratios NOT validated):

Cluster A (Casablanca, Rabat/Salé):   Reference tier     → ratio 0.85–1.00
Cluster B (Marrakech, Tanger, Agadir): Mid tier          → ratio 0.75–0.90
Cluster C (Fès, Meknès, Oujda, ...):  Lower tier        → ratio 0.60–0.75
Cluster D (Rural, small towns):        Lowest tier       → ratio 0.40–0.60
```

**Why not encoded in V0:** City multipliers are derived from a single editorial source (mano.ma hourly rates). This is insufficient for defensible per-city pricing. FIXEO will need ≥10 observed quotes per city per service before city-specific pricing can be reliable.

**V1 recommendation:** Use Casablanca as the reference city. Display "Tarifs indicatifs — référence Casablanca" on all price-facing surfaces. Apply conservative cluster adjustments only after FIXEO transaction data validates the ratios.

---

## Urgency / Night / Weekend Doctrine

**V0 finding:** No standardized urgency surcharge exists in the Moroccan plumbing market.

Evidence (single editorial source — SRC_PLUMBING_001):
- Evening (18h–22h): +20% to +50%
- Night (22h–8h): +50% to +100%
- Weekend/holiday: +50% to +150%
- Some artisans: +0% (no surcharge)

**Decision:** V0 does NOT encode numeric urgency modifiers. The correct FIXEO approach:

```
User-facing disclosure:
"Interventions en soirée et week-end : majoration possible.
Vérifiez le tarif avec votre artisan avant de confirmer."

Platform requirement:
Artisans must declare their urgency policy in their profile
(no surcharge / evening surcharge / night surcharge).
```

**Legacy values assessed:** FIXEO's current +40% urgence, +25% nuit, +20% weekend modifiers are ALL systematically too low vs. market evidence. These must be removed from any user-facing display and not encoded as contractual values.

---

## Limitations

1. **No individual transaction data.** Even afous.ma's 2,475 observations are aggregated — no access to individual price data points.

2. **afous.ma methodology unauditable.** "Relevés terrain" = self-reported. Potential response bias from highly active respondents.

3. **Duplication risk.** Some editorial sources likely cross-reference each other. Detected and weighted accordingly but cannot be fully excluded.

4. **Casablanca bias.** Most sources use Casablanca as reference. Evidence for smaller cities (Oujda, Safi, Beni Mellal) is essentially absent.

5. **No artisan cost accounting.** Economic floor analysis uses salary estimates (leplombier.ma) + inference — not a structured artisan cost survey.

6. **Materials market prices not researched.** Prices for robinets, kits mécanisme, and chauffe-eau units at Bricoma/Aswak Assalam not verified — assumed from consumer knowledge.

7. **Temporal:** Research completed 2026-08-09. afous.ma 0% price change over 12 months suggests stability. Verify annually.

---

## Rules for Updating Registry

1. **Never update a price without adding a supporting evidence row** in `evidence.v0.json` with a valid `source_id`.

2. **Never add a source without a complete entry** in `sources.v0.json` — including methodology summary and limitations.

3. **Never silently discard an observation.** If a price is rejected, add it to `exclusions.v0.json` with an explicit reason code.

4. **Never use internal FIXEO data as external evidence.** FIXEO T0/T1 data goes in `legacy-comparison.md` only.

5. **Confidence may only be increased** when additional independent sources are added. A single new source does not raise INSUFFICIENT → MEDIUM.

6. **City multipliers may only be encoded** when FIXEO has ≥10 observed accepted quotes (T2) per city per service.

7. **Version must be bumped** (0.1.0 → 0.2.0 → ... → 1.0.0) for any price change in the registry.

8. **`production_ready` remains `false`** until formal FIXEO product review and sign-off.

---

## Versioning Policy

| Version | Meaning |
|---------|---------|
| 0.x.y | Research phase — no production use |
| 1.0.0 | First production-ready version — requires formal product sign-off |
| 1.x.y | Production version — backwards-compatible additions |
| 2.0.0 | Breaking change to schema or service taxonomy |

Version format: `MAJOR.MINOR.PATCH`
- PATCH: add evidence rows, fix notes, add exclusion records
- MINOR: add new service entries, update prices based on new research
- MAJOR: change taxonomy, change schema, change methodology

---

## How Future FIXEO Transactions Should Replace This Data

The evidence hierarchy for future pricing (from Phase 7B.2):

```
T0 (current editorial maps)     → to be deprecated
T1 (this registry)              → interim reference, 2026–2027
T2 (quotes.proposed_price)      → when ≥5 distinct artisans per bucket
T3 (missions.agreed_price)      → when ≥5 completed missions per bucket
T4 (final payment amount)       → requires missions.final_price field (not yet in schema)
```

**When T2 data is available (≥10 accepted quotes per service per city):**
- Run P25/P50/P75 on `quotes.proposed_price` joined with `service_requests.service_category` + `city`
- Exclude observations >18 months old at 0.5× weight; exclude >36 months
- Compare T2 P50 vs. this registry's `fair_price`
- If delta >20%: update registry with new evidence, trigger product review
- If delta <20%: keep current registry value, note T2 corroboration

**Schema additions needed before T2 data is usable:**

```sql
ALTER TABLE missions ADD COLUMN service_sub_code text;         -- PRIORITY 1
ALTER TABLE missions ADD COLUMN final_price_DH numeric;        -- PRIORITY 2
ALTER TABLE missions ADD COLUMN complexity text;               -- PRIORITY 3
ALTER TABLE missions ADD COLUMN material_policy text;          -- PRIORITY 4
ALTER TABLE missions ADD COLUMN urgency_context text;          -- PRIORITY 5
ALTER TABLE missions ADD COLUMN urgency_surcharge_pct numeric; -- PRIORITY 5
```

---

## Responsible Use

This research was conducted in good faith using publicly available Moroccan digital sources. All prices are indicative and subject to:
- Artisan discretion (Morocco: fully bespoke market)
- Current materials costs
- Geographic variation
- Urgency conditions
- Specific intervention complexity discovered on-site

FIXEO must never present these prices as guaranteed quotes, contractual obligations, or legally binding price schedules. All user-facing price displays must include the disclaimer:

> "Prix indicatifs — tarif réel confirmé avec l'artisan avant intervention."
