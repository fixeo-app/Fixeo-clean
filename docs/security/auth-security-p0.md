**FIXEO AUTH SECURITY P0 — proposition préparée, NON APPLIQUÉE**

Le correctif ferme l'autorité Admin secondaire de `profiles.role`. `public.users.role` reste l'unique autorité globale ; Enterprise conserve ses memberships indépendants. Aucune mutation, tentative d'exploitation, création de compte, modification de mot de passe ou invitation n'a été effectuée en Production. Aucun commit, push ou déploiement n'a été effectué.

**BASELINE**

| Élément | Preuve |
|---|---|
| Dépôt canonique | `fixeo-app/Fixeo-clean` |
| MAIN SHA distant | `bc927b9c24d709ab76e55cd2c82210194da30026` |
| PRODUCTION SHA, `fixeo.ma` et `www.fixeo.ma` | `bc927b9c24d709ab76e55cd2c82210194da30026` |
| Vercel | `dpl_DowSGanvWC9rGYeuaL9qgNjT1RrF`, `READY`, cible `production`, source `main` |
| Worktree de revue | `/workspace/scratch/d8dc2a419925/fixeo-auth-security-p0`, HEAD détachée sur le SHA canonique, propre avant proposition |
| Worktree précédent | `/workspace/scratch/73d1cdffe666/fixeo-final`, fichiers suivis propres, HEAD `0ef1b02f5ea3fb5e74fad83d7d6533eb950449d2`, arbre identique à Production ; fichiers non suivis préexistants conservés |
| Branche locale `main` préexistante | `9a41ec249da469c70a38c6f058ad378d035722ce`, ancienne ; elle n'a pas servi de base et n'a pas été déplacée |
| Base Supabase | `fixeo-mvp`, projet `ztwtbgoqanqzvwiibtuh`, PostgreSQL 17.6 |

Les preuves GitHub/Vercel et le contrôle final d'absence d'application sont conservés dans `tests/auth-security-p0/baseline.json` et `not-applied.json`.

**AUDIT FINAL — PREFLIGHT READ-ONLY**

Le catalogue Production complet comprend **104 policies**. L'examen des expressions, des dépendances `pg_depend` vers la colonne `profiles.role`, des helpers appelés par les policies et des fonctions applicatives a identifié **six policies** qui reconnaissent un Admin via `profiles`. Les dix dépendances de catalogue correspondent aux clauses USING/WITH CHECK de ces six policies, pas à dix policies distinctes. Les autres autorités Admin observées reposent déjà sur `users` ou un helper canonique. Les rôles `owner`/`admin` des memberships Enterprise restent des rôles locaux d'organisation.

Les définitions exactes des 104 policies, ACL de table et de colonne, contraintes, triggers, fonctions et usages des helpers sont dans `tests/auth-security-p0/production-preflight.json`. Les SELECT reproductibles sont dans `preflight-readonly.sql`. Aucun identifiant individuel ni contenu métier n'a été exporté.

| Identités / intégrité | Nombre exact observé |
|---|---:|
| `auth.users` | 47 |
| `public.users` | 47 |
| `public.profiles` | 46 |
| Auth sans `users` | 0 |
| `users` sans `profiles` | 1, rôle canonique `artisan` |
| `profiles` sans `users` | 0 |
| Rôles discordants entre lignes existantes | 0 |

Les deux tables appartiennent à `postgres`, avec RLS activée et FORCE RLS désactivée. Chaque `id` est une clé primaire et une FK vers `auth.users(id)` avec suppression en cascade. Les rôles sont NOT NULL ; `users.role` a le défaut `client`, `profiles.role` n'a pas de défaut.

**POLICIES BEFORE / POLICIES AFTER**

Toutes les policies ci-dessous restent PERMISSIVE, destinées à `authenticated`, avec la même commande SQL. Les expressions exactes BEFORE sont conservées dans le snapshot et le rollback ; ce tableau en donne la portée.

