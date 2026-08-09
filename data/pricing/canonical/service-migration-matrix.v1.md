# FIXEO Service Migration Matrix V1
## All 53 Approved Standardized Decisions

**Phase:** 7C.2  **Status:** DRAFT NON-PRODUCTION  **Date:** 2026-08-09

This matrix traces every approved service from its frozen V0.3 legacy representation to its canonical V1 design.
No service is renamed, repriced, or removed. Canonical codes are new — legacy codes remain valid references to V0.3 artifacts.


## PLOMBERIE

### `plomberie.diagnostic`

| Field | Value |
|-------|-------|
| Legacy code | `plomberie.diagnostic` |
| Canonical code | `plomberie.diagnostic` |
| V0.3 calc model | `DIAGNOSTIC` |
| Canonical calc model | `DIAGNOSTIC` |
| Commercial output | `FIXEO_DIAGNOSTIC` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **180 MAD** |
| Minimum floor | null |
| Diagnostic | ✅ 180 MAD — absorb eligible |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-DIAGNOSTIC-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-DIAGNOSTIC-ABSORPTION-PLOMBERIE-V1` |

### `plomberie.fuite_simple`

| Field | Value |
|-------|-------|
| Legacy code | `plomberie.fuite_simple` |
| Canonical code | `plomberie.fuite_simple` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **250 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |

### `plomberie.debouchage_evier`

| Field | Value |
|-------|-------|
| Legacy code | `plomberie.debouchage_evier` |
| Canonical code | `plomberie.debouchage_evier` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **250 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |

### `plomberie.debouchage_wc_simple`

| Field | Value |
|-------|-------|
| Legacy code | `plomberie.debouchage_wc_simple` |
| Canonical code | `plomberie.debouchage_wc_simple` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **300 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |

### `plomberie.robinet_remplacement`

| Field | Value |
|-------|-------|
| Legacy code | `plomberie.robinet_remplacement` |
| Canonical code | `plomberie.robinet_remplacement` |
| V0.3 calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Canonical calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Commercial output | `FIXEO_LABOUR_PRICE_PLUS_PART` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **250 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-LABOUR-PART-SEPARATE-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-PART-DISCLOSURE-V1` |
| ⚠️ Semantic correction | See Semantic Corrections section below |
| ⚠️ Human review flag | `CONFIRM_LABOUR_PART_SEPARATE_FROM_V03_HUMAN_DECISION` |

### `plomberie.chasse_eau`

| Field | Value |
|-------|-------|
| Legacy code | `plomberie.chasse_eau` |
| Canonical code | `plomberie.chasse_eau` |
| V0.3 calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Canonical calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Commercial output | `FIXEO_LABOUR_PRICE_PLUS_PART` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **300 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-LABOUR-PART-SEPARATE-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-PART-DISCLOSURE-V1` |
| ⚠️ Semantic correction | See Semantic Corrections section below |
| ⚠️ Human review flag | `CONFIRM_LABOUR_PART_SEPARATE_FROM_V03_HUMAN_DECISION` |


## ELECTRICITE

### `electricite.diagnostic`

| Field | Value |
|-------|-------|
| Legacy code | `electricite.diagnostic` |
| Canonical code | `electricite.diagnostic` |
| V0.3 calc model | `DIAGNOSTIC` |
| Canonical calc model | `DIAGNOSTIC` |
| Commercial output | `FIXEO_DIAGNOSTIC` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **200 MAD** |
| Minimum floor | null |
| Diagnostic | ✅ 200 MAD — absorb eligible |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-DIAGNOSTIC-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-ELECTRICAL-SAFETY-V1`, `POL-DIAGNOSTIC-ABSORPTION-ELECTRICITE-V1` |

### `electricite.prise_remplacement`

| Field | Value |
|-------|-------|
| Legacy code | `electricite.prise_remplacement` |
| Canonical code | `electricite.prise_remplacement` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **220 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-ELECTRICAL-SAFETY-V1` |

### `electricite.interrupteur_remplacement.simple`

| Field | Value |
|-------|-------|
| Legacy code | `electricite.interrupteur_remplacement.simple` |
| Canonical code | `electricite.interrupteur_remplacement.simple` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **220 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-ELECTRICAL-SAFETY-V1` |

