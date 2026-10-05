# W5 — Artisan OS : dossier de revue

**Verdict : STOP — W5 ARTISAN OS NORTH STAR NOT REACHED.**

La sécurité V2 est appliquée et vérifiée sur staging. Les parcours Artisan ont été exécutés contre le backend réel. Le profil reste incomplet : aucune autorité de mutation de bio accessible à Mobile n'existe dans le périmètre autorisé. La tentative authentifiée a été refusée ; aucun contournement, grant complémentaire ou seconde migration n'a été appliqué. La bio est explicitement en lecture seule. Le candidat doit rester en PR Draft.

Actualisation après GO Bio : la proposition est autorisée, mais son preflight révèle le trigger existant `artisans_updated_at`, qui modifierait aussi `updated_at`. Le GO impose pourtant « aucune autre colonne modifiée ». L'application Bio est suspendue avant toute mutation staging. Le [dossier Bio](bio-preflight/README.md) contient la migration candidate non appliquée et une reproduction PostgreSQL isolée. Une exception explicite pour ce timestamp canonique est nécessaire.

## A — Preflight et périmètre

- Dépôt : `fixeo-app/Fixeo-clean` ; base exacte `4ece6bdf352518eddc21610d9f68aa573c9fff22`, branche `feat/fixeo-mobile-m4-terrain`.
- Branche isolée : `feat/fixeo-mobile-w5-artisan-os-wow`. Aucun merge, changement MAIN, build physique, W6 ou Production.
- Seul projet Supabase utilisé : `fixeo-diagnostic-staging` / `kqyhusnbybsukbcaoqtu`.
- Le pointeur Git du worktree avait perdu son dépôt commun temporaire. Le dépôt a été récupéré depuis la base distante exacte, puis rattaché aux fichiers W5 existants, sans écraser les sources. Aucun autre propriétaire W5 n'a été trouvé.
- Seules les deux identités synthétiques W4 autorisées ont servi. Chaque lot de sessions a été ouvert par password grant ; aucun JWT ou refresh token archivé n'a été réutilisé. Aucun nouveau compte Auth, réglage Auth/email ou accès Admin Auth de substitution.

## B — Architecture et sécurité

`artisanOS.ts` expose les lectures bornées et mutations canoniques. `artisanExperience.ts` concentre les calculs explicites, dates, erreurs et rapprochements. `ArtisanEditorial.tsx` réutilise Shell V2, composants et RAFI W3, avec chargement, échéance de 20 secondes, reprise manuelle et verrouillage des actions concurrentes.

La seule migration appliquée est `20261005085640_mobile_w5_artisan_authority_v2.sql`, SHA-256 `6f017c6f97c7df25d0acc6117da5bc93c57bd9f7025ed199cdfd1f9f2cae7ed2`. Le MCP a enregistré le nom `mobile_w5_artisan_authority_v2` sous la version serveur **`20261005091927`**. Cette correspondance est documentée ; ne pas réappliquer le fichier via CLI ni réparer l'historique sans revue distincte.

| Contrôle du fichier V2 figé | Résultat |
| --- | --- |
| DROP | 0 |
| DELETE | 0 |
| TRUNCATE | 0 |
| UPDATE sans WHERE | 0 |
| DML métier au niveau d'application | 0 |
| Comparaison avant/après application | 21 tables : effectifs et empreintes inchangés |

Les empreintes ont été relevées avant toute ouverture de session ou création de fixture E2E. Les écritures synthétiques ultérieures sont décrites séparément dans `fixture-manifest.json`. Les advisors conservent leurs cinq constats antérieurs, sans nouveau constat.

Le guard lit `public.users.role`, l'identité Auth et la session canonique `auth.sessions`, pas un rôle ou owner fourni par Mobile. Dix-neuf RPC existantes sont durcies sans changer leurs décisions métier ; quatre nouvelles fonctions fournissent le guard, deux lectures et le wrapper. Les 24 ACL finales vérifiées incluent la RPC historique conservée.

| Fonction | ACL EXECUTE finale |
| --- | --- |
| `public.update_my_artisan_activity_v1(text[],text[])` | `postgres`, `service_role` |
| `public.w5_update_my_artisan_activity_v1(text[],text[])` | `postgres`, `authenticated`, `service_role` |
| `fixeo_private.w5_artisan_actor_v1()` | `postgres`, `authenticated` |

