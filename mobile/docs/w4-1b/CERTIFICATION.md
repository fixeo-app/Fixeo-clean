# STOP — W4.1 SHARED PROXY NOT CERTIFIED

W4.1B, 4 octobre 2026. La purge physique ne bloque plus le PASS fonctionnel W4.1. Elle devient le [gate obligatoire W8 Release](../w4-1/DEFERRED_TO_W8.md), encore OPEN. Aucune purge n'est lancée.

## Checkpoint

PR #148 vérifiée Draft et non mergée. Head de départ exact : `841fc80feb05051084166cf75c75abe0cd5bd9db`, branche `feat/fixeo-mobile-w4-1-intelligence-gateway`, base W4 `31df5b08cfb62a4e8841bbb18055826bf87ef62a`. Dépôt propre avant les présents documents. Aucun code runtime ni migration modifiés.

Le staging demeure `fixeo-diagnostic-staging` / `kqyhusnbybsukbcaoqtu`. Gate SQL false, zéro session Auth sur les trois fixtures, zéro Diagnostic en cours. Le proxy partagé est toujours v2 ACTIVE, verify_jwt=true ; les autres fonctions ne sont pas modifiées.

## Preflight du Preview et du bypass

Déploiement du checkpoint : `dpl_D4QLVH73Ga1DA1vcHc8dN6noDnku`, READY, Preview, branche et SHA exacts. HTTPS, domaine Vercel attendu et chemin racine vérifiés. La valeur d'origin n'est pas ajoutée à ce dossier.

Les routes photo, voice et Estimator sont disponibles : un GET via l'accès authentifié du connecteur Vercel atteint chacun des handlers et retourne le JSON applicatif 405 `METHOD_NOT_ALLOWED`. Cette vérification établit la présence des routes, pas le succès des opérations Mobile.

Le bypass proposé a été lu exclusivement depuis l'entrée Vercel existante `6PX0ENsCuVuyQbXW`, clé `VERCEL_AUTOMATION_BYPASS_SECRET`, target Preview uniquement. Aucune modification, rotation ni récupération d'une clé Production. La valeur a été conservée uniquement dans la préparation serveur privée ; elle n'est pas affichée.

**Échec de qualification du bypass :** envoyé en `x-vercel-protection-bypass`, exactement comme le candidat Edge, il produit HTTP 401 `Protected deployment` sur les trois routes. La réponse vient de la protection Vercel et non de l'authentification applicative `AUTH_REQUIRED`. Les contrôles sans bypass et avec un faux bypass produisent également le refus de protection. Les corps, headers et valeurs sensibles ne sont pas publiés. Voir `preflight.json`.

L'accès temporaire utilisé par le connecteur Vercel pour inspecter les handlers n'est pas assimilé au bypass serveur de l'Edge Function. Il ne constitue pas une solution de configuration pérenne, et aucune valeur temporaire n'est injectée dans le proxy.

| Paramètre Edge autorisé | Source identifiée | Scope | Existe sur Edge ? | Qualification / action |
| --- | --- | --- | --- | --- |
| `FIXEO_MOBILE_PREVIEW_ORIGIN` | URL système du Preview READY associé à la branche et au SHA vérifiés | Seul projet staging, consommation par `mobile-rafi-preview-proxy` | Non vérifié | Origin identifiée ; aucune écriture |
| `FIXEO_MOBILE_PREVIEW_BYPASS` | Bypass Preview Vercel existant, entrée identifiée ci-dessus | Seul projet staging, serveur uniquement | Non vérifié | Échec du contrôle HTTP ; ne pas provisionner cette valeur sans preuve valide |

Toutes les valeurs sont masquées. Les secrets Edge sont techniquement partagés au niveau du projet Supabase ; ils ne sont pas isolés par branche ou par fonction. Ne pas élargir leur consommation à d'autres fonctions.

L'inventaire Edge reste inaccessible : le connecteur Supabase disponible ne fournit pas les opérations secrets ; la commande officielle `supabase@2.119.0 secrets list --project-ref kqyhusnbybsukbcaoqtu --output json` échoue pour authentification CLI absente. Aucune absence des variables n'est déduite de cet échec.

L'autorisation de configuration W4.1B a été reçue. Le blocage porte sur la preuve du bypass et sur l'accès technique, pas sur le renouvellement de ce GO. Le fallback Dashboard n'a pas été ouvert : l'outil Browser impose un accord préalable quand le connecteur est insuffisant. Un accès CLI/API authentifié aux secrets constitue l'autre voie. Ne pas envoyer de secrets dans le chat.

