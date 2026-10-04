# STOP — W4.1 ACTIVATION GATES NOT CERTIFIED

Audit W4.1A du 4 octobre 2026, staging exclusivement. L'autorisation W4.1A est reçue ; le blocage est une absence de preuve et d'accès technique, pas une demande de renouvellement du GO. Aucun code du cœur W4.1 n'a été reconstruit.

## A. PREFLIGHT

| Contrôle avant mutation distante | Observation |
| --- | --- |
| Repository / PR | `fixeo-app/Fixeo-clean`, #148 ouverte, Draft, non mergée |
| Head imposé | `6eb4e587260f9b7c6e017f3452988751020fc585`, exact, revérifié |
| Branche | `feat/fixeo-mobile-w4-1-intelligence-gateway` |
| Base W4 | `feat/fixeo-mobile-w4-client-os-wow`, `31df5b08cfb62a4e8841bbb18055826bf87ef62a` |
| Propreté | Fichiers suivis propres ; anciens logs/export non suivis archivés hors dépôt ; état ensuite propre |
| Concurrence | Aucun autre test/build local ni requête applicative SQL active observé. Contrôle ponctuel ; aucun verrou exclusif global n'est revendiqué |
| Staging | `fixeo-diagnostic-staging`, `kqyhusnbybsukbcaoqtu`, `ACTIVE_HEALTHY`, URL canonique confirmée |
| Proxy | `mobile-rafi-preview-proxy`, v2, ACTIVE, `verify_jwt=true` |
| Migrations présentes | `20261004181121`, `20261004183523`, `20261004184025` ; noms et empreintes dans le manifest W4.1 |
| Gate SQL | `enabled=false` |
| Sessions de certification | 0 session Auth sur les trois fixtures W4.1 ; 0 Diagnostic en cours ; 0 lease de purge actif |

Preuves : `preflight.json`, `proxy-baseline.json`, `staging-state.json`, [migrations W4.1](../w4-1/MIGRATIONS.md).

## B. PROXY v2 BASELINE

- Function ID : `595f13c1-119b-4a2b-9b69-bcfe12c16ca3`.
- Bundle `ezbr_sha256` : `8f8f32ac1a9a8b2ffb912a9d5861d7cd64ea1bc29e591df4bf7185616b9c70dd`.
- SHA256 du fichier `index.ts` récupéré : `3c507895202e112bb4ad134f44849b89e9ee322f308a2c3e9394b017a03c6070`.
- Code complet conservé en copie privée, permissions 0600. Il contient l'ancien origin et un share token intégré : aucune valeur n'est publiée ni ajoutée à Git. Aucun Git SHA de cette Edge Function n'est fourni par ses métadonnées ; le hash de source ne doit pas être confondu avec un Git SHA.
- v2 accepte photo/transcribe, pas Estimator. Elle utilise un ancien Preview, différent du Preview W4.1 vérifié. Elle ne lit pas les deux variables du candidat.
- Aucune modification de ce code déployé ni de sa configuration.

## C. CONFIGURATION W4.1

Le Preview du checkpoint est READY : `dpl_AzLbpiHjzrCsBxDUyVdL68s3Wz6t`, associé exactement au SHA et à la branche ci-dessus. Son URL système est enregistrée dans `checkpoint-ci.json`. Un futur changement de head impose de revérifier la correspondance du Preview avant configuration.

| KEY | Source actuelle / proposée | Environnement et scope exact | Existe ? | Action nécessaire | Valeur |
| --- | --- | --- | --- | --- | --- |
| `FIXEO_MOBILE_PREVIEW_ORIGIN` | URL système du déploiement Vercel W4.1 vérifié | Secrets Edge du seul projet Supabase staging ; lecture par le proxy existant ; cible exclusive Preview W4.1 | Non vérifié | Inventorier, puis créer ou corriger uniquement si nécessaire ; comparer l'empreinte à l'URL vérifiée | Non affichée |
| `FIXEO_MOBILE_PREVIEW_BYPASS` | Réutilisation de l'accès Preview existant ; ancienne valeur embarquée v2 non assimilée à ce paramètre | Secrets Edge du seul projet staging ; autorité serveur uniquement | Non vérifié | Inventorier et prouver la correspondance avant toute bascule | Non affichée |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Entrée Vercel existante `6PX0ENsCuVuyQbXW` | `fixeo-clean`, Preview global existant | Oui, métadonnées vérifiées | Réutiliser sans modification ; valeur non récupérée pendant cet audit | Non affichée |

