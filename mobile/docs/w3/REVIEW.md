# W3 — RAFI WOW / Presence Engine V2

**Mise à jour :** la passe de polish et son verdict **STOP — RAFI NORTH STAR NOT REACHED** sont documentés dans [VISUAL-REVIEW.md](VISUAL-REVIEW.md). Ce verdict remplace la conclusion visuelle initiale ci-dessous.

Dossier initial du candidat pour revue visuelle indépendante, exclusivement branche mobile. Ce dossier couvre le renderer, son contrat de présence et le composer ; les écrans actuels conservent leur composition W2.

## A. Checkpoint / concurrence

- Dépôt : `fixeo-app/Fixeo-clean`.
- Base canonique : `feat/fixeo-mobile-m4-terrain`, **`3a809035ffea579e1f18798bf5493c2022f0b58e`**.
- Branche isolée : `feat/fixeo-mobile-w3-rafi-presence-v2`.
- Preflight distant `git ls-remote` exact ; base locale/distante `0/0` ; deux anciens worktrees propres, aucun verrou Git ni processus écrivain observé. Le worktree de base post-W2 est inactif ; aucun second worktree propriétaire de W3.
- PR #145 fermée, merge et postmerge W2 confirmés. Aucune PR ouverte vers la base mobile constatée avant publication W3.
- Aucun sous-agent ni certification parallèle du même candidat. Les étapes de capture RAFI puis de non-régression Shell sont distinctes.
- MAIN lu au preflight et avant publication : `f8e59d5ad7294dd5493bf7b0219740248d2a8d64`.
- Le SHA candidat publié, la PR Draft et les résultats CI exacts sont consignés dans la description de PR/livraison : ils désignent le commit contenant ce dossier.

## B. Audit ciblé

Audités : `RafiOrb`, `rafiOrbMotion`, `RafiInputRail`, `EntryStage`, Home Client, cockpit Artisan, `MobileShell`, `PremiumDrawer`, tokens, motion/easing, store Reduced Motion W1, feedback, `rafi`, `rafiGateway`, `rafiContext`, `mobileDiagnostic`, tests existants. Les pages mission et leurs contrats sont lus pour les invariants uniquement.

Ancien renderer : deux boucles permanentes par instance (respiration et satellite), trois valeurs Animated, aucune pause AppState/focus, petite taille dont le frame dépassait le logement W2, absence de signature centrale, palette noire seulement. Success était une séquence unique mais conservait deux boucles en arrière-plan et un profil de célébration permanent. Client et Artisan confondaient recherche, intervention, affectation et validation.

Capture multimodale existante : permission micro explicite, HIGH_QUALITY, stop puis transcription serveur ; permission caméra, qualité 0,72, aucun crop ; photo analysée uniquement sur action explicite avec ville requise. Aucune amplitude audio fournie au renderer. Le bouton Écrire n'avait pas de callback dans Home. Les lectures backend, polling métier, permissions et prompts ne sont pas modifiés.

## C. Décision renderer

Voir [RENDERER-DECISION.md](RENDERER-DECISION.md), rédigé avant ajout de dépendance.

**Animated natif + couches natives + expo-linear-gradient `~15.0.8`**. Version installée : `15.0.8`, compatible avec le manifeste SDK 54 installé et Expo Doctor. Après polish : trois gradients statiques medium, quatre hero, un compact ; aucune couleur ou dimension animée. Une seule valeur/horloge pilote transform et opacity. Reanimated n'apporte pas de bénéfice nécessaire ici ; Skia/Lottie/WebGL/3D absents.

Aucune autre version de dépendance n'a changé dans le lockfile local comparé à W2. Le lockfile généré reste exclu du dépôt, conformément à la configuration préexistante ; CI conserve `npm install` et l'archivage de son lockfile. Pas de modification des workflows ni de configuration Expo/EAS.

## D. Contrat canonique

