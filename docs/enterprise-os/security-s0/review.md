# FIXEO Enterprise OS — Phase 3A-S0

**SECURITY HARDENING PATCH READY FOR REVIEW — NOT APPLIED**

Le patch proposé ferme les accès navigateur aux fonctions dispatch internes exposées et retire 52 privilèges de table excessifs. Il ne transforme pas le modèle métier Enterprise, ne change aucun corps de fonction, aucune policy, aucun trigger et aucune donnée. Ce dossier ne constitue pas une autorisation de Production ni un démarrage B1.

## Baseline vérifiée

| Contrôle | Résultat |
| --- | --- |
| Repo canonique | fixeo-app/Fixeo-clean |
| Main distant | `cb55e54cafb3792ed561b21b0da6bc104599d2e7` |
| Production fixeo.ma | `cb55e54cafb3792ed561b21b0da6bc104599d2e7` |
| Vercel | READY ; dpl_Hm2phKfBxMAjkZN7VVBt6aKNZrh8 |
| Checkout local | HEAD détaché à la même baseline ; aucun fichier suivi modifié |
| Worktree initial | Dossier Blueprint `docs/enterprise-os/` déjà non suivi, conservé sans réécriture |
| P0 | is_admin MD5 `1986929dce09806c133d90b1bf480e1d` ; six policies Admin canoniques ; INSERT users/profiles durcis ; trigger canonique actif ; 16 ACL excessives users/profiles absentes |
| Phase 2A / 2B | Sources présentes à la baseline et empreintes identiques au dossier précédent ; resolver, guard et workspace inchangés |

Preuve du recontrôle final : [baseline-verification.json](baseline-verification.json).

Aucune donnée utilisateur/membership n’a été exportée ni réparée. L’identité Artisan sans profile n’a pas été recomptée : ce mandat porte sur les ACL et le catalogue.

## Artefacts de revue

| Livrable | Fichier |
| --- | --- |
| FUNCTION INVENTORY + EXECUTE effectif + décisions | [function-inventory.md](function-inventory.md) |
| ACL INVENTORY + TABLE ACL FINDINGS + CRUD/colonnes | [table-acl-inventory.md](table-acl-inventory.md) |
| CALL GRAPH + consommateurs et preuve de non-régression | [call-graph.md](call-graph.md) |
| Définitions exactes, grants, triggers, policies, dépendances | [production-readonly.json](production-readonly.json) |
| SQL proposé intégral | [patch-proposed.sql](patch-proposed.sql) |
| Contrôle avant, strictement read-only | [preflight-readonly.sql](../../../tests/enterprise-security-s0/preflight-readonly.sql) |
| Contrôle après, strictement read-only | [postflight-readonly.sql](../../../tests/enterprise-security-s0/postflight-readonly.sql) |
| Rollback intégral, bloqué par défaut | [rollback-reference.sql](rollback-reference.sql) |
| Résultats préflight Production read-only | [preflight-production-results.json](preflight-production-results.json) |
| Résultats des tests locaux, objectifs et limites | [test-results.json](test-results.json), [test-results.tap](test-results.tap) |
| Snapshots de comparaison avant/après attendu | [contract-before.json](contract-before.json), [contract-after-expected.json](contract-after-expected.json), [contract-hashes.json](contract-hashes.json) |

## Risk classification

| Surface | Risque observé | Décision minimale |
| --- | --- | --- |
| backup_20260821 | **Élevé** : SD postgres, EXECUTE anon/authenticated, pas de garde auth/membership, capacité d’insérer une mission sur une demande new | Retirer EXECUTE navigateur, conserver service_role/postgres ; OBSOLETE / REMOVE LATER |
| worker_peek | **Élevé** : EXECUTE PUBLIC/anon/authenticated, retour de contact_phone et identifiants de dispatch sans filtre personnel | SERVICE_ROLE ONLY ; handler API protégé identifié et testé localement |
| Trois fonctions RETURNS trigger | **Défense nécessaire** : EXECUTE ouvert inutile ; deux triggers attachés, un ancien non attaché. Une fonction RETURNS trigger ne s’invoque pas comme une RPC ordinaire ; le risque se combine notamment avec des privilèges TRIGGER excessifs | TRIGGER INTERNAL ; retirer PUBLIC/anon/authenticated sans changer les attachements |
| TRUNCATE sur six tables | **Élevé** au niveau SQL : ne suit pas le filtrage RLS des lignes ; ne pas confondre avec une preuve d’endpoint HTTP exploitable | Retirer aux deux rôles navigateur |
| REFERENCES / TRIGGER / MAINTAIN | **Excessif** pour CRUD/RPC navigateur ; possibilités DDL/maintenance et surface accrue | Retirer seulement les 52 combinaisons constatées, dont TRUNCATE |
| 22 fonctions déjà privilégiées | Données/écritures sensibles mais absence actuelle d’EXECUTE navigateur | Conserver les ACL actuelles, y compris helpers/anciens previews sans consommateur visible |
| Deux RPC Artisan personnelles | Nécessaires au navigateur, auth.uid() et propriétaire artisan dans les corps | Conserver authenticated/service_role/postgres et refus anon |