### `electricite.interrupteur_remplacement.va_et_vient`

| Field | Value |
|-------|-------|
| Legacy code | `electricite.interrupteur_remplacement.va_et_vient` |
| Canonical code | `electricite.interrupteur_remplacement.va_et_vient` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **250 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-ELECTRICAL-SAFETY-V1` |

### `electricite.luminaire_installation`

| Field | Value |
|-------|-------|
| Legacy code | `electricite.luminaire_installation` |
| Canonical code | `electricite.luminaire_installation` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **220 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-ELECTRICAL-SAFETY-V1` |

### `electricite.disjoncteur_remplacement`

| Field | Value |
|-------|-------|
| Legacy code | `electricite.disjoncteur_remplacement` |
| Canonical code | `electricite.disjoncteur_remplacement` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **250 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-ELECTRICAL-SAFETY-V1` |


## SERRURERIE

### `serrurerie.porte_claquee_ouverture`

| Field | Value |
|-------|-------|
| Legacy code | `serrurerie.porte_claquee_ouverture` |
| Canonical code | `serrurerie.porte_claquee_ouverture` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **220 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-SERRURERIE-AUTHORIZATION-V1` |

### `serrurerie.porte_claquee_blindee.ouverture`

| Field | Value |
|-------|-------|
| Legacy code | `serrurerie.porte_claquee_blindee_ouverture` |
| Canonical code | `serrurerie.porte_claquee_blindee.ouverture` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **350 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-SERRURERIE-AUTHORIZATION-V1` |

### `serrurerie.porte_verrouillee.ouverture`

| Field | Value |
|-------|-------|
| Legacy code | `serrurerie.porte_verrouillee_ouverture` |
| Canonical code | `serrurerie.porte_verrouillee.ouverture` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **380 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-SERRURERIE-AUTHORIZATION-V1` |

### `serrurerie.cle_cassee_extraction`

| Field | Value |
|-------|-------|
| Legacy code | `serrurerie.cle_cassee_extraction` |
| Canonical code | `serrurerie.cle_cassee_extraction` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **220 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-SERRURERIE-AUTHORIZATION-V1` |

### `serrurerie.cylindre_remplacement.standard`

| Field | Value |
|-------|-------|
| Legacy code | `serrurerie.cylindre_remplacement_standard` |
| Canonical code | `serrurerie.cylindre_remplacement.standard` |
| V0.3 calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Canonical calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Commercial output | `FIXEO_LABOUR_PRICE_PLUS_PART` |
| Unit | `PER_ITEM` |
| Approved price MAD | **280 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `ARTISAN_DISCLOSED_SEPARATE` |
| Formula | `FORMULA-LABOUR-PART-SEPARATE-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-SERRURERIE-AUTHORIZATION-V1`, `POL-PART-DISCLOSURE-V1` |

### `serrurerie.serrure_remplacement.standard`

| Field | Value |
|-------|-------|
| Legacy code | `serrurerie.serrure_remplacement_standard` |
| Canonical code | `serrurerie.serrure_remplacement.standard` |
| V0.3 calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Canonical calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Commercial output | `FIXEO_LABOUR_PRICE_PLUS_PART` |
| Unit | `PER_ITEM` |
| Approved price MAD | **400 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `ARTISAN_DISCLOSED_SEPARATE` |
| Formula | `FORMULA-LABOUR-PART-SEPARATE-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-SERRURERIE-AUTHORIZATION-V1`, `POL-PART-DISCLOSURE-V1` |


## CLIMATISATION

### `climatisation.diagnostic`

| Field | Value |
|-------|-------|
| Legacy code | `CLIM-002` |
| Canonical code | `climatisation.diagnostic` |
| V0.3 calc model | `DIAGNOSTIC` |
| Canonical calc model | `DIAGNOSTIC` |
| Commercial output | `FIXEO_DIAGNOSTIC` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **250 MAD** |
| Minimum floor | null |
| Diagnostic | ✅ 250 MAD — absorb eligible |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-DIAGNOSTIC-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-DIAGNOSTIC-ABSORPTION-CLIM-V1` |