`ui/rafiPresence.ts` ne connaît aucun backend. Les anciennes valeurs `idle/listening/working/success` restent valides ; `RafiOrb.mode` et les fonctions publiques de motion conservent leurs noms. `MobileShell` reçoit uniquement un élargissement de type, aucune modification runtime.

| État | Sens / rendu | Label accessible |
|---|---|---|
| idle | Respiration lente, halo discret | RAFI est prêt |
| listening | Attention immédiate, amplitude fixe, aucune waveform | RAFI écoute |
| understanding | Recentrage léger, pas de spinner | RAFI comprend votre demande |
| working | Activité contrôlée | RAFI travaille |
| matching | Orbite lente, 12 s ; même horloge pour la respiration | FIXEO recherche un artisan |
| intervention | Présence presque immobile | Intervention en cours |
| success | Impulsion 280 + 600 ms, sans délai, puis pose calme | RAFI a terminé cette étape |
| attention | Lumière champagne un peu renforcée, sans clignotement | Une action demande votre attention |

| Vérité existante | Client | Artisan |
|---|---|---|
| Aucune priorité | idle | idle |
| Capture micro active | listening | — |
| Transcription / diagnostic photo en cours | understanding | — |
| Création de demande / acceptation en cours | working | working |
| Recherche réellement active | matching | — |
| Affectation constatée | success, puis pose idle | attention (mission à ouvrir) |
| Intervention `in_progress` | intervention | intervention |
| `completed`, validation nécessaire / attendue | attention | attention |
| Opportunité réellement disponible | — | attention |
| Erreur affichée / signal de sécurité visible | attention | attention |

Le calcul local synchrone de métier ne déclenche pas de fausse phase d'attente. Les mappers sont de présentation et n'écrivent jamais un statut métier. Le signal de sécurité photo ne pilote la présence que lorsque ses explications sont visibles dans le parcours d'entrée.

Success est consommé une seule fois par identité d'événement au sein de l'instance. Polling, retour au premier plan et changement Reduced Motion ne rejouent pas la célébration. Une entrée initiale sans motion disponible est consommée sans attente. La pose se stabilise ; le label conserve la vérité « étape terminée ». Aucune vibration dans la présence. Les instances mission legacy bénéficient du nouveau renderer sans modification de leurs sources ou règles.

## E. Système visuel

Une seule RAFI pour les deux univers : noyau noir, profondeur graphite, reflet large et contrôlé, halo chaud désaturé, petite courbe lumineuse oblique. Aucun bitmap, emoji, visage, photo de fond, couleur AI néon ou couleur de statut dans l'identité.

Palette centralisée dans `rafiVisualTokens`. Tailles testées 44 / 76 / 96, garde de valeurs finies et bornes 32–192. Compact <=58 : statique, sans reflet secondaire, glow de signature ni orbite ; frame 55 px à size 44, contenu dans le logement Drawer 56 px inchangé. La surface compacte sombre couvre l'ancien effet d'anneau blanc épais. Medium/Hero conservent la même signature et leur matière.

Le maximum géométrique halo/success reste dans le frame (tests analytiques et contrôles navigateur). Aucun débordement ou sphere coupée constaté. La Home Client et le cockpit gardent leurs titres, cartes, champs et mise en page actuels : leurs refontes appartiennent à W4/W5.

## F. Composer

`RafiComposer` est une présentation pure ; `RafiInputRail` garde ses fonctions `toggleVoice` et `takePhoto` **octet pour octet**. Une seule surface blanche relevée, texte à gauche, caméra puis micro à droite. Icônes Ionicons déjà présentes, cibles >=48 px, focus visible, label « Arrêter l’enregistrement » pendant la capture.

Le callback texte est relié au focus du champ problème existant. Valeur, validation, champ ville, soumission, photos, MIME, transcription et diagnostic restent ceux de W2. Le message associé à la transcription dit maintenant « RAFI transcrit votre message… ». Aucune nouvelle permission, conversion média, route backend ou requête supplémentaire.

## G. Performance / lifecycle

