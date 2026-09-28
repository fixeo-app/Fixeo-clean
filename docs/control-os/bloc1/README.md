# FIXEO — Bloc 1 : Global Data & Authority Contract

Candidat de préparation, **sans application Production**. Branche `feat/control-os-bloc1-contract`, PR #52. Base canonique `fixeo-app/Fixeo-clean`, main `04528ab40523e9077a89f0381fed639540d0d111`. Réconciliation du 28 septembre 2026 : main et Production Vercel identiques à la baseline du Master Blueprint ; 206 définitions/ACL de fonctions comparées au catalogue, sans dérive constatée. Les preuves de référence restent celles du Bloc 0 ; ce dossier ne le remplace pas.

**CONTROL OS ORCHESTRE. CONTROL OS NE DUPLIQUE PAS.** Les tables ajoutées sont un journal d’audit, des tickets de confirmation et le registre canonique des reversements de commission jusqu’alors absent. Aucun miroir Client, Mission, Quote, Enterprise, Pricing ou Business n’est ajouté. Les quatre sous-blocs sont 1.1 à 1.4 ; les sept autres blocs et leurs 24 sous-blocs ne sont pas développés ici.

## 1.1 — Identités, relations et cycles

| Concept / clé canonique | Relations et cardinalités | Autorité / compatibilité |
|---|---|---|
| Utilisateur `auth.users.id` UUID | `public.users.id`, `profiles.id` portent la même identité ; profil applicatif éventuellement absent | Auth vérifie la session ; `public.users.role`/`public.is_admin()` décide Admin. Aucun rôle transmis par navigateur n’est une preuve. |
| Client `users.id`, role client | 1 → N `service_requests.client_profile_id` ; NULL = demande guest, pas un client anonyme unique | Client OS / autorités d’intake. Pas de rapprochement automatique par téléphone. |
| Artisan `artisans.id` UUID | `owner_user_id` → identité Auth ; profil référencé éventuellement sans propriétaire ; `legacy_id` reste une référence historique | Claims possède le transfert de propriété ; Trust possède `verified`. Ni téléphone ni `legacy_id` ne remplace la clé UUID. Plusieurs profils par utilisateur ne sont pas fusionnés. |
| Multiactivité artisan | 1 → N `artisan_service_categories`, 1 → N `artisan_service_cities` ; champs principaux et `services` historiques conservés | Dispatch reste l’autorité d’éligibilité. La projection expose les listes réelles ; aucun moteur Admin de matching. |
| Demande `service_requests.id` UUID | 1 → N offres/missions, 1 → N devis ; 0/1 ERC ; 0/1 offre Pricing référencée ; Diagnostic lié facultatif | Service Requests, intake Client/guest/urgent/Enterprise existants. Origine Enterprise prouvée par ERC, pas par texte libre. |
| Mission `missions.id` UUID | `request_id` **texte sans FK** vers SR.id ; `artisan_profile_id`, `client_profile_id` ; 0/1 devis accepté nouveau | Ne pas convertir tous les identifiants historiques. Jointure `r.id::text=m.request_id`, orphelin explicite. Nouveau gagnant exige une demande canonique. |
| Devis `quotes.id` UUID | `request_id` FK ; artisan auteur ; N devis possibles/demande, un gagnant | Prix, portée et version restent sur le devis canonique. `missions.accepted_quote_id` FK unique nouvelle ; version acceptée persistée. |
| Enterprise `enterprise_accounts.id` | 1 → N sites, membres, workers, ERC | Supervision globale minimale autorisée ; aucune insertion de membership par Control. |
| Site `enterprise_sites.id` | N → 1 enterprise ; ERC et droits de site | Un filtre site exige un tenant correspondant. Un UUID de site ne suffit pas à définir un scope. |
| Membre `enterprise_members.id` | Relation identité–tenant–rôle ; scope site via mécanisme Enterprise existant | Membre ≠ worker. Aucune promotion implicite d’Admin FIXEO. |
| Worker `enterprise_workforce_workers.id` | Tenant, membre, sites autorisés ; 1 → N affectations | Projection : ID, tenant, statut, disponibilité, capacité et charge. Pas de nom privé, contact ou fiche membre. |
| ERC `enterprise_request_context.id` | Relation unique demande → tenant/site ; gouvernance et SLA liés | Source canonique de l’origine, jamais table `admin_enterprise_requests`. |
| Affectation interne `enterprise_internal_assignments.id` | Demande, tenant, worker ; unicité active canonique | RPC Enterprise existantes, rôles tenant conservés. Control n’assigne pas à leur place. |
| Dispatch hybride | État par demande dans `enterprise_hybrid_dispatch_state` | Modes, fallback et gouvernance restent Enterprise. Le verrou partagé porte sur SR. |
| Snapshot SLA `enterprise_request_sla.id` | Demande → politique/version/deadlines figées | Aucune seconde politique Admin. La vue existante consomme désormais les mêmes faits externe/interne. |
| Claim `claim_requests.id` | Artisan UUID ou lien legacy à résoudre ; demandeur utilisateur | `approve_artisan_claim` / `reject_artisan_claim`. `claims` legacy n’est pas réintégré au workflow. |
| Offre Pricing `fixeo_pricing_offers_v1.id` | Snapshot versionné, prix/commission en unités mineures, durée de validité | Pricing/VAP et propositions Diagnostic restent autorités ; Control lit provenance et montant persisté. |
| Diagnostic privé | Session/run, lien vers demande, run choisi | Projection pure de métadonnées liée à une demande. Pas d’input, images, texte d’analyse, token, quota ou mutation de consultation. |
| Paiement `payments.id` | FK mission ; nature commission non établie | N’est jamais converti automatiquement en reversement confirmé. |
| Reversement `commission_remittances_v1.id` | N → 1 mission ; correction `supersedes_id` → précédent | Nouvelle **autorité Finance canonique**, sans recopier prix/commission. Montant, méthode, preuve de référence, acteurs, version et dates. |
| Audit / preview | ID audit ; ID preview, acteur, capability, cible, empreinte, TTL | Objets techniques de gouvernance, pas seconde vérité métier. |