### `climatisation.entretien_annuel`

| Field | Value |
|-------|-------|
| Legacy code | `CLIM-003` |
| Canonical code | `climatisation.entretien_annuel` |
| V0.3 calc model | `UNIT_MULTIPLICATION` |
| Canonical calc model | `UNIT_MULTIPLICATION` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_AC_UNIT` |
| Approved price MAD | **300 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-UNIT-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |
| Batch | `APPROVED` — Per AC unit — linear |

### `climatisation.desinfection_profonde`

| Field | Value |
|-------|-------|
| Legacy code | `CLIM-004` |
| Canonical code | `climatisation.desinfection_profonde` |
| V0.3 calc model | `UNIT_MULTIPLICATION` |
| Canonical calc model | `UNIT_MULTIPLICATION` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_AC_UNIT` |
| Approved price MAD | **450 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-UNIT-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |
| Batch | `APPROVED` — Per AC unit — linear |

### `climatisation.recharge_gaz_r22`

| Field | Value |
|-------|-------|
| Legacy code | `CLIM-009` |
| Canonical code | `climatisation.recharge_gaz_r22` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **250 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-REFRIGERATION-INTEGRITY-V1` |

### `climatisation.reparation_fuite_recharge`

| Field | Value |
|-------|-------|
| Legacy code | `CLIM-013` |
| Canonical code | `climatisation.reparation_fuite_recharge` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **600 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-REFRIGERATION-INTEGRITY-V1` |

### `climatisation.installation.standard`

| Field | Value |
|-------|-------|
| Legacy code | `CLIM-020` |
| Canonical code | `climatisation.installation.standard` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `PER_INSTALLATION` |
| Approved price MAD | **1000 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |

### `climatisation.installation.cassette`

| Field | Value |
|-------|-------|
| Legacy code | `CLIM-021` |
| Canonical code | `climatisation.installation.cassette` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `PER_INSTALLATION` |
| Approved price MAD | **1200 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |

### `climatisation.desinstallation`

| Field | Value |
|-------|-------|
| Legacy code | `CLIM-030` |
| Canonical code | `climatisation.desinstallation` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **550 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |


## BRICOLAGE

### `bricolage.visite_minimum`

| Field | Value |
|-------|-------|
| Legacy code | `BRIC-001` |
| Canonical code | `bricolage.visite_minimum` |
| V0.3 calc model | `MINIMUM_FLOOR` |
| Canonical calc model | `MINIMUM_FLOOR` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **200 MAD** |
| Minimum floor | ✅ 200 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-MINIMUM-FLOOR-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-BRICOLAGE-BOUNDARY-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `bricolage.horaire`

| Field | Value |
|-------|-------|
| Legacy code | `BRIC-002` |
| Canonical code | `bricolage.horaire` |
| V0.3 calc model | `TIME_BASED_SINGLE` |
| Canonical calc model | `TIME_BASED_SINGLE` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_HOUR` |
| Approved price MAD | **150 MAD** |
| Minimum floor | ✅ 200 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-TIME-SINGLE-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-BRICOLAGE-BOUNDARY-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |
| Batch | `APPROVED` — Single artisan time-based |

### `bricolage.demi_journee`

| Field | Value |
|-------|-------|
| Legacy code | `BRIC-003` |
| Canonical code | `bricolage.demi_journee` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `PER_HALF_DAY` |
| Approved price MAD | **400 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-BRICOLAGE-BOUNDARY-V1` |
| Batch | `APPROVED` — Single artisan time-based |

### `bricolage.montage_meuble`

| Field | Value |
|-------|-------|
| Legacy code | `BRIC-010` |
| Canonical code | `bricolage.montage_meuble` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_ITEM` |
| Approved price MAD | **200 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-BRICOLAGE-BOUNDARY-V1` |

