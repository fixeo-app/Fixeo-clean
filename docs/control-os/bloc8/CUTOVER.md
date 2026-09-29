# Bloc 8 — Cutover / Rollback

Baseline Production avant B8 : `3bda113c3ba74351f9fb9da4df85164e92165b81`.

## Candidat

Le candidat est le HEAD exact de la PR #58 après le dernier commit de documentation. Il ne doit plus changer après certification CI + Preview READY.

## Préflight

- MAIN == baseline B7.
- PR #58 seule propriétaire du chantier B8.
- CI Control complète : PASS.
- Preview Vercel : READY.
- Aucun fichier Supabase migration ajouté/modifié.
- Aucun secret/.env/token réel dans le diff.
- Aucun changement d'autorité métier ou de table.
- Responsive 1440/1280/1024/768/390, clavier et reduced-motion : PASS.

## Cutover

1. Marquer la PR prête seulement après tous les gates.
2. Merge avec `expected_head_sha` exact.
3. Attendre le déploiement Vercel Production du merge.
4. Vérifier MAIN = SHA Production.
5. Vérifier `www.fixeo.ma/admin.html` et les nouveaux assets B8 servis.
6. Vérifier routes Control en lecture/non destructive et journaux runtime.
7. Vérifier absence de nouveaux 5xx Control sur la fenêtre postflight.

## Rollback

B8 est sans migration DB. En cas de régression B8, restaurer l'application au commit B7 `3bda113c3ba74351f9fb9da4df85164e92165b81`.

Le rollback ne supprime aucune donnée, aucun audit, aucune proposition RAFI et aucun suivi. Il ne modifie pas Supabase.

## STOP immédiat

STOP avant merge ou cutover si MAIN dérive, CI échoue, Preview n'est pas READY, un secret apparaît, une migration inattendue apparaît, ou le SHA déployé diffère du candidat certifié.