Le détail des FK réellement présentes avant changement est dans `relations-fk-baseline.json`. Les FK nouvelles sont lisibles dans la migration Foundation. Les identifiants polymorphes de notifications, audit et previews n’ont volontairement pas de FK multi-table ; les types sont fermés, les cibles sont résolues par projections explicites. `missions.request_id` est la principale relation métier sans FK ; aucun backfill/ALTER TYPE massif n’est inclus.

### Cycles canoniques

| Objet | Cycle et transitions | Autorité / invariants |
|---|---|---|
| Service Request | `new` → `assigned` → `in_progress` → `completed` → `validated` ; `no_match` séparé ; `cancelled` terminal hors réalisation | Intake crée new. Dispatch propose une offre ; l’acceptation légitime assigne. Les RPC artisan démarrent/terminent ; le client confirme. |
| Mission | `offered` → `pending` + accepted_at ; SR.assigned puis SR.in_progress ; `done` puis `validated` ; `declined`, `expired`, `cancelled` distincts | `claim_mission`, `accept_my_dispatch_offer_v1`, `start_mission`, `complete_mission`, `confirm_completed_mission` réutilisés. Les statuts physiques assigned/in_progress ne sont pas inventés dans M. |
| Quote | Soumission `pending/submitted` → revue FIXEO `approved` ou `rejected` → présentation de cette version → client accepted/rejected → mission pending | Une modification de portée/prix incrémente la version et annule la revue. Même payload = même soumission. Aucun avis client avant approbation. Acceptation sérialisée et idempotente. |
| Historique Quote | `legacy_unreviewed` explicite à l’ajout de colonne ; nouveaux devis submitted | Les accepted/rejected historiques restent lisibles à leur client. Un ancien accepted sans lien mission nouveau exige une réconciliation ; il ne recrée jamais une prestation validated. Les pending historiques nécessitent une revue FIXEO. |
| Affectation interne | assigned → in_progress → completed → validated ; états d’annulation gérés par Enterprise | Les RPC Enterprise et leur unicité active sont conservées. Aucun faux owner/member. |
| Claim | pending → approved/rejected ; competing pending → superseded_by_approval | Artisan verrouillé avant claim, y compris résolution legacy. Propriétaire existant différent interdit. Pas de réinitialisation arbitraire du profil. |
| Pricing | Catalogue/snapshot → offre → acceptation/binding ; changement de scope → proposition autorisée nouvelle | Les triggers Pricing/VAP continuent à imposer les montants ; un devis libre ne remplace pas une offre Pricing déjà liée. |
| Finance | Prix final enregistré → commission exigible si réalisation admissible → declared → confirmed ; cancel ou correct → ancien cancelled + nouvelle declared | final_price ≠ paid ; déclaration ≠ confirmation. Mission verrouillée, version du reversement contrôlée, somme confirmée plafonnée à la commission persistée. Pas de taux fixe Admin. |

