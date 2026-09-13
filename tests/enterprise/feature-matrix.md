# BP07 Feature Matrix

> Generated: 2026-09-13T12:26:21.302Z
> Source: `scripts/enterprise/feature-matrix.js`

## Role Legend

| Role | Description |
| --- | --- |
| `owner` | Propriétaire — full access |
| `admin` | Administrateur — full access |
| `operations_manager` | Resp. opérations — can confirm |
| `site_manager` | Resp. site — can confirm |
| `reporter` | Déclarant — can create, cannot confirm |
| `viewer` | Observateur — read only |

## Feature Access Matrix

Feature | Description | owner | admin | operations_manager | site_manager | reporter | viewer
--- | --- | --- | --- | --- | --- | --- | ---
BP07-A: Vue du jour — panel visible | Daily brief panel shown in overview | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-A: Vue du jour — "Action requise" (completed + no_match) | Shows count of completed+no_match requiring action | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-A: Vue du jour — completed items counted in "Action requise" | Completed items counted only when user canConfirm | ✅ | ✅ | ✅ | ✅ | — | —
BP07-B: Répartition — panel visible | Health summary panel shown in overview | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-B: Répartition — status distribution | Shows breakdown by status | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-B: Répartition — top sites | Shows top sites by open request count | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-C: Comparaison des sites — toggle button | Site comparison toggle shown in sites section | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-C: Comparaison des sites — table data | Table shows factual counts per site | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-D: Quick Actions — Interventions button | Navigate to requests | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-D: Quick Actions — Urgences button | Filter to urgency=now and navigate to requests | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-D: Quick Actions — Valider button (conditional) | Shown only when canConfirm AND completed count > 0 | ✅ | ✅ | ✅ | ✅ | — | —
BP07-D: Quick Actions — Nouvelle intervention button | Shown only when canCreate | ✅ | ✅ | ✅ | ✅ | ✅ | —
BP07-D: Quick Actions — Recherche button | Open command palette / search | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-E: URL Hash — section preserved on navigate | pushNavState called on navigateTo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-E: URL Hash — state restored on load | restoreNavState called after bootApp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-F: Mock dataset — generate-mock-data.js | Generates tests/enterprise/mock-data.json | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-F: Viewport report — viewport-report.js | Generates tests/enterprise/viewport-report.txt | ✅ | ✅ | ✅ | ✅ | ✅ | ✅
BP07-F: Feature matrix — feature-matrix.js | Generates tests/enterprise/feature-matrix.md | ✅ | ✅ | ✅ | ✅ | ✅ | ✅

## Notes

- ✅ = accessible / enabled for this role
- — = not available for this role
- Conditional features (e.g. "Valider button") require both the role permission AND runtime data conditions (e.g. completed count > 0).
- BP07-F QA tooling scripts are not role-gated — they run in the CI/QA environment.