- 1 `Animated.Value`, au maximum 1 horloge par présence animable ; 3 wrappers animés habituels, 4 uniquement avec l'orbite matching. Tous les gradients sont statiques.
- `useNativeDriver: true`, `isInteraction: false`. Aucun setInterval de rendu, listener de valeur Animated, calcul React ou allocation JS par frame. Les polling métier existants restent hors moteur de présence.
- 0 horloge compact, Reduced Motion, inactive/background, écran sans focus. Pause et nettoyage testés avec de vrais Animated RN Web et des événements AppState/navigation contrôlés côté fixture.
- Un listener AppState partagé pour les instances animables ; au maximum deux abonnements focus/blur par instance animable. Tous libérés. Le store Reduced Motion W1 est réutilisé sans modification.
- Success utilise une séquence non bouclée ; aucune animation de célébration pendant les minutes où un statut reste assigned.
- Export web comparé au post-W2 : augmentation d'environ **9,7 kB brut / 3,4 kB gzip** (moins de 1 %). Les chiffres exacts du candidat figurent dans `evidence/bundle-impact.json`.
- Les mesures CPU/GPU/batterie natives ne sont pas certifiées par un navigateur. Elles appartiennent au hardening et à la certification physique ultérieurs.

## H. Accessibilité

Huit labels français exhaustifs, image accessible sans live-region animée ; aucune annonce par respiration/frame. Les détails critiques restent en texte dans les composants métier existants. Reduced Motion est statique immédiatement, sans attente ni contenu bloqué. Taille de police système conservée ; composer testé à texte ×2 / 320 px, sans collision. W2 conserve safe areas, focus, cibles et navigation ; non-régression navigateur rejouée.

## I. Preuves

Les PNG emploient **les vrais composants RN Web**. `rafi-client-presence` et `rafi-artisan-presence` montent les véritables exports des routes actuelles, avec frontières session/services explicitement isolées, lectures vides, aucune mission/opportunité/résultat IA inventé et aucun accès backend. Ce sont des preuves d'intégration UI, pas des captures d'un compte staging connecté ni une certification fonctionnelle serveur.

La grille impose `active=false` pour des poses de référence stables. Les captures des écrans et du composer utilisent la vraie préférence Reduced Motion navigateur. Les animations normales sont vérifiées séparément par des assertions runtime. Aucun screenshot pris au milieu d'une transition ; Drawer attendu à sa position finale via le garde W2.

Preuves obligatoires, dans `evidence/` :

- `rafi-states-390.png` : huit états + tailles.
- `rafi-states-320.png` : huit états + retour à la ligne des tailles.
- `rafi-reduced-motion.png` : présentation statique accessible.
- `rafi-client-presence.png` : Home actuelle / composer / champs conservés.
- `rafi-artisan-presence.png` : cockpit actuel / même RAFI.
- `rafi-compact-drawer.png` : vrai Drawer W2, orb compacte, destination RAFI sélectionnée.
- `rafi-composer.png` : vrais composants, trois intentions dans une surface.

Compléments : `rafi-hero-closeup.png` (96 px CSS, DPR 3), `rafi-client-presence-320.png`, `rafi-artisan-presence-320.png`, `rafi-composer-large-text.png`. Résolutions et SHA-256 dans `evidence/manifest.json`. Scénarios/assertions dans `browser-results.json` ; non-régression Shell dans `shell-browser-results.json` ; contrôle des fonctions gelées dans `scope-review.json`.

## J. Tests / gates locaux

Exécutés depuis `mobile/` :

