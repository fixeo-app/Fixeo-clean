# FIXEO Auth — Phase 2B — dossier de revue locale

Statut : code et tests prêts pour revue. **Recette visuelle bloquée par l’environnement, non validée.**
Aucun commit, push, déploiement, changement de configuration ou écriture DB Production.
La Phase 2C n’est pas commencée.

## Baseline et périmètre

| Élément | Preuve |
| --- | --- |
| Repo | `fixeo-app/Fixeo-clean` |
| Main avant / dernière vérification | `2f735bc3af8d844233d3bde611a3907df8c515cf` |
| Production avant / dernière vérification | `2f735bc3af8d844233d3bde611a3907df8c515cf` |
| Vercel Production | `dpl_M3PB8sRh7cQuDrnCvK132Npxrrzy`, READY, alias `fixeo.ma` et `www.fixeo.ma` |
| Phase 2A publiée | `feat(auth): add canonical multi-space resolver` |
| Checkout local | HEAD détaché sur ce même SHA ; worktree initial propre |
| Fichiers existants modifiés | **0** ; index Git inchangé |
| Pages HTML existantes inchangées | **684** |
| Resolver Phase 2A inchangé, SHA256 | `1e515a1682011f827af39f3e9540a76009eeed68b63da6ee1f1b48866e635899` |

Inspection des noms de fichiers, routes Vercel, références Enterprise et modules Auth : aucune destination Enterprise authentifiée existante. `entreprises.html` est une page publique ; `/api/enterprise-contact` ne constitue pas un workspace.

Route retenue : **`dashboard-enterprise.html?enterprise_id=<uuid>`**.
Les règles statiques Vercel existantes couvrent déjà le nouveau HTML, ses JS et son CSS : aucune modification de routage requise.

## Fichiers créés — liste exhaustive (12)

1. `dashboard-enterprise.html`
2. `js/fixeo-enterprise-guard.js`
3. `js/fixeo-enterprise-workspace.js`
4. `css/fixeo-enterprise-workspace.css`
5. `tests/enterprise-workspace/guard.test.cjs`
6. `tests/enterprise-workspace/workspace.test.cjs`
7. `tests/enterprise-workspace/rls-read.test.cjs`
8. `tests/enterprise-workspace/preview-server.cjs`
9. `tests/enterprise-workspace/preflight-readonly.sql`
10. `docs/auth/phase-2b-production-readonly.json`
11. `docs/auth/phase-2b-test-results.json`
12. `docs/auth/phase-2b-workspace-review.md`

**FILES MODIFIED : aucun fichier préexistant.** Auth, redirects, header/footer globaux, guards existants, dashboards Client/Artisan/Admin, onboarding, pricing, dispatch, paiement, RPC, migrations, secrets et env restent inchangés.

## Autorité et logique du guard

Le paramètre demandé doit être un UUID unique. Paramètre absent, malformé ou répété : `INVALID_ENTERPRISE_ID`. Aucun premier membership choisi implicitement ; aucune URL de retour issue de la requête n’est consommée.

Le guard appelle le resolver Phase 2A existant. Celui-ci :

1. Lit la session SDK puis valide son token par `getUser(token)` ; les UUID des deux identités doivent correspondre.
2. Lit uniquement le rôle canonique `public.users.role`, pour cet UUID. Valeurs globales : `admin`, `artisan`, `client`.
3. Lit les memberships avec les filtres explicites `user_id = utilisateur validé` et `status = active`, avec pagination complète.
4. Lit les comptes correspondant à ces memberships et conserve seulement les comptes `status = active` ; les six rôles Enterprise sont strictement reconnus.
5. Relit la session avant de retourner le résultat et rejette tout changement d’UUID ou de token pendant les lectures.

Le nouveau guard exige `ok === true`, `status === OK`, une identité canonique valide et exactement un espace actif correspondant à l’UUID demandé. Il retourne uniquement `{id, name, role}` pour cette entreprise. Une erreur Enterprise ne peut pas être masquée par le global_space que le resolver peut conserver dans un résultat partiel.

**GLOBAL ADMIN BYPASS = NO.** Même un Admin global doit posséder son propre membership actif. Le filtre `user_id` reste indispensable car les RLS Admin permettent déjà des lectures larges.

**Multi-enterprise :** A demandé donne A uniquement ; B demandé donne B uniquement. Les noms et rôles des autres espaces ne sont pas rendus. Le resolver lit sa liste complète comme prévu en Phase 2A ; cette liste n’est pas transformée en sélecteur UI.

**Lectures :** `users` (resolver), `enterprise_members`, `enterprise_accounts`. Aucun chargement de sites, missions, service_requests, SLA, reporting ou paiements. Aucun INSERT/UPDATE/DELETE/upsert/RPC, aucune réparation de profil.