**Gagnant** : une mission externe engagée pending/done/validated OU une affectation interne assigned/in_progress/completed/validated. Toute nouvelle prise d’engagement partage le verrou SR ; les anciennes offres restent des offres. Deux gagnants historiques produisent un conflit à examiner ; aucun n’est supprimé automatiquement. L’annulation/réaffectation reste gouvernée par les autorités de domaine.

**SLA hybride** : acceptance externe = `accepted_at` d’une mission engagée ; interne = `assigned_at` de l’affectation canonique. Start = `missions.started_at` capturé au passage SR.in_progress ou IA.started_at. Résolution = M.completed_at ou IA.completed_at. La validation client reste un événement ultérieur. `enterprise_request_sla` fournit la seule deadline d’acceptation. Aucune politique start/résolution supplémentaire n’étant établie, leur état reste `not_configured`. Plusieurs gagnants = `unknown_conflict`, jamais MET par choix du minimum. Les dates historiques absentes ne sont pas reconstruites depuis created_at.

## 1.2 — Metrics et Source Health

`api/control/metrics-registry.json` contient 100 entrées versionnées : 57 agrégats implémentés et 43 contrats explicitement non exposés avant leurs prérequis. Les métriques des blocs Growth/Command ultérieurs sont contractuelles, pas des valeurs inventées. Chaque entrée donne source, autorité, grain, formule, scope, fenêtre, timezone, exclusions, unité, fraîcheur, complétude et pagination. La table H du Blueprint reste la référence sémantique.

Les six sources implémentées sont requests, missions, artisans, trust, network, finance. `control_summary_v1` calcule sur le serveur ; 752 demandes donnent 752 même si la liste n’en charge que 50. Classification explicitement all/production/test/internal/unclassified. Les anciens objets non classés restent NULL. Aucun nom, numéro, ville ou mot « TEST » n’est une règle.

- Stock = état à `as_of` ; flux et cohortes `[from,to)` restent contractuellement distincts et non exposés par le résumé stock actuel. UTC pour stockage ; `Africa/Casablanca` pour calendrier métier.
- urgent total ≠ urgent active ; completed ≠ validated ; fulfilled exclut cancelled ; available ≠ active ; offered ≠ assigned.
- `missions.validated` exige les dates de fin et validation ; `validated_raw` et `validation_unproven` rendent visible l’historique non démontré.
- `artisans.active_30d` = au moins une acceptation, un démarrage ou une fin Marketplace observée dans les 30 jours ; version 1. L’historique de démarrage/fin antérieur manque : valeur observée marquée partielle, pas total global exact ; inactifs reste inconnu. Aucun accès Business.
- `finance.expected` lit la commission des engagements en cours ; `due_gross` est inconnu si un montant ou la fin d’une ancienne validated manque ; `confirmed` somme uniquement les reversements rapprochés non annulés. Solde historique sans rapprochement reste à vérifier. Une ancienne mission validated sans date de fin ne permet pas de déclarer/confirmer un reversement ; une réconciliation explicite est nécessaire.
- Le nombre de clients est une dimension d’identité non classifiée ; ne pas l’utiliser comme clientèle « production » filtrée. Claims sans FK artisan restent inclus dans all et non classés, sans rapprochement silencieux.
- NULL ≠ 0. Population vide complète = 0 pour un compte/somme connu ; durée sans événement = NULL. Une valeur partielle ne devient pas exacte parce que la requête HTTP a réussi.

`SourceState` commun : source, status (healthy/stale/partial/forbidden/unavailable/unknown), data, error, as_of, last_success_at, latency_ms, completeness. Les états idle/loading relèvent du consommateur ; aucune valeur n’est exposée pendant l’initialisation. L’accès refusé efface toute ancienne donnée ; l’échec réseau peut garder une sélection datée stale. Les six agrégats échouent indépendamment, timeout 5 s/source, navigateur 8 s, aucun retry automatique. Une source absente interdit le briefing « tout va bien ». Pas de cache serveur partagé ni de métrique p95 déduite d’un seul fetch.

Le shell conserve ses listes bornées comme **sélections**, avec colonnes minimales, timeout annulable et pagination côté contrat. Ses cartes principales utilisent les agrégats ; les autres comptes sont explicitement « sélection ». Les anciens calculs « demandes moins profils = capacité » ne sont plus présentés comme une capacité ou un trou critique. Les listes/UX complètes relèvent des blocs 2–6.

## 1.3 — Autorisation et projections

Transport fermé : POST JSON `/api/control-v1/...`, bearer utilisateur, clé publique Supabase côté serveur, `Cache-Control: private, no-store`. Aucun service_role dans ce transport. Auth est revérifié puis chaque RPC relit le rôle DB. Pas de nom SQL/table/RPC fourni par le client. Une Preview sans backend isolé refuse explicitement l’accès au lieu de retomber sur Production.