| Table / policy | Commande | BEFORE | AFTER proposé |
|---|---|---|---|
| `users.users_insert_own` | INSERT | `auth.uid() = id` | Même propriétaire ET `role = 'client'` |
| `profiles.profiles_insert_own` | INSERT | `auth.uid() = id` | Même propriétaire ET rôle égal au `users.role` canonique de l'appelant |
| `service_requests.admin_all_service_requests` | ALL | Admin via `users` OU `profiles` | `public.is_admin()` dans USING et WITH CHECK |
| `missions.admin_all_missions` | ALL | Admin via `users` OU `profiles` | Idem |
| `notifications.admin_all_notifications` | ALL | Admin via `profiles` | Idem |
| `enterprise_leads.enterprise_leads_admin_select` | SELECT | Admin via `profiles` | `public.is_admin()` dans USING |
| `enterprise_leads.enterprise_leads_admin_update` | UPDATE | Admin via `profiles` | `public.is_admin()` dans USING et WITH CHECK |
| `estimator_context_redemptions.ecr_admin_select` | SELECT | Admin via `profiles` | `public.is_admin()` dans USING |

Les six autres policies des tables d'identité restent inchangées : `users_admin_all`/`profiles_admin_all` utilisent déjà `is_admin()` dans USING et WITH CHECK ; `users_select_own`/`profiles_select_own` utilisent `auth.uid() = id` dans USING ; `users_update_own`/`profiles_update_own` utilisent cette même égalité dans USING et WITH CHECK. Il n'existe pas de policy de suppression autonome de son identité.

`enterprise_request_context.erc_fixeo_admin_all` utilise déjà `fixeo_private._fixeo_is_admin()` : aucun changement. Les permissions Client, Artisan, membership, site et lecture Enterprise restent identiques. Au total : **8 policies modifiées sur 104**, aucune policy ajoutée ou supprimée.

**ACL BEFORE / ACL AFTER EXPECTED**

| Tables | Rôles SQL | BEFORE | AFTER attendu |
|---|---|---|---|
| `users`, `profiles` | `anon`, `authenticated` | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN | SELECT, INSERT, UPDATE, DELETE |
| `users`, `profiles` | `service_role`, `postgres` | Les huit privilèges | Inchangé |

Cela retire exactement **16 grants** : quatre privilèges × deux tables × deux rôles. Aucun grant de table PUBLIC, ACL de colonne ou héritage de rôle client n'a été observé. `anon` et `authenticated` ne peuvent créer d'objet dans `public` ou `fixeo_private`. Les grants CRUD sont des plafonds SQL ; les policies RLS continuent à restreindre les lignes accessibles.

Le frontend utilise les opérations de lignes PostgREST et n'a pas besoin de TRUNCATE, REFERENCES, TRIGGER ou MAINTAIN. Les ACL des autres tables et les droits `service_role` ne changent pas. En particulier, `authenticated` dispose actuellement de SELECT sans INSERT/UPDATE/DELETE sur `missions` ; T04 conserve cette restriction existante.

**SQL PROPOSED**

Fichier exécutable proposé : `supabase/migrations/20260923202411_auth_security_p0_canonical_role_authority.sql`.

La migration est atomique, avec BEGIN/COMMIT, délai de verrou de 5 secondes et délai de commande de 30 secondes. Elle verrouille les sept tables concernées pendant la modification du catalogue. Son préflight refuse une dérive des policies ciblées, de l'ensemble des policies d'identité, des contraintes de rôle, des triggers, des trois fonctions canoniques protégées, des ACL ou de l'intégrité actuelle des profils. Un échec annule la transaction.