| Commande | Résultat |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:contracts` | 61 PASS, 0 échec, 0 skip |
| `npx expo-doctor@1.20.4` | 18/18 PASS |
| `npm run gate:a` | PASS, export web uniquement |
| `git diff --check` | PASS |
| `node tests/fixtures/prepare-rafi-visual.cjs` puis `node tests/rafi-visual-check.cjs` | 10 scénarios principaux + tests complémentaires après polish, 0 erreur JS, 0 requête externe |
| `node tests/fixtures/prepare-shell-visual.cjs` puis `node tests/shell-visual-check.cjs` | 8 scénarios W2 + compatibilité legacy / texte ×2 : PASS |

Le runner accepte les chemins optionnels build/output et `W3_PLAYWRIGHT_MODULE`, `W3_CHROMIUM_EXECUTABLE`, `W3_CHROMIUM_ARGS` (JSON). Le navigateur de vérification est fourni par l'environnement, sans dépendance applicative ajoutée. Les contrats W3 couvrent : huit états, API legacy, labels, mappings, success transitoire, pause/cleanup, bornes géométriques, palette centralisée, absence backend/haptics/per-frame, sources mission/evidence identiques. Les callbacks, permissions refusées, navigation focus et Reduced Motion sont également exercés avec les vrais composants par le runner navigateur.

## K. Git / review

Publier exclusivement la branche W3 et créer une **PR Draft** vers `feat/fixeo-mobile-m4-terrain`. Aucun merge dans ce mandat. Revue indépendante attendue. La description de PR portera le SHA exact et la CI avant le verdict final de livraison.

Revue React Best Practices appliquée : imports directs, calculs purs de présentation, dépendances d'effets stables, cleanup, pas de render par frame, sous-composant composer en dehors du parent, callbacks et valeurs métier conservés. Aucun changement backend pour résoudre un problème UI.

## L. Invariants et stratégie build mise à jour

Diff nul sur les deux sources mission, MissionEvidenceCapture, tout `mobile/lib`, backend/Supabase, matching/dispatch, auth/session, EntryStage, PremiumDrawer, Dock et architecture Shell W2. Dans MobileShell, seul le type `orbMode` est élargi. MAIN / Production, web, Enterprise et Control OS non modifiés par W3. Aucun démarrage W4/W5/W6/W7/W8, aucun merge, aucun EAS/APK/AAB/iOS/TestFlight/Store upload. Le renderer commun actualise l'apparence de RAFI dans ses usages legacy sans refondre l'auth ni les missions.

**Décision utilisateur du 4 octobre 2026 : aucun build physique après W3.** Premier build uniquement après **W8 CLOSED — POSTMERGE PASS** : « BUILD PHYSIQUE #1 — FIXEO MOBILE WOW RC CANDIDATE ». W9 sera la certification physique. Après fermeture postmerge de chaque bloc W3 → W8 : arrêt et nouvelle exécution propriétaire du bloc suivant. Ce mandat s'arrête déjà au candidat W3 + preuves + PR Draft.

## M. Limites réelles / quality gate initial

Cette évaluation initiale précède la revue ciblée. Le verdict courant figure dans [VISUAL-REVIEW.md](VISUAL-REVIEW.md) : **STOP — RAFI NORTH STAR NOT REACHED**.

Question posée : « Est-ce que RAFI ressemble désormais à la sphère centrale d’un produit technologique international premium, ou simplement à un composant React Native animé ? »

Jugement de cette exécution après inspection des images : la matière noire, la courbe chaude propre à RAFI et le calme commun Client/Artisan constituent une signature cohérente, suffisante pour présenter le candidat à une revue visuelle indépendante. Le jugement produit final reste celui de cette revue ; la Home et le cockpit conservent volontairement leur typographie/composition pré-W4/W5.

Restent à vérifier sur appareils après W8 : reflets natifs Android/iOS, TalkBack/VoiceOver, Dynamic Type réel, consommation batterie/GPU, permissions et capture réelles. Les fixtures ne valident pas une transcription/diagnostic serveur ou le parcours mission complet. Aucun test métier en écriture n'a été exécuté. Le succès n'est pas persisté entre deux montages ; le montage initial sans motion disponible est consommé sans célébration, et le polling/focus d'une instance ne rejoue pas l'événement.

Verdict local : gates et preuves acquis. Le verdict final **PASS W3 — CANDIDATE READY FOR VISUAL REVIEW** sera fourni après validation de la CI du SHA publié. Ce n'est pas un verdict postmerge ni une certification physique.