## Baseline et rollback

La source v2 a été relue et comparée byte pour byte à la baseline W4.1A :

- Function ID `595f13c1-119b-4a2b-9b69-bcfe12c16ca3` ; version 2 ; verify_jwt=true.
- Bundle SHA256 : `8f8f32ac1a9a8b2ffb912a9d5861d7cd64ea1bc29e591df4bf7185616b9c70dd`.
- SHA256 source : `3c507895202e112bb4ad134f44849b89e9ee322f308a2c3e9394b017a03c6070`.
- Routes actuelles : photo et transcribe ; ancienne origin et share token embarqués, conservés seulement en copie privée 0600. Aucune valeur ajoutée à Git.

Le payload privé `rollback-proxy-v2.json` restaure cette source et sa configuration embarquée par un appel `supabase_deploy_edge_function`, même nom, même projet, verify_jwt=true, sans DB. Le numéro de version serait incrémenté par Supabase ; le contenu restauré serait exactement celui de v2. Rollback prêt, non exécuté, validité de l'ancien upstream non recertifiée.

## Bascule et tests du vrai trajet

**Aucune bascule.** La condition « origin et bypass exacts prouvés » n'est pas remplie. Le candidat source existant n'est ni modifié ni déployé ; aucune fonction parallèle n'est créée. Aucun secret Edge écrit.

| Groupe demandé | Résultat W4.1B |
| --- | --- |
| Auth réelle par proxy W4.1 : anon, JWT invalide, rôle, Client, cross-user | Non exécuté : proxy non basculé |
| Photo persistante, provenance, référence, hash, ownership, STOP | Non exécuté par proxy W4.1 |
| Voice réelle | Non exécutée par proxy W4.1 ; handler Preview présent |
| Estimator start/qualification, QUOTE_REQUIRED, tarifable, optionalité | Non exécuté par proxy W4.1 ; contrats locaux verts |
| Handoff, city/service, expiration/altération, idempotence, double tap, rollback | Non exécuté par proxy W4.1 ; contrats locaux verts |
| Demande simple sans Diagnostic/Estimator/pricing context | Contrats locaux verts ; parcours inchangé |
| Payload, route/méthode, non-JSON/timeout upstream, mauvais bypass | Matrice du proxy non exécutée ; seuls les contrôles du bypass Preview ci-dessus sont des mesures distantes nouvelles |

Les latences et tailles de `preflight.json` concernent uniquement des refus directs du Preview depuis l'environnement d'exécution. Elles ne sont pas des mesures de performance du shared proxy ni de l'Intelligence Gateway. Aucun retry automatique de mutation ajouté ; aucune mutation métier tentée.

## Non-régression et CI

Rejoués : 191/191 tests serveur et 85/85 contrats Mobile, couvrant W2 Shell, W3 RAFI, W4 Client, Diagnostic, voice, Estimator, direct request, mission/evidence et auth. Logs dans ce dossier. Aucun build Mobile lancé.

La publication est documentaire uniquement, sur la branche existante. Le nouveau SHA, les cinq workflows obligatoires et le statut Vercel sont vérifiés puis consignés dans la PR #148 et le compte rendu final. La CI verte ne remplace pas le trajet partagé absent.

## État final et suite nécessaire

Proxy v2 maintenu, gate SQL fermé, aucun test Auth actif créé, aucune purge, aucune migration, aucun scheduler, aucun secret Edge modifié. Aucun service_role utilisé. PR #148 reste Draft vers W4, sans merge ; #147, MAIN, Production, W4 et W5 non modifiés.

Pour reprendre la certification, il faut prouver un bypass autorisé et fonctionnel avec le mécanisme du candidat, puis accéder aux secrets Edge staging par une voie authentifiée. Ne pas renouveler ou modifier silencieusement le bypass global Vercel. Une fois ces conditions remplies, seulement alors configurer les deux paramètres, basculer l'unique proxy et exécuter toute la matrice avec les vrais JWT staging.

`W8_RELEASE_BLOCKER = PHYSICAL_DIAGNOSTIC_MEDIA_PURGE_CERTIFICATION` reste OPEN avant toute release ; il n'est plus le motif du STOP fonctionnel W4.1B.

**Zéro mutation Production. Arrêt avant déploiement du proxy.**
