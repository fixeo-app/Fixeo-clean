# MOBILE VS WEB CAPABILITY MATRIX

Audit du code au SHA de base `5d772c463d7b3fe2511553cc3aab48de228f8551` et des contrats consommés par Mobile. « Web current » signifie présent/codé dans ce dépôt ; ce document ne certifie pas l’activation de chaque chemin sur fixeo.ma en production. Aucun cutover effectué. Lecture du proxy staging déployé effectuée ; aucune écriture distante de configuration ou de données métier.

A = CANONICAL, réutiliser le contrat. B = LEGACY/HARDCODED, ne pas recopier. C = WEB-ONLY, pertinence à évaluer. D = OBSOLETE, ne pas reprendre. Une capacité peut contenir plusieurs couches de classes différentes.

| Capability | Web current | Canonical authority | Mobile W4 | Status | Remaining gap |
|---|---|---|---|---|---|
| Ville et autofill | `js/fx-request-flow-v4.js`, contexte de ville de session ; `js/main.js::mapGeolocate`, caches DOM/localStorage dans `fixeo-ai-request-engine.js` | `js/fixeo-cities.js`, contrôles serveur de ville | Catalogue généré depuis la source réelle ; position ponctuelle foreground → reverse geocode natif → city modifiable ; manuel/web fonctionnels | A données / C géolocalisation web remplacée | Certification permissions/GPS sur appareils ultérieure ; coordonnées non conservées |
| Compréhension du besoin | `fx-request-flow-v4.js` et heuristiques catégorie/urgence de `fixeo-ai-request-engine.js` | Contrats diagnostic et qualification Estimator | Texte et transcription via `understandLocally`, description confirmable | B heuristiques, A moteurs | Le routage intelligent standardisé reste dépendant du gateway Estimator ; aucune urgence/prix local inventé |
| Caméra / photo privée | Diagnostic web `js/fixeo-diagnostic-v1.js` + modal | `api/mobile-rafi-photo-fn/index.js`, moteur diagnostic commun | Capture W3 inchangée, résultat guidé avec provenance, hypothèses séparées | A réutilisé | Photo mobile éphémère, pas de dossier diagnostic signé |
| Voix | Web `/api/rafi-transcribe` | Mobile `/api/mobile-rafi-transcribe` avec bearer, quota | Micro W3, transcription puis correction/envoi | A réutilisé | Aucun nouveau moteur de compréhension vocale |
| Diagnostic / sécurité | Dossier web persistant, questions et signaux ; `api/diagnostic` | Résultat validé, safety, selected run/revision | OBSERVÉ/DÉCLARÉ/HYPOTHÈSE/CONFIRMÉ ; aucun questionnaire sécurité ; au plus une clarification métier optionnelle ; seul safety.stop bloque send | A partiel | Réponses dans description confirmée, pas de réanalyse structurée du dossier serveur mobile (GAP-02) |
| Decision / CTA | Contexte web et helpers d’écran ; console admin distincte | RPC `get_my_mobile_decision_context_v1` ; `getClientContextualCockpit` existant | Priorité validation/intervention/affectation/recherche, titres et CTA intégrés au canvas ; sécurité intake prioritaire | A workflow / B heuristiques non copiées | Orchestration complète du choix diagnostic/prix/devis indisponible (GAP-01) |
| Estimator canonique | `js/fixeo-estimator-api-v1.js`, `fixeo-estimator-v2.js` | POST `/api/estimator-v1` | Rendu de contrat préparé et testé hors Home ; aucun appel réseau Estimator activé | A, STOP ciblé | GAP-01 : proxy mobile sûr absent |
| PRICE_READY / DIAGNOSTIC_READY | Montants et périmètre normalisés du serveur | `normalizeOutcomeView`, orchestrateur canonique | Fixtures calculées par serveur existant hors bundle ; rendu des valeurs exactes | A présentation vérifiée | Non disponible à un client mobile réel tant que GAP-01 n’est pas résolu |
| Main-d’œuvre + pièce | LABOUR_PLUS_PART_READY | `price.labour_amount_mad`, `variable_part_separate`, exclusions | Main-d’œuvre et pièce/matériel séparés, aucun total recomposé | A présentation vérifiée | Gateway absent |
| Option | ADD_ON_READY dans mapper public | Mapper canonique, prestation principale requise | Fixture de schéma sans montant ; aucun faux prix | A contrat, disponibilité non établie | Le scénario historique préparation peinture retourne désormais QUOTE_REQUIRED ; aucun service add-on éligible certifié par cet audit |
| Devis / route / informations | QUOTE_REQUIRED, ROUTE_REQUIRED, REQUALIFY/questions | Normalizer, question planner, routes explicitement autorisées | Présentations de contrat sans fausse erreur ni montant ; explication réelle de route | A présentation vérifiée | Pas de demande de devis depuis un prix local ; GAP-01/03 |
| Prix indicatifs historiques | `fixeo-ai-request-engine.js::getPrice`, `PRICE_MAP`, `FixeoPricingMarocain` | Aucune autorité canonique dans ces fourchettes UI | Non importés | B rejeté | Migrer les usages web vers canonique séparément, hors W4 |
| Match preview | `getArtisanCount` filtre catalogue ; fallback « Artisans disponibles » même sans comptage | Le comptage catalogue ne certifie ni disponibilité ni éligibilité dispatch | Aucun nombre/ETA/fausse disponibilité affiché | B rejeté | GAP-04 : aucun contrat sûr de preview éligible identifié dans les services mobiles |
| Dispatch et recherche | Engines JS historiques, miroir local ; chemins serveur actuels | `create_my_service_request_v1`, queue/mission et watch existants | Statuts réels, idempotence, reprise foreground et polling inchangés | A mobile / B scoring JS non repris | Pas de pseudo-progress ou d’ETA ; en cas d’indisponibilité, état serveur attendu |
| Suivi demande / historique | `fixeo-tracking-page-v1.js` local cache + requêtes Supabase ; guest tracking séparé | RPC client mission courant/détail, lignes service_requests sous RLS | Chronologie, statut explicite, écran mission ; jamais « artisan trouvé » pendant le chargement | A/B | GAP-05 : historique fournit request_id sans mission_id ; action reste retour au suivi courant |
| Artisan affecté | Plusieurs projections web | Snapshot mission, artisan_name/artisan_verified | Nom et badge seulement s’ils existent réellement | A réutilisé | Pas d’identité ni note de substitution |
| Intervention / ajustement | Workflow serveur + chemins présentation web | RPC mission/change existants | Timeline, proposition réelle, acceptation/refus inchangés | A réutilisé | Aucun prix calculé depuis la proposition ; source serveur |
| Photos avant/après | Dossiers/preuves web et diagnostic mission | Edge Function `mobile-mission-evidence`, URL signées | Comparaison avant/après, toutes les preuves dépliables, erreurs/absence explicites | A réutilisé | Fixtures d’image ne sont pas une preuve d’upload serveur ou un cas terrain |
| Validation | CTA web fin de mission | `confirm_completed_mission` et request_id réel | Preuves puis confirmation explicite, statut validé serveur | A réutilisé | Pas de validation automatique |
| Notifications / push / deep links | Centre de notifications web ; stockage de compatibilité historique | Tables RLS, registry device et `notificationRouting` mobile | Alertes prioritaires, marquer lu, opt-in push ; intention de notification authentifiée reprise vers bonne mission | A réutilisé | Livraison push/app cold-start non certifiée sur appareil sans build |
| Session / reprise | Auth web et restaurations UI | Auth mobile existante, SecureStore/AsyncStorage et refresh foreground | Session et rôle inchangés ; retour foreground sans nouvelle soumission | A réutilisé | Aucun changement auth autorisé |
| RAFI Presence / feedback | RAFI visuel web, typing et helpers contextuels | W3 `RafiOrb`, `getClientRafiPresence` ; feedback DS2 existant | Hero plus grand, états réels, reduced motion, capture native, cibles ≥48 | A mobile, C représentation web | Performance batterie/GPU native non mesurée ; aucune haptique supplémentaire |
| Carte / annuaire / SEO | Carte Leaflet, profils, pages locales et liens SEO | Annuaire != matching | Pas de grande carte ni choix d’un moteur | C non repris dans W4 | Découverte de profils à décider comme produit distinct ; pas une preuve de parité du parcours de service |
| Ancien compteur réseau | `_updateNetworkCount` documenté no-op : cible DOM disparue (`fixeo_homepage_premium_patch.js`) | Aucune | Aucun compteur repris | D ignoré | Le compteur marketing fixe voisin est B, également non repris |