La définition historique est inchangée : MD5 de `pg_get_functiondef` avant/après/final `043db6c4dfed6bcbbe2650c73807fdd3`. Les deux instructions de suppression historiques appartiennent à cette **seule** fonction ; elle n'est pas réémise par V2. Le wrapper appelle cette autorité après contrôle de rôle et de session. Son test positif a utilisé un nouveau profil sans associations préexistantes ; aucune association historique n'a été supprimée.

Les sept policies restrictives additives sont `w5_artisan_session` sur `artisan_business_clients`, `artisan_business_quotes`, `artisan_business_jobs`, `artisan_business_ledger`, `quotes`, `notifications`, et `w5_artisan_profile_update` sur `artisans`. Les ACL détaillées et expressions exactes sont dans `application-proof.json`.

Evidence a reçu un durcissement staging v5 : rôle canonique et session Artisan active avant délivrance de tickets ou liens signés. Le moteur upload/confirm/list et le bucket privé restent les autorités existantes. Le shared proxy RAFI v8 reste inchangé. Aucun rollback n'a été exécuté. V1 refusée est archivée hors du répertoire de migrations ; les rollbacks sont des documents de revue uniquement.

## C — Home

Priorité à la mission/opportunité, décision RAFI, journée et mouvements personnels ; les outils restent secondaires. Une mission terminée affiche « Le relais est au client » et « Suivre la validation », sans inventer une validation Client. Une lecture partielle ou un timeout n'est pas remplacé par une fausse activité vide.

## D — RAFI Artisan

RAFI W3 est conservé. Les conseils reposent sur opportunités, mission, agenda, devis et mouvements disponibles. Aucun prix, KPI ou pouvoir de décision n'est inféré. Voice a traversé le proxy et produit une transcription réelle ; la photo éphémère a répondu 200. Estimator et Diagnostic persistant ont réellement refusé le rôle Artisan avec `ROLE_FORBIDDEN` (403).

## E — Opportunités

Liste et détail utilisent le dispatch canonique. Une acceptation explicite a créé une seule mission ; un devis marketplace de 450 MAD est soumis à la revue FIXEO, `presented_at = null`. Il n'est pas déclaré envoyé au Client. Aucun contrat canonique de refus d'offre dispatch n'a été trouvé : pas de faux bouton de refus utilisant `decline_mission`, qui porte une autre autorité.

## F — Missions

Parcours accepté → arrivé → démarré → terminé exécuté. Timeline et pièces chargées en parallèle ; une seule action dominante suivant l'état. Mission finale `done`, demande `completed`, prix final absent, validation Client non effectuée. L'historique est disponible via la nouvelle lecture owner/session.

## G — Evidence

Deux PNG synthétiques avant/après ont traversé ticket signé, stockage privé, confirmation et lecture signée : réponses 200, objets `ready`. Les captures finales attendent le chargement effectif des deux images. Le composant natif Evidence et ses contrats existants sont préservés. Après révocation, Evidence refuse le JWT (401). Aucune purge ou suppression de média.

## H — Agenda

Aujourd'hui/semaine, interventions personnelles, contexte Client et mission. Le test a créé une visite personnelle liée au Client synthétique. L'acceptation du devis crée séparément son intervention canonique. Les conflits signalent uniquement des départs actifs identiques ; aucune durée n'est inventée. Saisie explicitement dans le fuseau de l'appareil, restitution métier Casablanca ; le test appareil/fuseau différent est documenté dans les captures.

## I — CRM

Fiche nom/téléphone/adresse/notes, devis et interventions liés. Le double appui de création produit une seule ligne. Les quatre tables privées refusent lecture et modification d'un autre owner ; les sentinelles sont inchangées. Un Client avec son propre `owner_user_id` ne peut pas fabriquer un accès Artisan ; un Artisan ne peut pas forger l'owner d'une insertion.

## J — Devis Studio