Les secrets Edge ont une portée projet Supabase, pas un scope de branche Git. Leur visibilité aux autres fonctions du staging doit être prise en compte. Le proxy doit n'utiliser que les trois routes autorisées, sans fallback Production. Les sept variables Vercel W4.1 conservent leur scope Preview/branche exact et leurs identifiants ; `env-metadata.json` ne contient aucune valeur. [Manifest Vercel complet](../w4-1/ENV_MANIFEST.md).

**Blocage constaté :** le connecteur Supabase disponible ne fournit ni inventaire ni écriture des secrets Edge. Le contrôle officiel `supabase@2.119.0 secrets list --project-ref kqyhusnbybsukbcaoqtu --output json` échoue pour absence d'authentification CLI. L'absence de ces variables n'est donc pas affirmée : leur présence et leurs valeurs restent non certifiées. Aucun token de connecteur n'a été extrait, aucun accès de secours caché utilisé.

Conformément au §5 demandé, arrêt avant déploiement. Le recours au Dashboard via navigateur nécessiterait l'accord de fallback imposé par l'outil Browser ; il n'a pas été lancé. Un accès CLI/API authentifié aux secrets permettrait également de lever ce blocage sans navigateur.

## D. PROXY CUTOVER STAGING

**Non exécuté.** v2 reste active. Le candidat présent dans `supabase/functions/mobile-rafi-preview-proxy/index.ts` n'a pas été modifié. Aucune route additionnelle, aucune fonction parallèle.

## E. PROXY ROLLBACK

Un payload privé complet `rollback-proxy-v2.json` est préparé pour un unique appel `supabase_deploy_edge_function` : projet `kqyhusnbybsukbcaoqtu`, nom `mobile-rafi-preview-proxy`, `entrypoint_path=index.ts`, `verify_jwt=true`, fichiers exactement récupérés de v2. Vérifier le SHA256 ci-dessus avant cet appel ; ne jamais afficher le payload.

La restauration recrée exactement le code et la configuration embarquée v2 en **une opération de déploiement**. Supabase attribuerait une nouvelle version numérique : ce n'est pas une réécriture de l'historique pour renommer la version « 2 ». Les variables du candidat sont ignorées par v2. Leur retrait éventuel serait une opération séparée, à inventorier avant toute création.

Rollback préparé, jamais exécuté, fonctionnement de l'ancien upstream non recertifié. Tant qu'aucune bascule n'a eu lieu, aucune restauration distante n'est nécessaire. Les copies privées restent hors Git ; ne pas publier l'ancien share token.

## F. TRUE MOBILE PATH TESTS

**Non exécutés sur un proxy W4.1 : aucune bascule n'a eu lieu.** La réussite du Preview direct W4.1 ou de la CI ne prouve pas ce chemin.

| Matrice demandée | État W4.1A |
| --- | --- |
| Anon, JWT invalide, rôle non Client, Client, cross-user | Non rejoué via un proxy W4.1 |
| Voice, photo, Estimator | Non rejoué via un proxy W4.1 |
| Diagnostic normal/référence, confirmation, handoff, vrai STOP | Non rejoué via un proxy W4.1 |
| Diagnostic facultatif, Estimator facultatif, demande directe | Contrats locaux verts ; nouveau trajet partagé non certifié |
| Altération, expiration, replay, mismatch ville/service, fuite | Contrats locaux verts ; preuve distante via proxy manquante |

## G. CLEANUP CANONICAL AUDIT

Définition réelle extraite en lecture seule : `canonical-cleanup.sql`, SHA256 `5a3f2cb1c598fc11bc6281e25e5f5692adcb8873d86bd4cc0787f459aa91b1af`. Copie d'audit, **pas une migration à appliquer**. ACL réelle : `postgres` et `service_role` uniquement ; `anon` et `authenticated` n'ont pas EXECUTE. Fonction SECURITY DEFINER, `search_path=''`.

La fonction canonique conserve claim, lot borné à 8, `FOR UPDATE SKIP LOCKED`, lease 5 minutes, raw/clean déterminés côté SQL, finish avec lease, retries/backoff et suppression des dossiers après tombstones. Aucun remplacement proposé de ses règles métier.