## MOBILE_CAPABILITY_GAP — GAP-01 : Estimator inaccessible par la passerelle mobile configurée

- Fonction : qualification puis résultats canoniques.
- Web : `js/fixeo-estimator-api-v1.js`, POST same-origin `/api/estimator-v1`.
- Autorité : `api/estimator-v1/index.js`, six actions start, answer, select_service, evaluate, verify_pricing_context, confirm_request. Les tokens opaques sont signés/chiffrés côté serveur.
- Sécurité : `FIXEO_ESTIMATOR_SECRET` reste serveur. L’API n’exige **pas** que le client fournisse ce secret ; c’est le serveur qui en a besoin. Ne pas confondre ce point avec le défaut de passerelle.
- Preuve déployée : `mobile/eas.json` preview vise la fonction staging `mobile-rafi-preview-proxy` du projet `kqyhusnbybsukbcaoqtu`. Source lue, version 2 ACTIVE, verify_jwt=true, SHA-256 `8f8f32ac1a9a8b2ffb912a9d5861d7cd64ea1bc29e591df4bf7185616b9c70dd`. Seuls les POST photo et transcription sont relayés ; autre route → 404 ROUTE_NOT_FOUND. L’accès au preview Vercel protégé est conservé côté proxy. Aucun secret de contournement publié dans ce dossier.
- Passerelle manquante : allowlist/API Estimator authentifiée, politique d’origine adaptée au mobile, quotas, forwarding des identités et erreurs, environnement canonique explicitement autorisé. Le preview direct configuré pour development ne fournit pas la preuve d’un accès mobile sûr à cette API protégée.
- Recommandation : mandat backend distinct pour cette passerelle ; puis seulement client mobile des six actions. W4 n’active rien. `ClientFixeoResult` est préparatoire, importé uniquement par les fixtures, pas par Home.