### `bricolage.fixation_accrochage`

| Field | Value |
|-------|-------|
| Legacy code | `BRIC-020` |
| Canonical code | `bricolage.fixation_accrochage` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_ITEM` |
| Approved price MAD | **200 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-BRICOLAGE-BOUNDARY-V1` |

### `bricolage.intervention_conditionnelle`

| Field | Value |
|-------|-------|
| Legacy code | `BRIC-030` |
| Canonical code | `bricolage.intervention_conditionnelle` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **300 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-BRICOLAGE-BOUNDARY-V1` |


## NETTOYAGE

### `nettoyage.visite_minimum`

| Field | Value |
|-------|-------|
| Legacy code | `NET-001` |
| Canonical code | `nettoyage.visite_minimum` |
| V0.3 calc model | `MINIMUM_FLOOR` |
| Canonical calc model | `MINIMUM_FLOOR` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **200 MAD** |
| Minimum floor | ✅ 200 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-MINIMUM-FLOOR-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `nettoyage.menage_standard`

| Field | Value |
|-------|-------|
| Legacy code | `NET-002` |
| Canonical code | `nettoyage.menage_standard` |
| V0.3 calc model | `TIME_BASED_TEAM` |
| Canonical calc model | `TIME_BASED_TEAM` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_CLEANER_HOUR` |
| Approved price MAD | **65 MAD** |
| Minimum floor | ✅ 200 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-TIME-TEAM-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-CLEANER-HOUR-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |
| Batch | `APPROVED` — Total = 65 × workers × hours |

### `nettoyage.grand_menage`

| Field | Value |
|-------|-------|
| Legacy code | `NET-004` |
| Canonical code | `nettoyage.grand_menage` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **600 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-CLEANER-HOUR-V1` |

### `nettoyage.canape.deux_places`

| Field | Value |
|-------|-------|
| Legacy code | `NET-010` |
| Canonical code | `nettoyage.canape.deux_places` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `PER_ITEM` |
| Approved price MAD | **300 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |

### `nettoyage.canape.trois_places`

| Field | Value |
|-------|-------|
| Legacy code | `NET-011` |
| Canonical code | `nettoyage.canape.trois_places` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `PER_ITEM` |
| Approved price MAD | **450 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |

### `nettoyage.matelas.simple`

| Field | Value |
|-------|-------|
| Legacy code | `NET-013` |
| Canonical code | `nettoyage.matelas.simple` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `PER_ITEM` |
| Approved price MAD | **250 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |

### `nettoyage.matelas.double`

| Field | Value |
|-------|-------|
| Legacy code | `NET-014` |
| Canonical code | `nettoyage.matelas.double` |
| V0.3 calc model | `FIXED` |
| Canonical calc model | `FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `PER_ITEM` |
| Approved price MAD | **300 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1` |

### `nettoyage.apres_travaux`

| Field | Value |
|-------|-------|
| Legacy code | `NET-030` |
| Canonical code | `nettoyage.apres_travaux` |
| V0.3 calc model | `UNIT_MULTIPLICATION_WITH_FLOOR` |
| Canonical calc model | `UNIT_MULTIPLICATION_WITH_FLOOR` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_M2` |
| Approved price MAD | **18 MAD** |
| Minimum floor | ✅ 1000 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-UNIT-WITH-FLOOR-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |


## PEINTURE

### `peinture.forfait_minimum`

| Field | Value |
|-------|-------|
| Legacy code | `PEIN-001` |
| Canonical code | `peinture.forfait_minimum` |
| V0.3 calc model | `MINIMUM_FLOOR` |
| Canonical calc model | `MINIMUM_FLOOR` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **800 MAD** |
| Minimum floor | ✅ 800 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-MINIMUM-FLOOR-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-PAINTED-SURFACE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `peinture.mur_interieur.labour_only`