| Opération | Entrée / sortie | Autorité et refus |
|---|---|---|
| summary | classification fermée ; six SourceState + manifest | `control_summary_v1(source,classification)` ; agrégats exacts, aucun total de page |
| operations | curseur UUID, limite 1–100, statut/ville/métier/tenant/site/classification | `control_operations_list_v1` ; curseur ordonné ID, has_more, global_total=NULL |
| dossier | type allowlist + UUID | `control_dossier_read_v1` ; résumé minimal, relations 50 et overflow, timeline 50 et overflow, ERC/SLA ; pas de chargement Business |
| search | texte 2–120, type fermé, limite 1–50, curseur | `control_search_v1` ; champs explicitement autorisés ; pas de texte privé/media/token |
| signals | même scope que summary | Règles déterministes de `api/control/contracts.js` : urgences, demandes nouvelles, claims, vérification divergente, cycles incohérents, prix manquants ; signal ≠ permission |
| action/preview | capability allowlist, cible, paramètres propres à l’action, justification | `control_action_preview_v1` ; ticket lié à l’acteur, empreinte état, TTL 5 min, 60 previews/min/acteur ; cible/effet/autorité/préconditions exposés |
| action/execute | preview_id + confirmed=true + clé UUID | `control_action_execute_v1` ; revalidation droits/état, verrous canoniques, exécution, relecture, audit ; aucune exécution par recommandation seule |

Types de dossier : request, mission, quote, artisan, client, claim, enterprise, site, worker, internal_assignment, pricing_offer, diagnostic_summary, remittance. Les opérations et la recherche ne sont pas des exports complets. Les relations/timelines supplémentaires sont signalées ; leur navigation exhaustive appartient au Bloc 3.

Manifest : `artisan.verify`, `claim.approve/reject`, `quote.approve/reject`, `mission.settle`, `finance.declare/confirm/cancel/correct`, `request.dispatch`, `request.classify`, `artisan.classify`, `enterprise.classify`. Pas de campagne, contact, WhatsApp, changement de prix par LLM, validation à la place du client, acceptation à la place de l’artisan, mutation tenant déléguée ou lecture sensible implicite.

Paramètres fermés : version pour revue devis ; prix final et prix attendu pour settlement ; montant/méthode/référence de preuve pour déclaration ; ID/version pour rapprochement ; artisan_id pour dispatch ; classification pour reclassement. La preuve brute n’entre pas dans l’audit, la synthèse ou le contexte RAFI. Le dossier Mission relie les reversements canoniques ; leur dossier expose montant/méthode/statut/version/dates et historique d’audit, sans référence de preuve brute. Le preview de rapprochement montre montant, méthode, statut, version et présence de preuve ; vérification documentaire par l’opérateur selon sa procédure Finance.

Erreurs contractuelles : AUTH_REQUIRED, FORBIDDEN, INVALID_PAYLOAD/FILTER/SEARCH, UNSUPPORTED_ENTITY/CAPABILITY, CONTROL_SCHEMA_NOT_READY, SOURCE_TIMEOUT, DEPENDENCY_UNAVAILABLE, PREVIEW_EXPIRED, STALE_PREVIEW, STALE_VERSION, IDEMPOTENCY_CONFLICT, HUMAN_CONFIRMATION_REQUIRED, ENTERPRISE_DELEGATION_REQUIRED, LEGACY_RECONCILIATION_REQUIRED. Un échec d’autorité confirmé est journalisé et retourné 409 ; rejouer le même ticket retourne son résultat, sans seconde mutation. Les erreurs de transport n’exposent ni SQL brut ni secrets.

Audit append-only privé : acteur, rôle DB, type/cible, autorité/capability, action, horodatage, résultat, correlation_id, idempotency_key et delta de champs allowlist. Les triggers capturent les transitions canoniques ; les commandes ajoutent leur résultat. Aucune suppression/update accordée aux rôles applicatifs. Les refus avant ticket/auth restent des refus techniques, sans créer de faux événement métier attribué à un inconnu. Pas de média, token, texte privé complet ou donnée Business dans les événements.

## 1.4 — Gates des autorités