La fonction neuve `fixeo_private.enforce_profile_canonical_role_p0()` est un trigger SECURITY DEFINER appartenant à `postgres`, avec `search_path = ''` et références qualifiées. EXECUTE est révoqué à PUBLIC, anon, authenticated et service_role ; elle n'expose pas de RPC. Le trigger BEFORE INSERT OR UPDATE OF id, role impose `NEW.role := public.users.role` pour `NEW.id`, ou lève `23514` si l'identité canonique manque ou est invalide. Il fonctionne aussi lors du signup de confiance sans JWT utilisateur.

Une tentative `INSERT profiles(role='admin')` par un Client ou Artisan est donc **normalisée vers son rôle canonique** ; elle ne crée pas de profil Admin. Ce choix conserve les appels existants et les anciens scripts en cache. La policy d'insertion ajoute une vérification de cohérence indépendante.

Une identité Auth sans ligne `users` peut uniquement insérer sa propre identité Client ; elle ne peut pas s'attribuer Artisan ou Admin. Le signup de confiance existant peut toujours créer un Client ou Artisan : `handle_new_user()` autorise déjà uniquement ces deux rôles et convertit toute autre valeur de métadonnées, dont Admin, en Client. Cette fonction reste inchangée.

`public.is_admin()` reste inchangée : SECURITY DEFINER, propriétaire postgres, `search_path = public`, requête qualifiée sur `public.users` et `auth.uid()`. Le schéma public n'est pas modifiable par les rôles clients. Son ACL EXECUTE actuelle reste inchangée. `prevent_non_admin_role_change()` et les deux triggers BEFORE UPDATE OF role restent actifs.

La migration ne contient aucun INSERT, UPDATE ou DELETE de données existantes. Elle ne synchronise pas rétroactivement les profils et ne crée aucun rôle Enterprise.

**FILES PROPOSED — FRONTEND**

| Fichier | Changement |
|---|---|
| `js/fixeo-profile-provision.js` | Suppression de la dérivation du rôle depuis `user_metadata`. SELECT du rôle canonique dans `users` avant INSERT. Absence, valeur invalide ou erreur de lecture : aucune écriture. Un profil déjà existant reste inchangé. |
| `auth.html` | Une seule URL de script : version `v1` remplacée par `auth-p0-20260923`. |
| `artisan-profile.html` | La même version d'URL, une seule ligne. |

Le script n'a que ces deux inclusions actives dans le dépôt. Le versionnement est nécessaire car Vercel sert les JS avec `max-age=31536000, immutable`. Les deux HTML ont été comparés octet par octet à leur baseline après la seule substitution attendue. Aucun formulaire, style, redirect ou parcours Auth n'est modifié. Les métadonnées restent utilisables pour un nom d'affichage, jamais pour un rôle.

L'autre INSERT de profil observé dans `js/fixeo-mvp-supabase.js` reste protégé par le nouveau trigger SQL ; aucune refonte de ce module n'est proposée. Aucun INSERT autonome frontend vers `users` n'a été trouvé dans l'audit du dépôt.

**FILES PROPOSED — AUDIT ET TESTS**

Outre les quatre fichiers applicatifs/migration ci-dessus et ce rapport :

- `tests/auth-security-p0/baseline.json` : preuves SHA et absence de commit/déploiement.
- `tests/auth-security-p0/production-preflight.json` : catalogue exact et comptages agrégés.
- `tests/auth-security-p0/preflight-readonly.sql` : requêtes d'audit reproductibles.
- `tests/auth-security-p0/not-applied.json` : contrôle final READ-ONLY ; six dépendances vulnérables et seize grants encore présents, nouvelle fonction absente.
- `tests/auth-security-p0/fixture.cjs` : modèle PostgreSQL local reconstruit depuis le catalogue.
- `tests/auth-security-p0/authority.test.cjs` : tests DB T01–T10 et vérifications complémentaires.
- `tests/auth-security-p0/provision.test.cjs` : tests de sécurité du JavaScript réel dans une VM.
- `tests/auth-security-p0/postapply-readonly.sql` : recette catalogue prévue après autorisation.
- `tests/auth-security-p0/rollback-emergency.sql` : restauration de référence, bloquée par défaut.
- `tests/auth-security-p0/package.json`, `package-lock.json`, `.gitignore` : dépendance de test PGlite 0.3.14 verrouillée, dépendances installées exclues du diff.