**Autorités exclues :** profils, metadata, stockage local/session, DOM, cache UI, query param seul. Le rôle global n’est jamais modifié et aucun rôle global `enterprise` n’est créé.

## P0 toujours actif — preuves catalogue

Snapshot intégral : `phase-2b-production-readonly.json`. SQL exécuté : `tests/enterprise-workspace/preflight-readonly.sql`, uniquement `BEGIN READ ONLY` / SELECT catalogue / `ROLLBACK`.

- MD5 `public.is_admin()` : `1986929dce09806c133d90b1bf480e1d`.
- Les six policies P0 ciblées utilisent `is_admin()` ; aucune ne consulte `profiles.role`.
- `users_insert_own` impose `auth.uid() = id` et `role = 'client'`.
- `profiles_insert_own` impose `auth.uid() = id` et égalité avec le rôle de la ligne canonique users.
- Trigger `enforce_profiles_canonical_role_p0` actif sur INSERT / UPDATE de id, role ; fonction SECURITY DEFINER à search_path vide présente.
- `protect_users_role` et `protect_profiles_role` actifs ; leur fonction refuse le changement de rôle par un non-Admin identifié.
- Contraintes users/profiles : client, artisan, admin uniquement ; RLS activée sur les deux tables.
- Les 16 privilèges excessifs P0 restent retirés : TRUNCATE/REFERENCES/TRIGGER/MAINTAIN × users/profiles × anon/authenticated. CRUD conservés ; service_role conservé.
- Aucune lecture de lignes personnelles ou métier ni réparation de l’Artisan sans profile pendant ce chantier.

## RLS nécessaires et portée existante

Les quatre tables Enterprise existent et ont RLS activée. `authenticated` dispose déjà de SELECT sur les quatre tables, users et profiles, de l’USAGE des schémas requis et d’EXECUTE sur les helpers de lecture. Aucun nouveau grant n’est nécessaire.

| Table | Policies de lecture pertinentes | Conséquence |
| --- | --- | --- |
| enterprise_members | `em_self_select`, `em_members_select`, `em_fixeo_admin_all` | Lecture de ses memberships possible ; un membre actif peut aussi voir les membres de son entreprise. Le resolver filtre toujours user_id. |
| enterprise_accounts | `ea_members_select`, `ea_fixeo_admin_all` | Compte lisible avec membership actif ; statut actif du compte vérifié séparément par le resolver. |
| enterprise_sites | `es_members_select`, `es_fixeo_admin_all` | `_fixeo_can_access_enterprise_site(enterprise_id,id)` détermine les sites lisibles. Non chargés dans le shell. |
| enterprise_member_sites | `enterprise_member_sites_members_select`, `enterprise_member_sites_fixeo_admin_select` | owner/admin Enterprise voient les affectations de leur entreprise ; les autres membres actifs voient leurs propres affectations. Non chargé dans le shell. |

Les clauses SQL et définitions complètes, propriétaires, ACL des helpers, contraintes, statuts et colonnes sont conservés dans le snapshot.

Comportement actuel de `_fixeo_can_access_enterprise_site` :

- ID d’utilisateur/entreprise/site nul : false.
- Admin canonique FIXEO : site existant dans l’entreprise demandée (exception SQL existante, non utilisée pour autoriser l’entrée dans ce workspace).
- Autre utilisateur : membership personnel actif et site de la même entreprise.
- owner/admin/operations_manager/reporter/viewer : accès aux sites de cette entreprise.
- site_manager : affectation correspondante dans `enterprise_member_sites` obligatoire.
- Le helper ne filtre pas le statut du compte ni celui du site. La Phase 2B ne le remplace pas et ne reconstruit aucun scope opérationnel.

Les RLS actuelles laissent un compte suspended/closed lisible pour un membre actif. Le refus du shell pour ces statuts est volontaire et testé. Ce guard frontend ne révoque pas les permissions DB existantes ; les futures opérations devront faire respecter leurs permissions côté DB/RPC.

Observation hors périmètre conservée telle quelle : `authenticated` dispose actuellement de MAINTAIN sur `enterprise_accounts` (mais pas sur users/profiles). Aucun changement ACL Enterprise n’a été effectué dans cette phase.

## Page, sessions et déconnexion

La nouvelle page seule charge le resolver. Les 684 pages HTML préexistantes ne le chargent toujours pas. Elle ne charge ni le guard global, ni le bridge de session, ni les scripts de provisioning, ni les modules Auth susceptibles de synchroniser des profils.