Deux observations empêchent une preuve de purge immédiate :

1. Les cinq objets présents sont des clean paths appartenant aux fixtures W4.1 documentées. Quatre lignes sont éligibles au **nettoyage raw seulement**, mais ces raw objects sont déjà absents. Les clean objects ne sont pas encore éligibles. Exécuter ce claim ne démontrerait aucune suppression physique des cinq objets présents.
2. `claim` exécute aussi des mutations globales : expiration de runs, clôture observée, réduction de rétention et suppression de dossiers expirés. Le prédicat de suppression sélectionne actuellement le dossier antérieur `20000000-0000-4000-8000-000000000400`, hors fixtures W4.1. `p_payload` ne comporte aucun filtre de session ou de lot. Filtrer les paths après `claim` ne protège pas ces autres effets.

Aucun claim/finish n'a donc été exécuté, aucun timestamp de rétention ajusté pour contourner ce constat. Une isolation démontrée des fixtures et des effets de claim est nécessaire avant le test manuel. Modifier les règles canoniques ou les données de l'ancien dossier ne fait pas partie de cette livraison.

## H. MAINTENANCE AUTHORITY

Le worker legacy `api/diagnostic/maintenance.js` utilise `diagnostic_cleanup_v1` et le Storage API, avec le transport legacy qui exige service_role. Il n'est pas exposé dans le Preview W4.1 isolé. Aucune autorité de maintenance Diagnostic plus restreinte déjà provisionnée n'a été trouvée dans les fonctions, rôles et policies inspectés.

**Cela ne démontre pas que service_role soit indispensable.** Storage accepte des opérations sous JWT soumis à RLS. La piste minimale à qualifier reste : identité Auth de maintenance dédiée, non Client, JWT court exclusivement serveur, délégation gardée vers la primitive canonique, et SELECT/DELETE limités aux paths d'un claim valide. Aucun credential n'a été créé et aucune policy n'a été ajoutée.

Contrat proposé, non implémenté et non certifié :

- Identité issue de `auth.uid()` ; correspondance dans une table privée administrée côté serveur, session Auth active, compte non banni, expiration et interrupteur de maintenance. Aucun rôle tiré de `user_metadata`.
- `diagnostic_cleanup_v1` garde ses ACL ; un wrapper séparé refuse tout Client avant de déléguer. Definer privé, `search_path=''`, objets qualifiés, aucun SQL dynamique, aucun accès aux tables privées pour Mobile.
- Claim relié à l'identité **et à sa session** ; Storage SELECT/DELETE uniquement sur le bucket privé, path exact et lease encore valide, jamais sur un prefix arbitraire. Aucun overwrite ni droit Client ajouté. L'absence d'effets hors fixtures doit être prouvée avant d'invoquer le claim global.
- Edge Function de maintenance séparée, jamais ajoutée aux routes Mobile ; aucun service_role ni clé de signature générale du projet à récupérer. JWT de maintenance seulement dans l'appel serveur ; sa provision et son stockage restent à définir avec la preuve d'isolation.
- Révocation : fermer l'interrupteur de maintenance, retirer l'identité autorisée, révoquer ses sessions/refresh tokens et renouveler son credential serveur. Rollback : retirer uniquement le wrapper, les policies et la fonction de maintenance ajoutés, conserver la primitive canonique et les données métier.

L'option de signer un rôle JWT personnalisé avec le secret global de signature n'est pas retenue comme raccourci : elle déplacerait une autorité large. Aucun nouveau GO service_role n'est demandé sur la base des seules ACL actuelles.

## I. PHYSICAL STORAGE PURGE TEST

**Non exécuté / non certifié.** Les cinq objets restent présents. Aucun DELETE Storage ni DELETE SQL de `storage.objects`. Un refus d'accès, une expiration, un raw déjà absent ou une disparition de métadonnée SQL ne sont pas comptés comme une purge physique.

La preuve encore requise est : création synthétique vérifiée → éligibilité canonique → claim exact → DELETE via Storage API → absence confirmée avec une autorité de lecture toujours valide → finish réussi → état/tombstone DB cohérent.

## J. RETENTION / RETRIES / CONCURRENCY

