# W4 — Client FIXEO / candidat de revue

**STOP — W4 CLIENT NORTH STAR NOT REACHED**

Le candidat améliore les six écrans Client, la géolocalisation volontaire et la lecture guidée du diagnostic. Les contrôles locaux passent. Le mandat étendu impose également la puissance fonctionnelle du web : Estimator, dossier diagnostic et handoff de réservation sécurisé restent bloqués par des passerelles absentes. Le rendu de leurs contrats en fixture ne suffit pas à déclarer cette parité. W4 continue sur ses parties autorisées et s’arrête au candidat Draft, sans merge.

## A. CHECKPOINT

- Dépôt `fixeo-app/Fixeo-clean` ; base `feat/fixeo-mobile-m4-terrain`.
- Base exacte : `5d772c463d7b3fe2511553cc3aab48de228f8551`, W3 fermé. Préflight local/distant identique, divergence 0/0.
- Branche isolée : `feat/fixeo-mobile-w4-client-os-wow`. Autres worktrees initialement propres ; aucun verrou Git ou écrivain concurrent W4 identifié.
- Base distante revérifiée avant publication : inchangée. MAIN observé `f8e59d5ad7294dd5493bf7b0219740248d2a8d64`, inchangé pendant le travail. Aucune commande d’écriture vers MAIN.
- Audit de l’attachement initial et des trois addenda : geolocation, intelligence, Mobile > Web. Matrice complète : [MOBILE-CAPABILITY-AUDIT.md](MOBILE-CAPABILITY-AUDIT.md).

## B. AUDIT CLIENT

| Écran | Limite de la base | Réponse du candidat |
|---|---|---|
| Home | Formulaire et cartes toujours visibles, RAFI peu dominante | Hero 160/120, composer W3, saisie révélée à l’intention ; situation active remplace l’entrée |
| Workspace | Carte contextuelle et navigation redondante | Modèle contextualCockpit conservé, représentation directe du canvas ; action prioritaire |
| History | Cartes uniformes | Liste chronologique à statuts/date/catégorie/ville, action existante préservée |
| Alerts | Liste sans hiérarchie | À vérifier / Informations / Déjà vues ; notification validée retire une ancienne fin de mission des urgences |
| Account | Formulaire exposé d’emblée | Lecture puis modification téléphone/ville ; sauvegarde existante |
| Mission | Gros blocs, défaut assigned avant lecture, preuves secondaires | Chargement honnête, statuts réels, preuves avant confirmation, timeline sobre |

## C. UX ARCHITECTURE

L’entrée reste RAFI : parler, écrire ou montrer. Le client n’a pas à choisir un « centre de décision ». Les indications serveur structurent le canvas ; `getClientContextualCockpit()` et `getMyMobileDecisionContext()` restent les autorités existantes pour le contexte de mission.

Priorité de présentation : sécurité avant demande ; analyse en cours ; prochaine question diagnostic ; confirmation explicite ; demande non tarifée existante. Ensuite validation > intervention > affectation > recherche > repos. L’écran de création montre un enregistrement en cours, sans fausse affectation.

Le diagnostic conserve ses provenances originales après confirmation. Les questions textuelles non vides du résultat sont posées une à une, sans répétition de label. Les questions `choice` du contrat diagnostic portent des signaux de danger : faute de route de réanalyse structurée, elles restent bloquantes, avec une explication visible ; aucune réponse locale ne lève ce blocage. Les réponses restent en mémoire et sont ajoutées à la description explicitement confirmée ; elles ne deviennent pas des known_inputs Estimator. La description et la ville restent corrigeables avant send. Les hypothèses, pièces possibles et vérifications détaillées sont secondaires et dépliables. Safety stop masque la confirmation diagnostic et bloque l’envoi.

La partie suivante (qualification Estimator, sélection service, prix/devis puis confirmation tarifée) n’est **pas branchée** : GAP-01/02/03, sans contournement par createRequest. Un résultat seul n’autorise jamais une réservation.

## D. DESIGN SYSTEM APPLICATION

Tokens DS2 existants : fond ivoire/offwhite, texte noir/graphite, champagne discret. Pas de nouveau thème ni modification de Shell. Majorité de sections plates, surfaces blanches réservées aux entrées et détails utiles. Titres francs, textes secondaires lisibles, espacement 8/12/16/24/32 depuis tokens ; actions DS2 ≥48 px et un CTA dominant par décision.

RAFI W3 utilise sa matière hybride et ses animations existantes, avec une composition Client plus grande. Aucun changement d’asset, renderer, animation, présence, capture, Drawer, Dock ou focus W2.

## E. HOME CLIENT

