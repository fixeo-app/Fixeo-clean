# Bloc 8 — Command UX / Security / Observability / Certification

Baseline Production certifiée : `3bda113c3ba74351f9fb9da4df85164e92165b81`.

Blueprint source : `FIXEO-Control-OS-Master-Blueprint-Bloc-0.md`. Aucun nouveau contrat métier, aucune autorité métier supplémentaire et aucune migration DB ne sont introduits par 8.1.

## 8.1 — UX / accessibilité

Objectif : desktop, tablette et mobile lisibles ; navigation clavier ; command palette ; dossier latéral conservé ; aucune mutation déclenchée par raccourci.

Implémentation :
- `Ctrl/Cmd+K` ouvre une palette de commandes non mutante.
- `/` amène à la recherche universelle canonique.
- La palette peut naviguer entre les vues et chercher des dossiers via `control_search_all_v1` derrière `/api/control-v1/search`.
- Les résultats dossier ouvrent `FixeoDossier` ; ils ne déclenchent jamais une capability métier.
- `Escape` ferme la palette et restaure le focus ; le menu mobile expose son état ARIA.
- Skip-link, focus visible, labels, status live, touch targets >=44 px et reduced-motion.
- Cibles responsive certifiées dans le gate navigateur : 1440 / 1280 / 1024 / 768 / 390.

Preuve attendue : `tests/control-contract/browser-bloc8.cjs` et artefact CI `docs/control-os/bloc8/evidence/browser/results.json`.

## Gates suivants

8.2 : permissions, traces source/request, erreurs/cache/refresh, redaction PII ; instrumentation minimale seulement.

8.3 : candidat unique, environnement dédié, preview puis Production du même candidat, rollback compatible et vérification assets.

8.4 : glossaire KPI, guide actions/erreurs et procédures d’escalade.

Une seule action logique à la fois. Le passage à 8.2 n’est valide qu’après le gate 8.1.
