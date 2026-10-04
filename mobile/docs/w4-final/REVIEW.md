# W4 FINAL — certification staging réelle

Certification fonctionnelle A–H : **PASS** après corrections Mobile. Le verdict final et les six contrôles CI du SHA publié sont consignés dans la PR Draft #147. Reprise autorisée depuis `3e9724819ef5d15053436a516064a29fa96d6356`, le 4 octobre 2026. Le précédent STOP d’autorisation est levé par le GO explicite limité ; les preuves précédentes restent historiques.

## A. Périmètre et autorité

PR #147 ouverte, Draft et non mergée ; branche `feat/fixeo-mobile-w4-client-os-wow`. Projet vérifié par le connecteur : **fixeo-diagnostic-staging**, `kqyhusnbybsukbcaoqtu`, ACTIVE_HEALTHY. Proxy partagé v8 ACTIVE, verify_jwt=true. Seulement les trois identités synthétiques W4.1, avec de nouvelles sessions Auth. Aucun JWT archivé utilisé. Aucun changement backend, migration, Vault, environnement serveur, MAIN ou Production.

## B. Défauts révélés par les vrais appels

Trois corrections Mobile nécessaires :

1. La ville d’affichage `Rabat` était envoyée à l’Estimator à la place de `rabat`. Le slug est maintenant dérivé de la ville du catalogue, accents et espaces normalisés ; la ville du Diagnostic reste vérifiée avant la conversion.
2. `METIER_SELECTION` affichait une instruction sans choix actionnable. Le Client choisit maintenant parmi les métiers renvoyés par le serveur, puis parmi ses services. Ce choix explicite est transmis comme hint canonique ; aucun nouveau classificateur ni moteur de prix.
3. Un véritable `SAFETY_STOP` sans service (`service_code:null`) était rejeté par le validateur. Ce résultat est désormais accepté comme STOP bloquant. Un résultat tarifé sans service reste refusé. Un contrat de régression couvre cette distinction.

Les tentatives initiales et leurs 422/écrans d’erreur sont conservées dans `staging/runtime.json` ; elles ne sont pas présentées comme réussies. Les parcours `*-final` utilisent les corrections. L’empreinte des sources finales et des captures est dans `staging-source-manifest.json`.

## C. Home et méthode de capture

Les PNG `staging/screens/` proviennent du **Client OS intégré**, Home et espace Client réels, compilés avec React Native Web. Auth, profil, RPC, RAFI, Diagnostic, Estimator, demandes, suivi, mission et evidence utilisent les vrais modules de l’application. Aucune réponse métier simulée ni alias de service fixture.

Adaptations de plateforme explicites : caméra/microphone reçoivent des fichiers synthétiques ; SecureStore utilise une mémoire éphémère ; le routeur rend les vraies pages ; le transport Playwright transmet avec Node les mêmes URL/JWT/corps aux services staging, sans l’Origin ajouté par un navigateur. Le refus serveur d’un Origin arbitraire a été vérifié séparément (403). Le backend garde son contrat natif. Le texte à 200 % est une émulation de taille de police dans le rendu réel à 320 px. Ces preuves ne certifient pas un appareil, ses permissions matérielles ou Dynamic Type natif ; aucun build physique lancé.

## D. Matrice E2E A–H