| Gate | Constat / consommateurs | Préparation livrée | Tests / limite |
|---|---|---|---|
| A Claims | Vue owner postgres exposée ; claim-system/repository et Admin utilisent Claims | security_invoker, retrait anon ; insert propre pending uniquement ; Control délègue aux RPC Claims et à leurs locks | anon refusé, autre demandeur isolé, faux approved refusé, lien legacy approuvé, propriétaire incompatible refusé/audité ; aucun transfert historique |
| B Service Requests | Writes navigateur larges ; Client core, intake public/urgent/guest, Diagnostic et Enterprise | Retrait INSERT/UPDATE/DELETE table **et colonnes** ; création Client bornée/idempotente ; producers serveur et RPC existants conservés | Création/retry/conflit, accès direct même Admin refusé ; producer service_role synthétique reste fonctionnel |
| C Missions | Écriture directe ; devis créant validated ; claim/start/complete/confirm | Plus d’écriture libre ; devis crée pending ; dates nouvelles ; garde du gagnant inter-univers | Cycle complet, acceptation concurrente unique, externe/interne concurrent, ancienne validation signalée |
| D Quotes | Soumission visible client sans revue ; insert libre ; core et cockpit | Revue serveur/version ; SELECT client après présentation ; accepter/rejeter préconditions ; historique accepté conservé | Soumission cachée, refus non-admin, prix/scope inchangés par revue, stale, expiration, replay, pas de notification client précoce |
| E Finance | Prix final assimilé payé ; PATCH concurrent ; payments non typés | Settlement atomique dans autorité ; registre reversement et versions ; preuve, correction, annulation, audit ; endpoints historiques délèguent au Control | VAP préservé (60 MAD sur cas 260), mauvais prix refusé, pas de payé implicite, rapprochements concurrents plafonnés |
| F Enterprise | Supervision partielle ; guards tenant spécifiques | Projection minimale, tenant/site vérifiés, SLA commun ; dispatch Admin ERC refusé, pas de délégation sensible ajoutée | Pas de membership créé, autre tenant/site refusé, worker sans PII ; RPC de mutation tenant inchangées |
| G Diagnostic | Pas de supervision Admin minimale ; lecture API pouvant être active | Projection pure métadonnées liée à SR | Aucun input/photo/téléphone ; non-admin refusé ; sessions non liées non exposées |
| H Multiactivité | Champs principaux incomplets ; photo update direct sans grant | Projection villes/métiers secondaires ; submission respecte listes canoniques ; photo via RPC propriétaire ciblée | Pas de grant UPDATE artisan général ; matching reste Dispatch, pas nouveau moteur de capacité |
| I verified | verified / is_verified divergents | verified canonique ; trigger des nouvelles écritures et vérification explicite aligne le legacy | Divergences historiques signalées ; aucun backfill ; direct artisan is_verified refusé |
| J classification | Aucune distinction fiable test/internal/prod | Champ nullable historique, défaut production futur, commande explicite réversible et audit | Anciennes lignes NULL, création future explicite, reclassification/restitution NULL ; aucune heuristique |

Les anciennes routes **en mémoire** du serveur Express `/api/admin/orders` et `/api/admin/artisans...` sont retirées (410) ; les fonctions Vercel Admin canoniques gardent leurs routes dédiées. Les trois endpoints actifs verify/assign/settle ne possèdent plus de mutations parallèles : ticket/confirmation obligatoires. Les anciens appels de navigateur sans preview reçoivent 428. Les modules legacy archivés ne sont pas réactivés.

Les RPC Claims existantes restent des autorités Admin canoniques avec leur guard de rôle ; leur interface historique n’est pas transformée en RPC générique. Le shell Control utilise systématiquement preview/confirmation. Les fonctions Finance/Trust/revue nouvelles ne sont pas directement exécutables par authenticated, anon ou service_role : seule la commande typée les appelle après revue.

## Fichiers, certification et frontières

- Migrations : les quatre `supabase/migrations/202609282127*_control_os_b1_*.sql`, dans l’ordre numérique ; **non appliquées en Production**.
- Baseline : `baseline-fingerprints.json`, `01-preflight-readonly.sql` et fixture catalogue sans données de production.
- Postflight : `02-postflight-readonly.sql`. Rollback opérationnel : `03-rollback-pause-actions.sql`. Reprise contrôlée : `04-resume-actions-after-review.sql`.
- Tests : `tests/control-contract` (PostgreSQL embarqué, API, PostgreSQL natif multi-connexions en CI). Auth simulée dans la fixture, RLS/ACL/fonctions/contraintes/index réels reconstruits. Ce n’est pas un test Supabase Auth/Storage réel.
- Build Diagnostic : `node api/diagnostic/verify-build.cjs`. Tests UI/Preview et résultats exacts dans le rapport candidat final.

Aucune mutation Production, aucun merge main, aucun déploiement Production. Les migrations préparées ne constituent pas leur autorisation d’application. Une Preview READY de Vercel ne prouve pas à elle seule une recette métier authentifiée.