Deux autorités distinctes. Personnel : lignes prestation/fourniture/main-d'œuvre, quantités, prix explicites, remise, note/validité, aperçu, déclaration d'envoi et accord confirmé. Test : sous-total 210, remise 10, total 200 MAD ; acceptation par RPC canonique et une intervention. La déclaration d'envoi n'envoie pas de message. Marketplace : prix/contexte issus du contrat `submit_artisan_quote_v2`, confirmation avant soumission, revue FIXEO conservée. Aucun mélange des statuts ou des tables.

## K — Finances

200 MAD d'encaissement et 30 MAD de dépense personnels enregistrés, sans doublon. Périodes et mouvements restent explicites. Aucun bénéfice, fiscalité, solde, commission ou paiement marketplace supposé. Les montants absents restent absents.

## L — Profil : blocage restant

Téléphone, métiers/villes et disponibilité utilisent les RPC canoniques. Téléphone réellement modifié par UI ; wrapper activités testé positivement ; disponibilité testée puis laissée `unavailable` en clôture. Les villes sont lues dans `artisans.work_zone`, maintenu par l'autorité d'activité : la table de jointure n'accorde pas la lecture directe à Mobile.

**`PROFILE_BIO_WRITE_AUTHORITY_MISSING`** : le PATCH authentifié de description a répondu 403/42501 ; aucune des 38 colonnes `artisans` n'accorde UPDATE à `authenticated`, et aucune RPC de bio applicable à un profil existant n'est disponible. Une policy n'accorde pas à elle seule ce privilège. L'application affiche la bio en lecture seule et explique cette limite. Aucun faux succès, grant global ou écriture par service role pour masquer l'échec.

`PROFILE_BIO_PROPOSAL_NOT_APPLIED.sql` est une proposition séparée, hors migration runner : RPC dédiée, guard W5, ownership canonique, limite 4000 caractères, UPDATE avec WHERE. **Non appliquée, à valider séparément puis tester avant tout verdict PASS.** La galerie présente uniquement la photo canonique disponible ; aucune nouvelle autorité de galerie ou préférence n'est inventée. Réputation : valeurs réelles disponibles, sinon « En cours de calcul ».

## M — Notifications

Cloche Artisan, liste du destinataire et marquage lu propriétaire testés. Pas de nouveau moteur ni d'envoi externe. La fixture ne contient que du contenu synthétique.

## N — Navigation

Drawer Artisan à onze destinations, dock Home limité à Opportunités/RAFI/Agenda et docks contextuels. Shell W2 partagé, auth racine et parcours Client préservés. Le dock W5 cède sa place à 320 px avec fontScale >= 1,7 ; le drawer reste accessible. Le clavier simulé masque le dock par les événements Keyboard natifs adaptés au harness.

## O — E2E et matrice Auth

| Cas réellement exécuté sur staging | Verdict |
| --- | --- |
| Artisan actif / RPC d'accès | 200 / PASS |
| Wrapper actif / profil synthétique | 200 / PASS |
| Client / accès Artisan et wrapper | 403 `ARTISAN_REQUIRED` |
| Ancienne RPC / authenticated | 403 `42501` |
| Session révoquée / accès, missions, offres, wrapper, CRM | 403 `SESSION_REVOKED` |
| Session révoquée / Evidence | 401 `UNAUTHENTICATED` |
| JWT invalide | 401 `PGRST301` |
| Autre owner / clients, devis, jobs, ledger | aucune ligne lue ou modifiée |
| Mission étrangère / RPC détail | `not_your_mission` |
| Devis personnel étranger / acceptation | `QUOTE_NOT_FOUND` |
| Artisan / Estimator et Diagnostic persistant | 403 `ROLE_FORBIDDEN` |

Le renderer monte les vrais écrans TSX et services Mobile avec Auth et HTTP staging réels. Les adaptations concernent le routeur du harness, le stockage de session, la caméra, le micro et les événements clavier. Le transfert HTTP natif retire Origin/Referer ; ce résultat ne certifie pas le navigateur public ni un build physique. `agent-browser` n'a pas démarré malgré deux essais ; les preuves proviennent de Playwright/Chromium, pas d'un succès agent-browser supposé.