Aucune exploitation n’a été tentée en Production. « Peut écrire une mission » pour le backup est établi par le corps SQL et par un essai **local synthétique**, jamais contre une demande réelle.

## Proposed revokes

Les cinq seules fonctions concernées :

```sql
REVOKE EXECUTE ON FUNCTION public.dispatch_request_v1_backup_20260821(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_notification_worker_peek_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_dispatch_service_request_v1() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_dispatch_notification_from_mission_v1() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_dispatch_v2_on_service_request() FROM PUBLIC, anon, authenticated;
```

PUBLIC était déjà absent du backup : le REVOKE explicite documente le refus cible et est sans effet supplémentaire. Au total, 14 entrées EXECUTE directes sont retirées sur cinq fonctions. Toutes les fonctions conservent leurs droits service_role/postgres antérieurs.

Tables : 48 combinaisons (quatre privilèges × deux rôles × artisan_profiles/missions/notifications/payments/quotes/service_requests), deux MAINTAIN sur artisans, deux MAINTAIN authenticated sur enterprise_accounts/enterprise_audit_events. Le SQL intégral contient 16 REVOKE de table ciblés, aucun retrait CRUD/colonne.

Le patch est transactionnel : BEGIN, lock_timeout 5s, statement_timeout 30s, préflight catalogue strict, REVOKE, postflight exact, COMMIT. Une dérive ou une erreur annule la transaction ; aucun rollback de restauration n’est déclenché. Les vérifications comparent 11 sections de catalogue (plus une synthèse ALL_CHECKS). Les définitions des 134 fonctions public/fixeo_private, 86 policies, 155 contraintes et 21 triggers restent identiques. Les privilèges effectifs sont contrôlés en plus des ACL directes.

Le fichier est volontairement placé hors `supabase/migrations` : **proposition uniquement**, exclue d’une découverte automatique de migrations. Aucune migration n’a été créée/appliquée.

SHA256 du patch proposé : `39246a11debb90b70970cab29d7ae4573d5b182e0748453c03a9c11684d6e2d6`.

## Functions to keep / to deprecate

- Conserver les 22 fonctions déjà SERVICE_ROLE ONLY, y compris dispatch_request_v1 et dispatch_execute_v1 et tous leurs helpers.
- Conserver get_my_dispatch_offers_v1 et accept_my_dispatch_offer_v1 avec leur accès authenticated actuel.
- Conserver worker_peek, mais uniquement privilégié.
- Conserver les deux fonctions de triggers attachés, avec EXECUTE navigateur retiré.
- Déprécier ultérieurement le backup et examiner la suppression de l’auto-trigger V1 non attaché. **Aucun DROP S0.** Ne pas supprimer les anciens previews/worker_next sur la seule absence d’appelant visible.

## Tests préparés et exécutés

**31/31 scénarios PASS**, soit **32/32 tests Node** avec le conteneur transactionnel. PostgreSQL 17 en mémoire, PGlite 0.3.14. Chaque écriture et chaque essai de rollback reste dans BEGIN/ROLLBACK local ; isolation par SAVEPOINT. Aucune connexion Supabase dans le runner.

Reproduction depuis la racine, avec la dépendance PGlite déjà verrouillée dans `tests/auth-security-p0` :

```bash
node --test --test-reporter=tap tests/enterprise-security-s0/security.test.cjs
```

