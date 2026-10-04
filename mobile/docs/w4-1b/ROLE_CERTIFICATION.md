# W4.1B — certification du contrat par route

Reprise autorisée depuis `53989181a9afcfc14f5cb18dd8466447dcadb209`, PR #148 Draft vers W4 `31df5b08cfb62a4e8841bbb18055826bf87ef62a`. Le runtime, les trois migrations, les règles métier et la source candidate Edge restent inchangés. Ce candidat ajoute des contrats, leurs preuves et la couverture CI des fichiers Voice/proxy.

## Correction du contrat et historique

Le précédent arrêt v6 → v7 a bien exécuté le rollback demandé. Son interprétation « Artisan refusé sur Voice » a été explicitement corrigée par le propriétaire : Voice est partagée Client/Artisan. Il ne s'agissait pas d'une fuite d'autorité Client. Voir [ROUTE_AUTHORITY.md](ROUTE_AUTHORITY.md). Aucun garde Client artificiel n'a été ajouté à Voice ni au proxy.

## Preflight, bascule et rollback

- Projet canonique vérifié : `fixeo-diagnostic-staging`, `kqyhusnbybsukbcaoqtu`.
- PR Draft, head exact, dépôt propre au départ, aucune autre exécution de test observée ; gate SQL false et zéro session fixture au départ.
- Les empreintes visibles correspondent à l'origine corrigée et au bypass inchangé. L'origine est l'alias HTTPS de la branche W4.1, rattaché au Preview READY exact du SHA de départ. Aucune valeur publiée.
- Les trois routes franchissent Deployment Protection avec le bypass existant validé. Sans bypass ou avec un mauvais bypass : refus de protection. Deployment Protection reste active.
- Baseline v7 ACTIVE, `verify_jwt=true`, comparée octet pour octet à la v2 archivée avant bascule.
- Seul `mobile-rafi-preview-proxy` redéployé, **v8 ACTIVE**, `verify_jwt=true`, source candidate relue et identique. Bundle : `1f30a53215a0303d7ebb5d966de8b2f70cea3a8e8e154aa75d1111425d89ee57`.
- Routes strictes : Photo, Voice, Estimator. Aucun retry automatique de mutation.

Rollback en une opération : appliquer le payload privé `rollback-proxy-v2.json` par `supabase_deploy_edge_function`, même projet, même fonction, `verify_jwt=true`. Source v2 SHA256 : `3c507895202e112bb4ad134f44849b89e9ee322f308a2c3e9394b017a03c6070`. La version numérique augmente ; le contenu v2 est exact. Aucune DB modifiée par ce rollback. L'ancien upstream embarqué n'est pas recertifié. Le payload privé contient l'ancienne configuration et reste hors Git.

## Configuration finale, sans valeurs

| Paramètre | Source / usage | Scope et action |
| --- | --- | --- |
| `FIXEO_MOBILE_PREVIEW_ORIGIN` | Alias Preview W4.1 vérifié contre le déploiement READY et son SHA | Secret serveur du projet staging, consommé uniquement par le proxy ; réutilisé sans écriture |
| `FIXEO_MOBILE_PREVIEW_BYPASS` | Automation Bypass « W4.1 Supabase staging proxy » déjà validé | Même scope ; inchangé |

Les secrets Edge sont techniquement au niveau du projet Supabase. Aucune autre fonction n'est modifiée ni autorisée à les consommer par ce chantier. Aucun service_role, secret provider ou secret Estimator ajouté au proxy. Aucun secret Git/Mobile/public. Aucune variable Vercel modifiée lors de cette correction.

## Résultats réels

Preuves : [shared-path-role-certification.json](shared-path-role-certification.json), [role-preview-preflight.json](role-preview-preflight.json).