| Situation | Traitement |
|---|---|
| Idle | « Un problème ? On s’en occupe. » ; composer ; aucune permission automatique |
| Listening / understanding | État réel de capture/analyse, texte adapté ; pas d’estimation décorative |
| Working / creating | « On prépare la suite. » ; verrou/idempotence existants |
| Matching | Demande active et ville, aucun nombre d’artisans ni ETA fabriqué |
| Assigned | Suivi unique ; identité/badge seulement si le snapshot les fournit |
| Intervention | Étapes et photos accessibles par le suivi |
| Validation | « Une dernière vérification. » puis preuves/validation |
| Safety | Sécurité prioritaire, demande bloquée ; aucun résultat financier |

`createRequest(need.serviceCategory, normalizedCity, need.description, idempotencyKeyRef.current)` reste à quatre arguments. `normalizedCity = city.trim()` est conservé. Pas de latitude/longitude ni prix transmis. CITY_NOT_SUPPORTED à l’analyse **et** à l’envoi est expliqué avec champ ville toujours éditable.

## F. WORKSPACE / HISTORY / ALERTS / ACCOUNT

Chargements, actualisation foreground, refresh et services conservés. Les erreurs ne fabriquent pas un état « tout va bien ». Profil non modifiable avant lecture utile ; sauvegarde/cancel explicites. Opt-in push déplacé vers Alertes, sans changement du composant ou des permissions push.

Le cockpit choisit la demande demandant le plus d’attention, mais la navigation historique conserve le suivi courant faute de mission_id dans la projection historique. Ce gap réel est documenté, pas maquillé par un identifiant inventé.

## G. CLIENT MISSION

Callbacks load/validate/decideChange conservés, mêmes paramètres, mêmes RPC, même polling existant. Présentation chargement/inconnu sans artisan fictif ; statuts new/assigned/in_progress/completed/validated/cancelled/no_match.

Timeline de cinq étapes et arrivée issue de l’événement réel ou de la progression canonique. Avant/après visibles ensemble, ou empilés en grand texte ; toutes les preuves sont dépliables. URL manquante/échec/aucune photo sont distingués. La validation explicite reste commandée par le statut completed ; absence de photos ne crée pas une nouvelle règle métier.

## H. RESPONSIVE / ACCESSIBILITY

320×568 et 390×844, safe areas de fixture explicites. Police système non plafonnée ; émulation ×2 avec fontScale=2 pour les branches responsives, plus doublement DOM des textes RN Web. Contrôles ≥48 px, clavier/saisie manuelle, erreurs en texte, annonces polies utiles, pas de live region par frame. Pas de débordement horizontal dans les scénarios. À grand texte, défilement nécessaire ; le Dock W2 réserve son espace ou s’efface selon son contrat existant.

Reduced Motion : capture stable et passage runtime normal→reduce. W2 et W3 rejoués séparément. Ces tests navigateur ne remplacent pas VoiceOver/TalkBack ni les permissions sur appareil ; aucun build physique effectué.

## I. PERFORMANCE / DÉPENDANCES

- Aucun nouveau polling, appel métier ou moteur de pricing. Services existants byte-for-byte. Présentation en calculs purs sur listes déjà chargées.
- Pas d’état React animé par frame ; horloges/pause/nettoyage W3 inchangés.
- Dépendance unique ajoutée : `expo-location ~19.0.8`, version du catalogue Expo SDK54. Import natif déclenché après clic ; web retourne la saisie manuelle avant chargement natif.
- Une position `Accuracy.Balanced`, reverse geocode via le module natif. Délai UI 12 s ; réponses tardives ignorées après correction, expiration ou perte du contexte actif. L’API one-shot Expo ne fournit pas d’annulation de la promesse native déjà lancée ; aucun watcher/background ajouté.
- Coordonnées transitoires seulement, aucun storage/log/backend GPS. La résolution native peut dépendre des services de géocodage du système ; aucune promesse de fonctionnement hors réseau.
- `expo config --type introspect` confirme WhenInUse seul sur iOS ; coarse/fine Android ; background/service-location exclus. [Preuve](evidence/location-permissions.json).
- Export web valide ; pas d’import moteur/legacy/secret dans le bundle contrôlé. Aucun EAS, APK, AAB, iOS, TestFlight ni upload Store.

## J. PREUVES VISUELLES

Les PNG montent les vrais écrans/composants React Native Web. Seules les frontières auth/service/hardware sont isolées par fixtures ; aucun compte ni mutation métier réelle. Les captures d’artisan vide n’inventent pas une identité. Les montants Estimator proviennent de l’orchestrateur existant exécuté **hors bundle** par `scripts/generate-intelligence-fixtures.cjs`. ADD_ON_READY est uniquement une fixture de schéma sans montant, aucun service éligible n’étant certifié. Les captures portent une mention de passerelle non connectée.

[Avant / après](evidence/client-before-after.png), baseline post-W3 exacte, face au candidat. Jugement visuel : l’accueil atteint une hiérarchie plus proche de la référence ivoire/noir/champagne ; le reste est plus lisible et moins composé de cartes. Ce jugement ne constitue ni une certification visuelle indépendante ni une validation de la parité fonctionnelle.