| Field | Value |
|-------|-------|
| Legacy code | `PEIN-002` |
| Canonical code | `peinture.mur_interieur.labour_only` |
| V0.3 calc model | `UNIT_MULTIPLICATION_WITH_FLOOR` |
| Canonical calc model | `UNIT_MULTIPLICATION_WITH_FLOOR` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_PAINTED_M2` |
| Approved price MAD | **35 MAD** |
| Minimum floor | ✅ 800 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-UNIT-WITH-FLOOR-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-PAINTED-SURFACE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `peinture.mur_interieur.all_in`

| Field | Value |
|-------|-------|
| Legacy code | `PEIN-003` |
| Canonical code | `peinture.mur_interieur.all_in` |
| V0.3 calc model | `UNIT_MULTIPLICATION_WITH_FLOOR` |
| Canonical calc model | `UNIT_MULTIPLICATION_WITH_FLOOR` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_PAINTED_M2` |
| Approved price MAD | **65 MAD** |
| Minimum floor | ✅ 800 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-UNIT-WITH-FLOOR-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-PAINTED-SURFACE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `peinture.plafond.labour_only`

| Field | Value |
|-------|-------|
| Legacy code | `PEIN-004` |
| Canonical code | `peinture.plafond.labour_only` |
| V0.3 calc model | `UNIT_MULTIPLICATION_WITH_FLOOR` |
| Canonical calc model | `UNIT_MULTIPLICATION_WITH_FLOOR` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_CEILING_M2` |
| Approved price MAD | **45 MAD** |
| Minimum floor | ✅ 800 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-UNIT-WITH-FLOOR-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-PAINTED-SURFACE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `peinture.mur_interieur.all_in_avec_prep`

| Field | Value |
|-------|-------|
| Legacy code | `PEIN-005` |
| Canonical code | `peinture.mur_interieur.all_in_avec_prep` |
| V0.3 calc model | `UNIT_MULTIPLICATION_WITH_FLOOR` |
| Canonical calc model | `UNIT_MULTIPLICATION_WITH_FLOOR` |
| Commercial output | `FIXEO_CALCULATED_PRICE` |
| Unit | `PER_PAINTED_M2` |
| Approved price MAD | **75 MAD** |
| Minimum floor | ✅ 800 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-UNIT-WITH-FLOOR-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-PAINTED-SURFACE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `peinture.preparation_surface`

| Field | Value |
|-------|-------|
| Legacy code | `PEIN-008` |
| Canonical code | `peinture.preparation_surface` |
| V0.3 calc model | `ADD_ON` |
| Canonical calc model | `ADD_ON` |
| Commercial output | `FIXEO_ADD_ON` |
| Unit | `PER_PAINTED_M2` |
| Approved price MAD | **25 MAD** |
| Minimum floor | null |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-ADDON-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-PAINTED-SURFACE-V1` |


## MENUISERIE

### `menuiserie.reglage_porte.sans_rabotage`

| Field | Value |
|-------|-------|
| Legacy code | `MENU_001` |
| Canonical code | `menuiserie.reglage_porte.sans_rabotage` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `PER_DOOR` |
| Approved price MAD | **300 MAD** |
| Minimum floor | ✅ 300 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `menuiserie.reglage_porte.avec_rabotage`

| Field | Value |
|-------|-------|
| Legacy code | `MENU_001B` |
| Canonical code | `menuiserie.reglage_porte.avec_rabotage` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `PER_DOOR` |
| Approved price MAD | **350 MAD** |
| Minimum floor | ✅ 300 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `menuiserie.remplacement_charniere`

| Field | Value |
|-------|-------|
| Legacy code | `MENU_002` |
| Canonical code | `menuiserie.remplacement_charniere` |
| V0.3 calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Canonical calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Commercial output | `FIXEO_LABOUR_PRICE_PLUS_PART` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **300 MAD** |
| Minimum floor | ✅ 300 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-LABOUR-PART-SEPARATE-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-MENUISERIE-HARDWARE-V1`, `POL-PART-DISCLOSURE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |
| Batch | `EXPERIMENTAL_BATCH_RULE` — SAME_DOOR_SAME_VISIT only — different cabinet = new full bas |