| Parcours / contrôle | Résultat |
| --- | --- |
| Voice Client et Artisan, média synthétique | HTTP 200, transcription non vide pour les deux |
| Voice anonyme, JWT invalide, session révoquée | HTTP 401 |
| Photo éphémère Client et Artisan | HTTP 200, aucune persistance ni référence ; STOP réel conservé |
| Photo persistante Artisan | HTTP 403 `ROLE_FORBIDDEN` |
| Diagnostic persistant Client | Résultat canonique, référence signée, Storage privé, ownership et hash serveur vérifiés |
| Provenance | Données déclarées et inférées conservées ; aucune promotion artificielle en `user_confirmed`. L'image synthétique ne force pas une observation visuelle inventée |
| Référence Diagnostic valide / autre Client / altérée / expirée | 200 / 403 / 400 / 410 |
| Diagnostic → qualification → devis → Request | PASS, Request attachée au Client |
| Diagnostic vrai STOP | STOP conservé, aucune référence permettant le handoff |
| Estimator sans Diagnostic | Start, answer, select_service, evaluate ; PRICE_READY et QUOTE_REQUIRED canoniques |
| Tarif diagnostic / pièce après une clarification | QUOTE_REQUIRED : les entrées testées demandent davantage de qualification. Aucun DIAGNOSTIC_READY ou LABOUR_PLUS_PART_READY fabriqué ; variantes non applicables à ces entrées sous la limite W4 |
| Estimator et handoff Artisan / autre Client | Refus 403 |
| Pricing expiré / altéré / ville-service mismatch / injection prix | Refus 410 / 400 / 409 / 400 |
| Double tap, retry, réévaluation | Une seule Request ; même identité retournée |
| Payload modifié pour la même confirmation | 409 `MOBILE_IDEMPOTENCY_CONFLICT` |
| Demande simple directe sans Diagnostic/Estimator/pricing | RPC canonique opérationnelle, retry identique ; Artisan 403 |
| Safety by Exception | Zéro questionnaire Safety normal, une clarification métier maximum ; vrai STOP refuse evaluate/select_service/confirm_quote |
| Méthode, route, taille, origine fournie par l'appelant | 405 / 404 / 413 / 403 |
| JSON malformé | Échec fermé 503, code stable, aucun détail interne |
| Bypass fourni par le Client | Ignoré ; seule la configuration serveur est utilisée |
| Attestation altérée, expirée, cross-user | Refus par les RPC canoniques avec vrais JWT |
| Lecture Diagnostic attestée répétée | Revalidation courante, sans reçu de mutation ni cache d'autorité |
| Storage lu par un autre Client | Refus |

Le trajet Photo/Voice/Estimator et les handoffs passent par l'URL Edge partagée. La demande directe suit volontairement la RPC Supabase existante ; elle ne dépend pas du proxy ni des moteurs. Les contrôles d'attestation SQL passent directement par les RPC avec JWT Client dans le harnais serveur ; les secrets de signature ne sont jamais envoyés au Mobile.

Les attentes du harnais ont été corrigées pour respecter les réponses canoniques : `READY` n'est pas une question ; `select_service` précède `evaluate` ; une lecture attestée n'a pas la sémantique d'une mutation ; un refus JSON propre 503 n'est pas une réponse upstream non JSON. Ces ajustements n'ont changé aucun runtime. La phase négative corrigée et le complément passent.

## Atomicité, pannes et limites des preuves

[role-atomicity.json](role-atomicity.json) : test SQL staging existant rejoué, erreur injectée après rattachement du Client. Request, redemption et reçu annulés. Transaction extérieure ROLLBACK, trigger temporaire absent ensuite. Pas de migration persistante.

Les timeouts upstream, réponses upstream non JSON et limites de sortie ont été injectés dans **l'exécution isolée de la source Edge exacte**, via `proxy.test.cjs`. Ils n'ont pas été provoqués sur le staging partagé. Le mauvais bypass serveur a été testé directement contre le Preview protégé ; la configuration Edge commune n'a pas été altérée pour injecter cette panne. Ces preuves ne sont pas présentées comme des pannes observées en production ou sur le trajet partagé.

63 appels mesurés dans les phases documentées, incluant les refus attendus et les RPC : médiane 856 ms, p95 6 987 ms, maximum 7 565 ms ; plus grande réponse 7 136 octets. Échantillon de certification, pas un SLA. Aucun timeout involontaire ni double mutation observé. Les métriques ne sont pas un temps ajouté par le proxy seul : elles incluent l'upstream.

## Non-régression et livraison

194/194 tests serveur et 85/85 contrats Mobile verts. Logs : `server-role-regression.log`, `mobile-role-regression.log`. Couverture W2 Shell, W3 RAFI, W4 Client, Diagnostic, Estimator, direct request, mission/evidence et auth. Aucun build physique.

Les six contrôles obligatoires sur le nouveau SHA — Mobile Intelligence Contracts, Mobile Gate A, Supply Engine, Client OS C4, Control certification et Vercel — sont vérifiés après publication et consignés dans la PR #148. La nouvelle version ne modifie aucun runtime ; son Preview et le rattachement de l'alias sont revérifiés avant verdict.

Le gate SQL est refermé après chaque phase de certification. État attendu pour review : proxy candidat v8 installé, secrets existants conservés, gate false, sessions de test fermées. L'intégration W4 devra ouvrir explicitement le gate dans son propre mandat ; ce rapport ne l'active pas silencieusement. Les trois migrations W4.1 restent inchangées : `20261004181121`, `20261004183523`, `20261004184025`.

Trois Requests synthétiques et deux Diagnostics synthétiques ont été créés dans cette reprise (un prêt/devis, un STOP). Aucun média réel traité, aucune purge, aucune rétention modifiée. Les fixtures et leurs objets restent identifiés pour W8.

`W8_RELEASE_BLOCKER = PHYSICAL_DIAGNOSTIC_MEDIA_PURGE_CERTIFICATION` reste OPEN avant Production, Store release et Release Candidate finale. Aucune autorité de maintenance, aucun service_role ni scheduler introduits.

Zéro mutation Production. Aucun merge, MAIN, PR #147, W4, W5 ou build physique. PR #148 reste Draft.