Les scénarios S01–S31 vérifient : baseline exacte et refus de dérive ; refus de 27 signatures internes pour chacun des deux rôles navigateur ; droits service/postgres ; triggers INSERT réels ; V1 mission/outbox et V2 queue ; idempotence ; backup privilégié ; peek sans mutation ; INSERT/UPDATE mission par colonne ; lecture/acceptation Artisan et refus du second candidat ; P0 ; handler worker exact avec transport local ; 52 ACL excessives ; CRUD/colonnes/token_hash ; membership Enterprise ; notifications ; rollback bloqué puis round-trip **local explicite** ; absence de données persistantes.

Le préflight Production a été exécuté en BEGIN READ ONLY / ROLLBACK : **11/11 sections PASS, ALL_CHECKS PASS**. Le postflight est préparé et passe dans le modèle local après le patch ; il n’a pas été exécuté après une application Production, puisque celle-ci n’a pas eu lieu.

Pas de build ni de recette UI : aucun fichier applicatif modifié. Aucun signup, invitation, envoi WhatsApp, changement de secret ou test write Production.

## Limites et conditions de revue avant B1

La preuve de consommation couvre les fichiers suivis déployés, les 134 corps SQL, les triggers et le catalogue des Edge Functions. Un scheduler ou un client externe inconnu ne peut pas être exclu. La compatibilité des consommateurs privilégiés connus est conservée/testée ; aucune suppression irréversible n’est proposée.

Le modèle local réutilise les corps SQL exacts et leurs chaînes dispatch, mais ne reproduit pas PostgREST/JWT réel, un pool multi-connexion, ni les fournisseurs externes. La table Auth est un support local de clés étrangères, pas un service Auth ; le type de retour Diagnostic non exercé est un substitut. Les branches métier des offres tarifées ne sont pas exécutées. Les ACL de helpers hors dispatch ne sont pas toutes modélisées. Les empreintes garantissent que le patch ne change aucun de leurs corps.

**Risques résiduels explicites** : default ACL public permissives ; INSERT notifications authenticated WITH CHECK true ; INSERT service_requests anon WITH CHECK true déclenchant le dispatch ; anciennes policies de transition/identité téléphone ; grants CRUD dormants ; périmètres d’UPDATE Artisan. S0 conserve ces comportements faute d’autorisation et de preuve suffisante pour les retirer. B1 ne devra pas supposer qu’un guard frontend constitue une autorité DB ni que cette réduction d’ACL établit déjà son futur modèle d’approbation/dispatch.

Les droits CRUD demandent donc une revue métier séparée avant d’être réduits. Aucune implémentation workforce, dossier, approval, hybrid dispatch, Command Center ou nouvelle table Enterprise OS n’est incluse.

## Rollback de référence

`rollback-reference.sql` est **bloqué par défaut**. Il restaure exactement les grants retirés, y compris PUBLIC seulement là où il existait. Il **rouvrirait l’exposition du worker et la capacité navigateur d’appeler le backup**, ainsi que les privilèges excessifs des tables. Aucun rollback automatique ; nouvelle autorisation explicite indispensable. Il a uniquement été validé dans un SAVEPOINT local puis annulé. Jamais exécuté en Production.

Le rollback ne recrée aucune fonction, ne touche pas aux policies et ne restaure aucune donnée. Le SHA Git baseline demeure `cb55e54cafb3792ed561b21b0da6bc104599d2e7` ; un retour Git seul ne modifierait pas les ACL DB après une éventuelle future application.

## Références techniques primaires

- [PostgreSQL 17 — CREATE TRIGGER](https://www.postgresql.org/docs/17/sql-createtrigger.html) : TRIGGER sur table et EXECUTE sur fonction pour créer le trigger. L’exécution des attachements existants après REVOKE est vérifiée ici par S09/S10/S15, pas supposée à partir du seul texte.
- [PostgreSQL 17 — Privileges](https://www.postgresql.org/docs/17/ddl-priv.html) : privilèges de table, colonne et fonction.
- [PostgreSQL 17 — Row Security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) : TRUNCATE et REFERENCES hors filtrage RLS.
- [Supabase — Database functions](https://supabase.com/docs/guides/database/functions) : restriction EXECUTE et SECURITY DEFINER.

NO PRODUCTION WRITE — NO DATA CHANGE — NO APPLY — NO COMMIT — NO PUSH — NO DEPLOY — NO B1 IMPLEMENTATION.