### `menuiserie.remplacement_coulisse_tiroir`

| Field | Value |
|-------|-------|
| Legacy code | `MENU_003` |
| Canonical code | `menuiserie.remplacement_coulisse_tiroir` |
| V0.3 calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Canonical calc model | `LABOUR_FIXED_PART_SEPARATE` |
| Commercial output | `FIXEO_LABOUR_PRICE_PLUS_PART` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **300 MAD** |
| Minimum floor | ✅ 300 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-LABOUR-PART-SEPARATE-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-MENUISERIE-HARDWARE-V1`, `POL-PART-DISCLOSURE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |
| Batch | `EXPERIMENTAL_BATCH_RULE` — SAME_CABINET_SAME_VISIT only — different cabinet = new full  |

### `menuiserie.deblocage_porte_coulissante.sans_piece`

| Field | Value |
|-------|-------|
| Legacy code | `MENU_004A` |
| Canonical code | `menuiserie.deblocage_porte_coulissante.sans_piece` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **300 MAD** |
| Minimum floor | ✅ 300 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `NOT_APPLICABLE` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `menuiserie.deblocage_porte_coulissante.avec_galets`

| Field | Value |
|-------|-------|
| Legacy code | `MENU_004B` |
| Canonical code | `menuiserie.deblocage_porte_coulissante.avec_galets` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `FLAT_INTERVENTION` |
| Approved price MAD | **350 MAD** |
| Minimum floor | ✅ 300 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `ARTISAN_SUPPLIED_INCLUDED` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |

### `menuiserie.installation_porte`

| Field | Value |
|-------|-------|
| Legacy code | `MENU_006` |
| Canonical code | `menuiserie.installation_porte` |
| V0.3 calc model | `CONDITIONAL_FIXED` |
| Canonical calc model | `CONDITIONAL_FIXED` |
| Commercial output | `FIXEO_PRICE` |
| Unit | `PER_DOOR` |
| Approved price MAD | **500 MAD** |
| Minimum floor | ✅ 300 MAD (NON_ADDITIVE) |
| Diagnostic | — |
| Parts policy | `CLIENT_SUPPLIED` |
| Formula | `FORMULA-CONDITIONAL-FIXED-V1` |
| Policies | `POL-HORS-PERIMETRE-V1`, `POL-MINIMUM-NON-ADDITIVE-V1` |


## Summary Statistics

| Stat | Value |
|------|-------|
| Total services | 53 |
| Canonical codes created | 53 |
| Legacy codes mapped | 53 |
| Semantic corrections | 2 (plomberie.robinet_remplacement, plomberie.chasse_eau) |
| Human review flags | 2 (same 2 services — confirm from V0.3 human-decision doc) |
| Price changes | **0** |
| All production_ready | **false** |
| All activation flags | **false** |

## Semantic Corrections

Two services in V0.3 were marked `pricing_architecture = FIXEO_FIXED_PRICE` but their `label_fr`, `excluded_scope`, and `part_supply_policy` explicitly state the replacement part is excluded and client-supplied:

- **`plomberie.robinet_remplacement`** — label: 'main-d'œuvre seule'; excluded_scope: 'the tap or mixer itself — NOT included'; part_supply_policy: 'CLIENT SUPPLIES THE TAP/MIXER BY DEFAULT'
- **`plomberie.chasse_eau`** — label: 'main-d'œuvre seule'; excluded_scope: 'replacement flushing mechanism NOT included'; part_supply_policy: 'CLIENT SUPPLIES THE REPLACEMENT MECHANISM BY DEFAULT'

**Canonical classification: `LABOUR_FIXED_PART_SEPARATE` / `FIXEO_LABOUR_PRICE_PLUS_PART`**

This is a **semantic correction, not a price change**. The approved labour price (250 MAD / 300 MAD) is unchanged.

**Human review flag:** Confirm this interpretation against `plomberie/human-decision.v0.3.md` before production promotion.