Preuves principales :

- `client-home-idle-390.png`, `client-home-idle-320.png`
- `client-home-matching-390.png`, `client-home-assigned-390.png`, `client-home-intervention-390.png`, `client-home-validation-390.png`
- `client-workspace-390.png`, `client-history-390.png`, `client-alerts-390.png`, `client-account-390.png`, `client-mission-390.png` et variantes 320
- `client-large-text.png`, variantes de chaque écran, `client-city-large-text-320.png`, `client-reduced-motion.png`
- `client-city-detected-390.png`, `client-diagnostic-result-320.png`, `client-diagnostic-safety-320.png`
- `client-estimator-question/price/diagnostic/labour/addon/quote/route/safety/more-320.png`

Résultats structurés et intégrité PNG : `evidence/client-browser-results.json`, `shell-browser-results.json`, `rafi-browser-results.json`, `manifest.json`.

## K. TESTS

| Gate local | Résultat |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:contracts` | 81/81 PASS, 0 skip |
| `npx expo-doctor@1.20.4` | 18/18 PASS |
| `npm run gate:a` | PASS, export web uniquement |
| `git diff --check` | PASS |
| W2 `prepare-shell-visual.cjs` + `shell-visual-check.cjs` | 8 scénarios + compatibilité/texte agrandi PASS |
| W3 `prepare-rafi-visual.cjs` + `rafi-visual-check.cjs` | 12 scénarios, 0 erreur JS, 0 requête externe |
| W4 `prepare-client-visual.cjs` + `client-visual-check.cjs` | 39 groupes de scénarios, 0 erreur JS, 0 requête externe |

Les scénarios W4 exercent les vrais callbacks UI : correction city puis quatre arguments, granted/denied/blocked/GPS/timeout/no_city/web, résultat tardif, CITY_NOT_SUPPORTED, création en cours, photo, questions successives, provenance, confirmation avant demande, safety, navigation mission exacte depuis Home, validation request_id, ajustement, profil, lecture alerte, erreurs, preuves, reduced motion et texte ×2. Les résultats Estimator ne créent aucune demande et n’ont aucune autorité de réservation.

La garde historique W3 qui hachait l’écran Client mission entier a été remplacée par une garde W4 des callbacks originaux et services ; les sources Artisan restent hachées. Les seules exceptions AST déclarées sont trois affectations de présentation et le message CITY_NOT_SUPPORTED. La nouvelle garde intake avant send est testée séparément. Aucun garde W2/W3 de renderer, capture ou service n’a été supprimé.

## L. GIT

Branche `feat/fixeo-mobile-w4-client-os-wow`, cible Draft `feat/fixeo-mobile-m4-terrain` uniquement. SHA et URL du candidat publiés dans la PR et la réponse finale ; les preuves ci-dessus sont rattachées au code de cette branche. La CI distante est vérifiée sur le SHA publié et reportée dans la PR. Aucun merge.

## M. NON-MODIFIÉ

Moteur mission, backend/API/Supabase, matching/dispatch, Control OS, Enterprise, Shell W2, RAFI W3, auth/session et Artisan : sources intactes. Les helpers et composants W4 sont nouveaux ; seules les six routes Client, app.json, la dépendance autorisée et les tests/docs W4 changent. MAIN et production non modifiés ; W5 non commencé. Revue React : composants dédiés, pas de logique serveur dupliquée, cleanup local, callbacks métier conservés.

## N. RISQUES / DETTE

1. GAP-01/02/03 bloquent la parité intelligence web : passerelle Estimator, dossier diagnostic signé, handoff vers demande authentifiée. Mandat backend distinct requis, pas une autorisation implicite W4.
2. Historique/notifications ne garantissent pas l’ouverture d’une ancienne demande précise sans mission_id. La navigation existante est conservée.
3. Les photos diagnostiquées/réponses restent en mémoire ; fermeture du processus ne restaure pas un dossier diagnostic. Le serveur photo actuel est volontairement non persistant.
4. Permissions natives, précision ville réelle, push, deep links cold-start et performance appareil attendent la certification physique ultérieure autorisée.
5. Les captures de services typés ne démontrent pas un nouveau scénario backend end-to-end. Aucun résultat commercial n’est prétendu offert en ligne par les fixtures.

## O. VERDICT EXACT

**STOP — W4 CLIENT NORTH STAR NOT REACHED**

Candidat Client + ville + diagnostic guidé prêt à être examiné en Draft. Le Client Mobile n’est pas encore au moins aussi puissant que le Client Web sur l’ensemble des fonctions pertinentes : la matrice identifie précisément les capacités bloquées. Aucun passage en PASS global, merge, activation Estimator, build physique ou W5.