| Parcours | Résultat réel | Preuve |
| --- | --- | --- |
| A. Besoin simple → ville → confirmation → Request → matching | PASS ; zéro appel Diagnostic/Estimator, double clic = une RPC | `runtime.json`, `simple-request-matching.png` |
| B. Voice → besoin → suite Client | PASS ; transcription fournisseur non vide, besoin affiché et éditable, ville renseignée dans le Client | `roles.json`, `voice-client-continuation.png` |
| C. Photo éphémère → RAFI | PASS ; `persisted=false`, aucune référence, aucun média conservé imposé | `runtime.json`, `photo-ephemeral.png` |
| D. Photo persistante → Diagnostic → référence signée → suite | PASS ; consentement explicite, original non conservé, image nettoyée, référence reçue et utilisée par le serveur | `runtime.json`, `storage-proof.json`, `diagnostic-persistent-final.png` |
| E. Estimator sans Diagnostic → outcome → confirmation → Request | PASS ; métier/service choisis, `PRICE_READY` 200 MAD serveur, une confirmation malgré double clic | `runtime.json`, `estimator-price.png`, `estimator-confirmation.png` |
| F. Diagnostic + Estimator → Request | PASS ; sélection canonique, `QUOTE_REQUIRED`, `confirm_quote`, demande créée puis matching | `runtime.json`, `diagnostic-estimator-request-matching.png` |
| G. QUOTE_REQUIRED | PASS ; aucun élément montant, aucun prix fictif | `runtime.json`, `quote-required.png` |
| H. Safety STOP | PASS ; aucun prix/handoff, intake et intelligence retirés, aucune levée locale ; evaluate/select_service/confirm_quote refusés côté serveur | `runtime.json`, `shared-functional.json`, `safety-stop-320.png` |

Le matching certifié est la demande canonique en recherche et sa reprise dans l’espace Client. Aucun artisan n’a été affecté artificiellement ; aucune mission physique ou intervention achevée n’est revendiquée. La capture « mission / demande active » représente la demande active réelle.

## E. Auth et propriété

| Route / identité | Résultat |
| --- | --- |
| Voice Client / Artisan | 200 / 200 |
| Voice anonyme / JWT invalide / session révoquée | 401 / 401 / 401 |
| Photo éphémère Client / Artisan | 200 / 200, non persistante selon contrat partagé |
| Diagnostic persistant Client / Artisan | 200 / 403 |
| Estimator Client / Artisan | 200 / 403 |
| Request handoff Client owner / autre Client / Artisan | 200 / 403 / 403 |
| Direct Client Request | 200 |
| Diagnostic et Storage autre Client | refusés |

`staging/roles.json`, `shared-functional.json` et `storage-proof.json` contiennent les statuts et mesures. Hash SHA-256 des trois images nettoyées comparé aux données serveur ; propriété et provenance vérifiées. Les faits déclarés n’ont pas été promus artificiellement en `user_confirmed`.

## F. Négatifs W4.1

Contexte/session/prix altérés, expirés, autre owner, autre ville/service, injection de montant, payload conflictuel, double tap et retry identique : testés réellement avant confirmation ou sur la même demande. STOP : trois actions interdites refusées 409. Méthode, route inconnue, payload trop grand, JSON invalide, faux bypass client et attestations altérées/expirées/autre owner : refusés (`shared-negatives.json`).

Le rejeu historique `shared-proxy-live.cjs` a rencontré **429 DIAGNOSTIC_QUOTA_EXCEEDED** sur le premier Client après ses contrôles Estimator/direct. Ce résultat n’a pas été effacé ni requalifié en PASS. Aucun quota réinitialisé ou contourné. Le volet Diagnostic A–H a été exécuté avec l’autre Client W4.1 autorisé, dans le vrai runtime ; les vérifications Storage complètent cette preuve. Les 194 contrats serveur W4.1/Diagnostic/Estimator sont tous repassés localement.

## G. Confirmation et idempotence

Demande directe via le wrapper existant à quatre arguments ; estimation tarifée via `confirm_request` ; devis adossé au Diagnostic via `confirm_quote`. Les identifiants `id` ou `request_id` sont acceptés selon le contrat canonique. Les contextes opaques restent en mémoire et ne sont jamais affichés. Reprise manuelle identique après réponse incertaine couverte par les tests locaux ; double tap et retry owner vérifiés en staging.

## H. Matching et espace Client

Trois demandes intégrées créées pour le second Client : simple `39c65283-8bf2-4bab-8fa5-e7901076704e`, estimation `7669bf15-3e97-4333-8d74-6b9d6930bf12`, Diagnostic/devis `22b478d2-0c1a-4052-bd6b-e7710643dcbf`. La navigation « Mon espace » retrouve les trois interventions et la demande active, sans faux état d’artisan trouvé.

## I. Safety