## MOBILE_CAPABILITY_GAP — GAP-02 : diagnostic photo vers qualification canonique

- Web : `/api/diagnostic-v1`, session/run/revision et diagnostic_token ; `api/diagnostic/estimator-bridge.js::beforeAction`.
- Mobile : `analyzeMobileDiagnosticPhoto` renvoie seulement `body.result`. L’endpoint annonce persisted=false, raw_photo_retained=false, sanitized_photo_retained=false.
- Autorité/sécurité : bridge vérifie identité actor, origine/headers, session persistée, selected_run_id, revision, état ready/bound et safety.stop=false. Le serveur remplace le contexte et garde known_inputs vide pour ne pas promouvoir des hypothèses IA en inputs prix confirmés.
- Manquant : référence diagnostic signée et consentement/persistance adaptés au mobile, route structurée d’answers/reanalyse. Les questions préventives de sécurité sont masquées et non bloquantes si safety.stop=false. Seule la levée/modification d’un vrai safety.stop nécessite une réévaluation serveur, actuellement inaccessible via la gateway mobile. Ce gap ciblé ne bloque pas les diagnostics normaux. Les réponses métier textuelles W4 sont uniquement une description explicitement confirmée pour la demande existante ; elles ne se font pas passer pour une qualification Estimator.
- Recommandation : réutiliser ce dossier/bridge sous mandat séparé. Aucune référence synthétique, session parallèle ou token client fabriqué.

