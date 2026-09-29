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


## 8.2 — Sécurité / observabilité

Gate exécuté après 8.1.

- L'enveloppe API Control conserve `POST only`, JWT obligatoire, origin allowlist, refus `Sec-Fetch-Site: cross-site`, payload <= 8 KiB, route allowlist, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` et un `X-Correlation-ID` par requête.
- Le client Control conserve au maximum 50 traces locales minimisées : opération allowlistée, succès/erreur, statut HTTP, latence, code d'erreur borné et correlation ID.
- Aucun payload, token, téléphone, nom, note, description métier, résultat RPC ou texte libre n'est stocké dans ces traces.
- La vue Gouvernance affiche ces traces locales uniquement pour diagnostic opérateur ; elle ne crée aucune nouvelle vérité métier ni nouvelle table.
- Tests dédiés : `bloc8-security.test.cjs`, `bloc8-observability.test.cjs` et régressions Control complètes.

Gate 8.2 : PASS sur CI dédiée avant gel du candidat.

## 8.3 — Certification / cutover / rollback

Le Bloc 8 est applicatif uniquement : aucune migration Supabase et aucune nouvelle autorité métier.

Préflight obligatoire :
1. MAIN reste exactement sur la baseline Bloc 7 jusqu'au merge.
2. PR Bloc 8 sans dérive concurrente.
3. CI complète verte, y compris navigateurs B34/B5/B6/B7/B8.
4. Preview Vercel READY sur le SHA candidat.
5. Diff limité au shell/UX/observabilité/tests/docs/workflow ; aucun secret.
6. Rollback = retour applicatif au commit Production Bloc 7 `3bda113c3ba74351f9fb9da4df85164e92165b81`. Aucune rollback DB requise car B8 n'ajoute aucune migration.

Cutover autorisé : merge exact du candidat certifié, attendre Vercel Production READY, vérifier MAIN=Production, puis postflight HTTP/assets/API non destructif.

## 8.4 — Documentation opérateur

Le guide `OPERATOR_GUIDE.md` constitue le runbook de référence : raccourcis, états, erreurs, corrélation, actions gouvernées, dégradation, escalade et rollback.

La certification globale doit conserver les limites réelles : une preuve absente reste inconnue, une source indisponible ne devient pas zéro, une action n'est jamais réputée exécutée sans résultat canonique, et un canal externe non vérifié n'est jamais déclaré livré.