Un STOP serveur ne retourne pas dans l’édition commerciale. Le Client présente le message prudent de sécurité et un retour à son espace. Aucun moteur Safety local ni questionnaire préventif ajouté. Les trois refus serveur sur la session STOP et le retrait des contrôles UI sont consignés. Le validateur reste strict sur les résultats tarifés.

## J. Captures livrées

18 captures : Home idle, composer, ville, ville 320 px, Voice, photo éphémère, Diagnostic persistant, Estimator, Estimator 320 px, confirmation, QUOTE_REQUIRED, matching simple, matching Diagnostic/Estimator, espace Client avec demande active, STOP 390/320 px, grand texte 200 % à 320 px (deux positions). Inspection visuelle effectuée ; pas de débordement horizontal constaté. Le contenu long reste déroulant.

## K. Non-régression

**93/93 contrats Mobile, 194/194 tests serveur, zéro skip.** Typecheck PASS ; Expo Doctor 1.20.4 **18/18** ; Gate A export web PASS. W2 : 8 scénarios + compatibilité/grand texte ; W3 : 12 groupes ; W4 : 41 groupes ; intégration : 9 groupes locaux. Auth, mission/evidence, protections des sources W1/W2/W3/Artisan et callbacks canoniques sont inclus dans les contrats. Les tests UI locaux restent explicitement distingués des vrais E2E staging.

## L. Gate et sessions

- Gate initial : false.
- Ouverture autorisée : **2026-10-04 23:11:54.326520 UTC**.
- Tests réels via l’unique proxy staging ; fermeture : **23:19:38.940001 UTC**.
- Trois sessions Auth nouvelles pour la matrice ; Artisan révoqué dans le test de révocation puis deux Clients révoqués.
- Une quatrième session du second Client, ouverte à 23:20:34 pour la seule capture agrandie et les lectures de suivi, gate fermé ; révoquée à **23:21:29.479 UTC**.
- Vérification SQL finale **23:21:56.575637 UTC** : gate=false, **0 session Auth synthétique**, **0 lease validation/run/purge actif**, **0 trigger de faute**.

Identifiants et horodatages non secrets dans `staging/auth-lifecycle.json`, `capture-auth-lifecycle.json`, `staging-closure.json`. Aucun password/access token/refresh token publié.

## M. Fixtures conservées

**5 Requests**, **4 sessions Diagnostic** (3 images nettoyées prêtes ; 1 draft créé avant le refus de quota), **3 objets Storage**. Les deux diagnostics d’exploration restent conservés, le dernier est lié à la demande de devis. Toutes les nouvelles données sont listées par ID, owner, état, date et path dans `staging-closure.json`. Les sessions Estimator sont des contextes signés opaques ; les actions et résultats sont comptés dans les journaux sans publier ces contextes. Aucune donnée historique supprimée, aucune purge.

## N. Publication et CI

Les sources testées sont empreintées dans `staging-source-manifest.json`. L’export Gate A final est contrôlé séparément du bundle de rendu RN Web. Le SHA final publié et les six résultats (Mobile Intelligence Contracts, Mobile Gate A, Supply Engine, Client OS C4, Control certification, Vercel Preview) sont inscrits dans la PR après leur achèvement. Aucun contrôle précédent n’est substitué au SHA final.

## O. Scope Git

Correctifs et preuves Mobile uniquement depuis le candidat autorisé. Aucune dépendance de production ajoutée ; aucune modification du proxy, du backend, des règles financières, du dispatch, des schémas ou de l’Artisan OS. PR #147 reste Draft et non mergée. La tentative de push Git sans identifiants a échoué sans mutation ; publication par le connecteur GitHub.

## P. Limite de release

`W8_RELEASE_BLOCKER = PHYSICAL_DIAGNOSTIC_MEDIA_PURGE_CERTIFICATION` reste **OPEN**. La certification W4 est fonctionnelle et visuelle sur staging. Elle n’autorise aucun MAIN, merge, Production, build physique, Store upload, purge ou W5. Le verdict final est porté dans la PR, puis arrêt.