Le shell affiche la marque FIXEO, le contexte Enterprise, le nom réel du compte, le rôle traduit, l’état actif et une indication neutre sur les outils à venir. Aucun compteur, dataset ou module opérationnel fictif. Nom de société inséré exclusivement avec `textContent`.

Au chargement, en erreur, après invalidation de session et pendant la déconnexion, les données Enterprise sont masquées et effacées du DOM. Une génération de requête empêche une réponse tardive de réafficher un ancien contexte. La sortie de page/masquage de l’onglet efface les données ; le retour revalide. Les changements Auth déclenchent une nouvelle validation hors du callback SDK. Timeout de lecture : 15 secondes, puis erreur contrôlée.

Sans session, redirection fixe `auth.html`. L’Auth existante ne gère pas d’intention Enterprise de retour : aucune intégration ou nouveau paramètre de retour n’a été ajouté. Le futur branchement reste Phase 2C.

Déconnexion : appel unique du mécanisme existant `fixeoGlobalLogout({skipRedirect:true})`, donc nettoyage canonique des clés sensibles et conservation de ses conventions. Ce module est fire-and-forget et masque les erreurs SDK ; la nouvelle page vérifie donc **les trois conditions** avant redirection fixe vers `index.html` :

1. événement `SIGNED_OUT` du vrai SDK ;
2. événement canonique de fin de nettoyage `fixeo:user:logout` ;
3. `getSession()` sans erreur retournant une session nulle.

Si l’une manque, l’espace reste effacé, la déconnexion est signalée comme non confirmée et peut être retentée. Aucun signOut concurrent, nettoyage parallèle ou troisième implémentation de logout n’a été créé.

Référence SDK consultée : https://supabase.com/docs/reference/javascript/auth-signout. La convention de scope du logout existant est conservée. Un access token JWT déjà émis expire selon la configuration Supabase ; cette phase ne change pas cette propriété.

## Matrice obligatoire — tests du vrai resolver et du nouveau guard

| Test | Objectif / résultat attendu | Résultat |
| --- | --- | --- |
| E01 | Sans session → Auth, aucun accès | PASS |
| E02 | Client sans membership → refus | PASS |
| E03 | Artisan sans membership → refus | PASS |
| E04 | Admin sans membership → refus | PASS |
| E05 | Client + owner actif → accès | PASS |
| E06 | Artisan + operations_manager actif → accès | PASS |
| E07 | Admin + owner personnel actif → accès | PASS |
| E08 | viewer actif → shell accessible | PASS |
| E09 | site_manager actif → shell accessible | PASS |
| E10 | invited → refus | PASS |
| E11 | membership suspended → refus | PASS |
| E12 | membership removed → refus | PASS |
| E13 | compte suspended → refus | PASS |
| E14 | compte closed → refus | PASS |
| E15 | rôle Enterprise inconnu → refus | PASS |
| E16 | enterprise_id falsifié/malformé → refus | PASS |
| E17 | autre entreprise → refus | PASS |
| E18 | deux memberships, cible A → A uniquement | PASS |
| E19 | deux memberships, cible B → B uniquement | PASS |
| E20 | erreur lecture membership → fermé | PASS |
| E21 | erreur lecture compte → fermé | PASS |
| E22 | metadata user/app falsifiées → aucune autorité | PASS |
| E23 | profiles.role falsifié → aucune autorité | PASS |
| E24 | Admin + membership d’un autre utilisateur → refus | PASS |
| E25 | Client + owner → accès sans mutation du rôle global | PASS |

Compléments E26–E29 : ID absent/dupliqué, validation serveur/session changée, rôles admin Enterprise et reporter, exceptions SDK et compte manquant.

U01–U11 : rendu ciblé et anti-injection, redirection fixe, invalid/denied, erreurs/retry, logout canonique réel dans jsdom, logout réseau échoué, déconnexion externe, retour bfcache, réponse obsolète, timeout, faux cache local, scripts isolés/IDs uniques/liens locaux et absence d’écritures applicatives.

P00–P05 : PostgreSQL 17 local avec les policies/helpers exacts du snapshot, rôle authenticated, identités fictives. Lectures personnelles, isolation des entreprises, six rôles Enterprise, absence de membership pour Admin, affectations site_manager, compte fermé lisible au niveau RLS. Tout reste dans BEGIN/ROLLBACK ; la disparition des tables temporaires après rollback est vérifiée.

## Résultats exécutés