**TEST PLAN ET RÉSULTATS**

Commande reproductible depuis la racine du worktree :

```sh
npm ci --prefix tests/auth-security-p0 --ignore-scripts
npm test --prefix tests/auth-security-p0
node --check js/fixeo-profile-provision.js
git diff --check
```

**22 tests Node passent, zéro échec.** Tous les objets, fixtures et écritures DB de test sont créés dans une instance PostgreSQL 17 PGlite en mémoire, dans BEGIN suivi de ROLLBACK. Chaque cas dispose aussi d'un SAVEPOINT annulé. L'enveloppe BEGIN/COMMIT de la migration est retirée uniquement par le runner pour exécuter ses instructions exactes à l'intérieur de cette transaction annulée. Le runner vérifie finalement la disparition des fixtures. Aucune connexion Production, clé, URL réseau ou compte Supabase Auth n'est utilisé/créé.

| Test | Démonstration locale | Résultat |
|---|---|---|
| T01 | Client demandant un profil Admin : rôle réellement stocké Client | PASS |
| T02 | Artisan sans profil demandant Admin : rôle réellement stocké Artisan | PASS |
| T03 | Identité canonique manquante : users Admin/Artisan refusés ; profil refusé tant que users manque | PASS |
| T04 | Vrai Admin, même sans profil : lecture des six ressources concernées et mutations autorisées par les grants existants | PASS |
| T05 | Client : identité, requêtes, missions et notifications propres accessibles, autres données protégées | PASS |
| T06 | Artisan : missions et requêtes liées conservées ; RPC `register_new_artisan` conservé pour une identité canonique Artisan | PASS |
| T07 | Membership Enterprise admin/owner actif : accès à son organisation, aucun Admin global | PASS |
| T08 | Six anciennes policies désormais canoniques ; autres policies locales identiques | PASS |
| T09 | Métadonnées role=admin : aucun accès Admin ; profil et JS suivent users | PASS |
| T10 | Non-Admin : changement de rôle users refusé ; modification normale de son nom conservée | PASS |

Les tests complémentaires couvrent les seize révocations, l'intégrité CRUD/service_role, l'absence de mutation de données par la migration, les helpers et memberships inchangés, l'absence d'accès RPC au trigger, les requêtes READ-ONLY de recette, les erreurs de provisioning, l'idempotence et le rollback exact avec son verrou de sécurité.

Limites : le modèle reproduit les colonnes nécessaires de quatorze tables, leurs policies et grants capturés, les contraintes d'identité pertinentes et les helpers RLS. Il ne reproduit pas toutes les FK, tous les triggers métier, PostgREST ni le service Auth Supabase. Les connexions réelles Admin/Client/Artisan n'ont pas été exercées. Aucun test d'exploitation Production n'est prévu, même transactionnel. Après autorisation, la recette Production proposée reste READ-ONLY.

**NON-RÉGRESSION**

| Contrôle demandé | Conclusion et portée |
|---|---|
| ADMIN AUTH INTACT | Autorité et accès RLS canoniques validés localement ; design et redirects intacts ; login réel non exercé |
| CLIENT AUTH INTACT | Accès propres et provisioning validés localement ; login réel non exercé |
| ARTISAN AUTH INTACT | Accès propres et provisioning validés localement ; login réel non exercé |
| ARTISAN ONBOARDING INTACT | RPC inchangée, cas Artisan canonique validé localement |
| ENTERPRISE TABLES INTACT | Structure et données intactes ; seules deux policies Admin de leads sont corrigées |
| ENTERPRISE MEMBERSHIPS INTACT | Aucune mutation ; accès et indépendance du rôle global validés localement |
| ENTERPRISE RPC INTACT | Aucune modification ; 27 empreintes Enterprise/onboarding conservées dans le préflight |
| HOMEPAGE INTACT / SERVICES INTACT / FOOTER GLOBAL INTACT | Aucun diff de ces fichiers et composants |
| PRICING INTACT / DISPATCH INTACT / PAYMENT INTACT | Aucun changement de code, de RPC ou de données de ces domaines |