| Règle canonique auditée | Statut |
| --- | --- |
| Premier `closed_seen_at`, rétention après clôture de 30 jours | Inchangée ; non accélérée |
| Raw finalisé après `upload_expires_at + 5 minutes` | Inchangée |
| Lease 5 minutes ; mauvais lease/lease expiré refusé | Présent dans la définition ; pas de nouveau test staging |
| Backoff `5 minutes × min(288, 2^min(attempts,8))` | Inchangé ; pas de nouveau test de panne Storage |
| `FOR UPDATE SKIP LOCKED`, lot 8 | Présent ; concurrence réelle non recertifiée |
| Raw/clean éligibles, non-expiré préservé, finish ok/error, objet absent | Matrice physique non exécutée |
| Double worker, path hors claim, cross-session | Autorité minimale non implémentée ; non certifié |

Worker manuel : non certifié. Planification : non activée. `pg_cron`/`pg_net` absents ; aucune nouvelle extension, tâche permanente ou cron Vercel. Le choix d'un scheduler attend la certification manuelle du worker.

## K. NON-RÉGRESSION

Rejouée sur les sources du checkpoint, inchangées par W4.1A :

- 191/191 tests serveur/SQL local réussis : `server-regression.log`.
- 85/85 contrats Mobile réussis : `mobile-contracts.log`, incluant W2 Shell, W3 RAFI, W4 Client, mission/evidence, auth, demande directe, Diagnostic/Estimator facultatifs et Safety by Exception.
- Mobile Gate A : typecheck et export **web** réussis, `mobile-gate-a.log`. Aucun build physique.

Ces résultats établissent la non-régression locale ; ils ne sont pas déclarés tests « après cutover/purge », puisque ces opérations n'ont pas eu lieu. Les preuves live W4.1 antérieures restent dans `../w4-1/` avec leur SHA et leur trajet exacts.

## L. CI

Les cinq workflows du SHA imposé sont SUCCESS, Vercel READY (`checkpoint-ci.json`). La publication de ce rapport sur la même branche déclenche la CI du nouveau SHA ; ses résultats exacts et son déploiement sont consignés dans la PR #148 et le compte rendu final, sans assimiler cette CI à la fermeture des gates.

## M. STAGING FINAL STATE

v2 conservée ; gate W4.1 fermé ; 0 session Auth de fixture, 0 run Diagnostic actif, 0 lease de purge actif ; 5 objets Storage conservés. Aucun secret créé/récupéré pour la purge, aucun service_role utilisé, aucun scheduler activé, aucune migration W4.1A appliquée. Les trois migrations W4.1 existantes restent présentes. `staging-state.json` contient la lecture finale horodatée.

## N. GIT / SHA / PR

La livraison W4.1A ne contient que des preuves et de la documentation sur la branche autorisée ; le runtime et les migrations restent identiques au SHA de départ. PR #148 conservée Draft vers W4, mise à jour sans merge. Le nouveau SHA est fourni par la PR et le compte rendu final. PR #147, W4, W5 et MAIN non modifiés.

## O. REMAINING RISKS

1. Configuration Edge inconnue sous les deux noms requis : blocage de toute bascule du proxy.
2. Aucun test du vrai trajet Mobile vers W4.1 ; le proxy actuel ne transporte pas Estimator.
3. Aucun worker de purge physique certifié ; les médias synthétiques restent présents.
4. Effet global du claim sur un ancien dossier : une simple allowlist de paths dans le worker ne suffit pas.
5. Le rollback v2 restaure un ancien share token ; sa validité opérationnelle n'a pas été recertifiée. La copie exacte constitue une baseline, pas une preuve de fonctionnement de l'ancien upstream.

Le déblocage demande un accès authentifié aux secrets Edge staging et une preuve d'isolation du claim canonique pour les fixtures autorisées. Aucun assouplissement des règles de rétention ni usage service_role n'est approuvé implicitement.

**Zéro mutation Production. Aucun merge, cutover, build physique, reprise W4 ou démarrage W5.**

Références officielles consultées : [secrets Edge](https://supabase.com/docs/guides/functions/secrets), [suppression Storage](https://supabase.com/docs/guides/storage/management/delete-objects), [rôles Storage](https://supabase.com/docs/guides/storage/schema/custom-roles). Une suppression physique passe par le Storage API, jamais par la suppression SQL des métadonnées.