`runtime/runtime.json` contient 23 vérifications réussies et zéro erreur JavaScript de page. Des lenteurs staging réelles ont exercé timeout/retry. Les traces conservent les refus initiaux qui ont révélé les défauts de lecture villes et d'écriture bio ; elles ne sont pas nettoyées pour simuler un parcours sans erreur.

## P — Captures

Captures réelles dans `runtime/` : Home finale, opportunité/confirmation, mission, Evidence chargée, agenda, CRM, devis aperçu/accord, finances, profil, notifications, RAFI voice/photo, drawer. `home-awaiting-client-320.png`, `large-text-200.png`, `large-text-200-priority.png`, `keyboard-320.png` couvrent étroitesse, texte à 200 %, Reduced Motion et clavier simulé. Aucun débordement horizontal constaté. La correction du dock à grand texte est limitée à W5 ; les prises de vue précédentes restent des traces intermédiaires, les dernières prises homonymes montrent la correction.

## Q — Non-régression et validation locale

| Vérification | Résultat |
| --- | --- |
| Contrats Mobile | 98 PASS, 0 FAIL, 0 SKIP |
| Autorité W5 + Intelligence + Diagnostic + Estimator | 199 PASS, 0 FAIL, 0 SKIP |
| Client C4 local | 14 PASS |
| Typecheck + export web Gate A | PASS |
| Expo Doctor 1.20.4 | 18/18 |
| `git diff --check` | PASS |

Tests SQL en PGlite éphémère : RLS réelle, owners forgés, rôle Client, session révoquée, ACL du wrapper, ancien corps inchangé et absence d'effet à la définition. Les 19 corps durcis sont comparés au snapshot staging ; 17 UPDATE possèdent un WHERE. Les fichiers Client, auth, moteurs, Evidence natif, proxy et RAFI W3 restent protégés par leurs invariants. Seules les empreintes des présentations Artisan explicitement remplacées par W5 ont été sorties du gel W4, avec liste dédiée. Les quatre fichiers SQL figés conservent leurs fins de ligne historiques CRLF via des attributs Git ciblés ; aucun reformatage de la migration approuvée.

## R — CI

Les workflows Mobile Intelligence, Mobile Gate A, Supply, Client C4 et Control sont déclenchés par cette PR ; Vercel doit être vérifié sur son SHA. Les filtres des quatre contrats serveur incluent V2. Aucun workflow de migration staging/Production n'est ajouté. Le statut de référence après publication sera consigné dans la PR ; aucun PASS CI n'est anticipé dans ce dossier.

## S — Git et revue

PR **Draft** exclusivement vers `feat/fixeo-mobile-m4-terrain`. Pas de merge. Tous les éléments nécessaires à la revue sont versionnés ici : migration figée, ACL, empreintes, matrice, fixtures, captures, logs, rollback non exécuté et proposition bio non appliquée. Aucun credential, mot de passe, token, refresh token ou lien de média signé n'est versionné. Le package-lock Mobile généré localement reste une sortie de validation, suivant le workflow de base.

## T — Clôture et reste à faire

`staging-closure.json` confirme 21 comptes Auth (aucun nouveau), **zéro session pour les deux identités synthétiques réutilisées**, Artisan indisponible, ancienne définition/ACL conservées et une seule migration du jour. Les autres sessions du projet ne sont pas des sessions de ce test et n'ont pas été révoquées. Les fixtures métier W5 restent documentées, sans nettoyage destructif. Après l'application, les RPC de profil ont synchronisé ville et téléphone dans les projections publiques `users`/`profiles` du compte Artisan synthétique réutilisé ; ces effets E2E sont distincts de l'absence de mutation pendant l'application de V2. Les anciennes missions, devis, clients et médias sont inchangés.

Le GO Bio a depuis été accordé. La décision encore nécessaire porte sur l'effet automatique `updated_at` décrit dans le dossier Bio ; l'intégration et les tests attendent sa résolution. Le refus d'offre dispatch et l'édition de galerie restent bornés aux contrats disponibles décrits ci-dessus. Aucune certification North Star tant que le profil attendu n'est pas complet. Le sujet W8 `PHYSICAL_DIAGNOSTIC_MEDIA_PURGE_CERTIFICATION` reste reporté ; aucune exécution W8.