| Suite | Résultat |
| --- | --- |
| Phase 2B | **46/46 PASS**, dont E01–E25 ; 0 échec, 0 ignoré |
| Resolver Phase 2A | **40/40 PASS** |
| Auth Security P0 | **22/22 PASS** |
| Régressions globales | **426/426 PASS** |
| Vercel build local | **PASS**, cible locale preview ; aucun déploiement |
| Sortie build | Nouveau HTML, deux nouveaux JS et CSS présents dans `.vercel/output/static` |
| Diff existant / index Git | Vides ; aucune modification préexistante |

Les noms détaillés et résultats de chaque test sont archivés dans `phase-2b-test-results.json`, avec les empreintes SHA256 des quatre nouveaux fichiers applicatifs. Build Vercel 59.24.0, Node 24.19.0 ; tests jsdom 26.1.0 et PGlite 0.3.14.

Reproduction depuis la racine du repo, avec les dépendances de test disponibles (jsdom via NODE_PATH, PGlite dans tests/auth-security-p0/node_modules) :

```sh
node --test tests/auth-resolver/*.test.cjs
node --test tests/auth-security-p0/*.test.cjs
node --test --test-concurrency=1 tests/enterprise-workspace/*.test.cjs
node --test --test-concurrency=1 tests/*.test.cjs tests/diagnostic/*.test.cjs tests/estimator/*.test.cjs tests/diagnostic-db/*.test.cjs
```

Build effectué dans une copie temporaire du candidat, avec la configuration Vercel existante, sans pull d’env ni secret Production. Le build inclut aussi les 146 tests Diagnostic du gate existant. Aucun changement de dépendances/configuration dans le repo.

## Mobile et accessibilité — validation partielle, limitation explicite

Implémenté : viewport-fit=cover ; insets safe-area sur quatre côtés ; une seule réserve basse dans le footer ; disposition mobile-first ; retour à la ligne pour noms longs ; aucune barre fixe ou flottant ; cibles de 44px ; focus-visible ; lien d’évitement ; titres/landmarks, aria-busy, zone de statut ; états chargement/erreur/refus ; effacement des contenus masqués.

Vérifié en tests DOM : focus sur le titre, IDs uniques, états hidden/aria-busy, texte non interprété comme HTML, absence de données Enterprise dans les états refusés, bouton retry, déconnexion et suppression du contexte obsolète.

**Non vérifié visuellement : 320, 360, 390, 430 et desktop ; nom long/rôle long en rendu réel ; clavier réel ; contraste calculé par navigateur ; overflow/overlap ; safe-area Safari. Aucun PASS visuel revendiqué.**

Blocage constaté : le navigateur local agent-browser ne peut pas créer son socket (`Failed to bind socket: Operation not permitted`). Le navigateur distant refuse le serveur loopback (`net::ERR_BLOCKED_BY_CLIENT`). Le binaire Chromium est disponible, mais aucun navigateur contrôlable n’a chargé cette page. Aucune exception de sécurité ou exposition publique du serveur n’a été utilisée pour contourner ce blocage.

Le serveur de recette fourni écoute exclusivement sur `127.0.0.1:4322`, sert une allowlist de fichiers et remplace seulement le loader SDK par des fixtures. CSP `connect-src 'none'` interdit les appels externes. Les destinations index/auth sont des pages neutres locales de test. Le HTML applicatif est servi sans modification.

```sh
node tests/enterprise-workspace/preview-server.cjs
```

URL locale de départ : `http://127.0.0.1:4322/dashboard-enterprise.html?enterprise_id=00000000-0000-4000-8000-000000000101`.
Ajouter `&fixture=long`, `denied`, `error`, `loading`, `guest` ou `logout-error` pour les états contrôlés. Le mode fixture n’existe que dans ce serveur de test et n’est jamais interprété par le code applicatif.

## Limites et suite de revue

- Recette navigateur mobile/desktop/Safari encore requise avant validation finale du rendu.
- Aucun login, signup, compte, invitation ou déconnexion de compte réel Production testé.
- Aucune liaison depuis Auth ni sélecteur multi-espace ; destination accessible uniquement par URL explicite.
- Aucun module opérationnel, donnée métier ou scope de sites reconstruit.
- Le shell est une protection de navigation et d’affichage ; les RLS/RPC restent l’autorité de données. Les permissions Admin existantes ne sont pas modifiées.
- Le commentaire historique du resolver (« not loaded by any page ») décrit sa livraison Phase 2A ; il est laissé intact conformément à l’interdiction de modifier les fichiers existants. Seule la nouvelle page locale le consomme désormais.
- Aucun rollback SQL : aucune migration ou donnée DB modifiée. Retirer les nouveaux fichiers locaux suffit à annuler cette proposition.

**FILES READY FOR REVIEW : les 12 nouveaux fichiers ci-dessus. NO COMMIT. NO PUSH. NO DEPLOY. NO PRODUCTION DB WRITE.**