## MOBILE_CAPABILITY_GAP — GAP-03 : prix vérifié vers demande authentifiée

- Web : `fixeo-estimator-reservation-bridge-v1.js` préserve uniquement le pricing_context_token ; vérification puis confirm_request(token, client_phone).
- Serveur : contexte opaque TTL, validation financière, confirmation RPC, tracking_ref et credentials guest dérivés côté serveur. Certaines routes diagnostic sont liées au dossier persisté.
- Mobile courant : `createRequest(serviceCategory, normalizedCity, description, idempotencyKey)` ne possède **aucun** paramètre pricing_context_token. Ses RPC de suivi ciblent le client authentifié.
- Manquant : chemin end-to-end vérifié reliant résultat/token, consentement explicite, identité client authentifiée, request_id/mission_id, reprise après erreur et notifications. Aucun lien sûr de l’acteur mobile n’est établi dans la confirmation guest standard auditée.
- Recommandation : confirmer le contrat d’identité et la passerelle existante côté serveur dans une tâche autorisée. Ne pas appeler createRequest pour réserver un résultat Estimator en abandonnant son token. W4 permet uniquement la demande non tarifée existante après confirmation ; aucun handoff Estimator→request n’est simulé.

## MOBILE_CAPABILITY_GAP — GAP-04 / GAP-05

**Preview matching :** les nombres web filtrent un catalogue, pas une preuve canonique de disponibilité/éligibilité. Une éventuelle preview doit être une réponse serveur à accès limité et non une copie de score JS.

**Historique vers mission précise :** `ClientRequestHistory` contient l’id de demande, pas l’id de mission ; l’action existante ouvre Home et sa mission courante. En cas de plusieurs demandes, cela n’assure pas l’ouverture de l’ancienne demande choisie. Le cockpit W4 sélectionne la priorité d’attention pour l’affichage mais n’invente pas un mission_id. Étendre une projection canonique autorisée ultérieurement ; pas de nouvelle requête/table en W4.

## Verdict de capacité

**Non : la parité des fonctions Client pertinentes avec le web n’est pas encore atteinte.** La capture multimodale, le contexte mission, la lisibilité, le contrôle de la ville, les fallbacks et la sécurité de l’entrée progressent. Les moteurs pricing/dossier/confirmation existants côté web ne sont pas encore accessibles de façon complète et sûre dans Mobile. Les maquettes contractuelles ne comptent pas comme fonctionnalités livrées. Le nombre d’étapes et la vitesse perçue n’ont pas fait l’objet d’une étude comparative utilisateur ; aucune supériorité universelle n’est affirmée.

## Safety by Exception — addendum produit appliqué

- Normal : aucune question/confirmation/étape préventive de sécurité. Le résultat serveur reste l’autorité ; aucune nouvelle analyse réseau n’est ajoutée.
- Ambiguïté légère : au maximum la première précision métier utile renvoyée par le moteur ; optional=true reste optionnel. Le contrat ne fournit pas de marqueur « clarification sécurité indispensable » : W4 n’en invente pas et n’affiche donc aucun questionnaire de sécurité.
- Vrai safety.stop : message humain bref, première consigne serveur disponible, sortie vers l’espace ; aucun send, prix ou levée locale.

`question-routing.js` renvoie actuellement des questions optional=true après l’évaluation Safety ; leur présence n’est pas un constat de danger. Le candidat initial bloquait tout type choice : cette précaution trop large est retirée par cet addendum. Les IDs safety sont projetés depuis QUESTIONS/hazard, et les choix métier ne sont pas assimilés à des signaux Safety.

**Priorités W4.1, sans démarrage de ce chantier :** 1) accès sécurisé Estimator, 2) référence diagnostic persistée/signée, 3) handoff vers demande sécurisé. Réévaluation Safety ciblée sur les vrais STOP, aucun système générique question→serveur→question.