**IMPACTS / RISK ANALYSIS**

1. Les comptes légitimes avec rôle canonique conservent leurs droits. Un profil prétendant Admin sans autorité dans users perdrait ses privilèges : c'est le comportement de sécurité attendu. Aucune discordance de rôle n'a été observée actuellement.
2. L'insertion directe de son `users.role='artisan'` sera refusée si la ligne manque ; le signup de confiance Artisan reste disponible. Aucun parcours frontend reposant sur cette insertion directe n'a été trouvé.
3. Un profil sans identité canonique ne sera plus créé. Le provisioning échoue silencieusement, sans modifier l'UX ; une identité réellement cassée exige une réparation distincte.
4. Les verrous de catalogue peuvent attendre des transactions actives. Le délai court provoque un abandon atomique plutôt qu'une attente prolongée. Toute dérive détectée impose un nouvel audit ciblé avant reprise.
5. Les profils existants ne sont pas resynchronisés automatiquement lors d'une future modification administrative de users.role. Ils ne constituent plus une autorité Admin RLS ; une éventuelle remise en cohérence de données reste un chantier contrôlé distinct.
6. Ordre de diffusion proposé après autorisation : migration SQL atomique, contrôle READ-ONLY, puis publication des trois fichiers frontend avec les nouvelles versions d'URL. La protection SQL reste efficace avec les anciens JS en cache.
7. La faille reste présente en Production jusqu'à une application explicitement autorisée. Le contrôle final confirme six policies dépendantes de profiles.role, seize grants excessifs et l'absence de la nouvelle fonction.

**PROFIL ARTISAN MANQUANT — PROPOSITION DISTINCTE**

Aucune réparation incluse ou exécutée. Après fermeture de la faille, identifier de nouveau l'unique ligne manquante sous accès autorisé, vérifier `auth.users` et `users.role='artisan'`, faire valider l'identité et les champs à recopier, puis préparer une insertion contrôlée uniquement si le profil est encore absent. Ne pas remplacer un profil existant et ne pas dériver le rôle des métadonnées. Le provisioning déjà existant pourra aussi créer ce miroir canonique lors d'une visite authentifiée après diffusion ; il ne s'agit pas d'une réparation de données effectuée par cette migration.

**ROLLBACK PLAN**

- Avant COMMIT : une erreur de préflight, verrou, commande ou postcondition annule l'ensemble de la transaction, sans changement partiel.
- Après COMMIT, problème frontend : conserver les protections SQL et revenir aux versions précédentes du script et de ses URL. Le trigger SQL neutralise les rôles des anciens clients.
- Restauration SQL complète : `rollback-emergency.sql` restitue les huit policies et seize grants exacts et retire la fonction/trigger ajoutés. Le test local vérifie la restitution des policies, ACL, fonctions et données. Ce rollback **rouvre la faille** : il est bloqué par défaut, nécessite un choix séparé explicitement autorisé, un nouveau contrôle de dérive et l'opt-in documenté dans sa transaction. Il ne doit pas être utilisé automatiquement pour un simple problème de JS.
- Le SHA de référence frontend est `bc927b9c24d709ab76e55cd2c82210194da30026`. Un rollback Vercel ne constitue pas un rollback SQL.

La proposition reste locale, non commitée et non appliquée. Message de commit futur suggéré : `fix(auth): enforce canonical role authority and harden identity RLS`.

FIXEO AUTH SECURITY P0 — READY FOR EXPLICIT PRODUCTION AUTHORIZATION — NOT APPLIED
