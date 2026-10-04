# W2 — App Shell V2 / Premium Drawer / FIXEO Context Dock

Candidat logiciel pour review, staging uniquement. Aucun merge, build physique ou déploiement demandé par W2. Les captures sont des **fixtures de composants réels**, sans données ni connexion backend ; elles ne représentent pas la refonte W4/W5.

## A. Checkpoint

- Dépôt : `fixeo-app/Fixeo-clean`.
- Base : `feat/fixeo-mobile-m4-terrain`.
- SHA post-W1 : `6b9fead256c7e6991b16d187df8fc7b63d1c56eb` (PR #144).
- Branche distante relue avant écriture et avant publication : SHA identique.
- Divergence base locale/distante et base canonique : `0/0`.
- Worktree de départ propre ; aucun verrou Git, autre worktree sur cette branche ou PR ouverte vers la branche mobile constaté au preflight. Aucun autre écrivain détecté ; aucun sous-agent lancé.
- W2 isolé dans un worktree et une branche enfant. Aucun reset/rebase de la base.
- MAIN observé au départ et avant publication : `f8e59d5ad7294dd5493bf7b0219740248d2a8d64`.

## B. Audit ciblé et décisions

Lecture de `MobileShell`, `FixeoScreen`, `screenMetrics`, tokens DS2, `FixeoAction`, `FixeoText`, `FixeoSurface`, contrats interaction/motion, Reduced Motion, `_layout`, RAFI root, cockpit Artisan, les neuf routes workspace, les deux pages mission et `MissionEvidenceCapture`.

Constats : Shell à l’intérieur des ScrollView/FlatList ; menu 44 px, action droite 40 px, déconnexion 46 px ; glyphes improvisés ; durées Drawer hardcodées ; double mécanisme BackHandler/Modal ; statut par défaut « connecté » sans preuve ; pied de Drawer fixe défavorable au texte agrandi ; `replace` pouvait recopier une route déjà dans l’historique.

Décisions : header hors défilement, DS2, Ionicons, cibles 48 px, état sélectionné annoncé, fermeture explicite, tout le contenu profond scrollable. `Modal.onRequestClose` possède Android Back ; aucun listener BackHandler concurrent. La fermeture utilise un état de transition unique, annulé au changement de route, et restaure le focus. Le Drawer monte l’Orb existante uniquement lorsqu’il est ouvert.

Un test visuel a révélé un débordement des textes agrandis : largeur des labels bornée, retour à la ligne et calcul d’espace disponible corrigés. Le Dock cède sa place si moins de 180 px restent au contenu (trois cibles tactiles et leurs espacements). Aucun shrink/truncation imposé aux libellés.

## C. Architecture

| Élément | Responsabilité |
|---|---|
| `MobileShell` | Top bar, lifecycle Modal, focus, motion DS2, routage et déconnexion existante |
| `PremiumDrawer` | Présentation Client/Artisan, sections, selected, logout busy |
| `ShellControl` / `ShellIcon` | Cibles >=48, focus, pressed, disabled/busy, Ionicons ; icônes de taille stable |
| `shellContract` | Routes réelles, sélection, navigation, types et validations Dock, règles d’affichage |
| `FixeoContextDock` | Toolbar flottante de 0–3 actions ; 4 exige une justification, >4 refusé |
| `useWorkspaceDock` | Adaptateur navigation sans backend, badges issus des lectures existantes |
| `FixeoScreen.header` | Propriétaire unique de la safe area du Shell, au-dessus du scroller |
| `FixeoScreen.contextDock` | Mesure la hauteur réelle, réserve l’espace, masque au clavier / espace insuffisant |

Le Drawer et les destinations racines utilisent `dismissTo` : revient à une route existante, sinon remplace la route courante. Une destination déjà active ne navigue pas. Les actions droites RAFI → Mon espace, Cockpit → Artisan OS et Mon espace → Compte conservent un `push` pour préserver leur écran parent et son contexte. Les liens Dock vers les détails utilisent `push` depuis leur overview et gardent un retour utile. La pile réelle installée est testée sur 20 allers-retours. Les liens mission, notifications et leurs paramètres ne sont pas modifiés.

Compatibilité `universe`, `activeKey`, `statusLabel`, `orbMode`, `rightActionLabel` et `onRightAction` maintenue. `rightDestination` et `rightActionIcon` sont additifs. Les 11 appels existants sont migrés dans `FixeoScreen.header` ; aucun doublon legacy.

Safe areas : `getScreenMetrics` W1 conservé sans modification ; aucune approximation Android 24/48 ajoutée ; hauteur Dock mesurée et réservée une seule fois. Les slots Dock et header ne changent pas la hiérarchie des écrans legacy qui ne les utilisent pas. Aucun KeyboardAvoidingView ni addition de hauteur clavier.

## D. Implémentation

Créés :
- `components/PremiumDrawer.tsx`, `components/useWorkspaceDock.ts`.
- `ui/ShellControl.tsx`, `ui/FixeoContextDock.tsx`, `ui/shellContract.ts`.
- `tests/shell-contract.test.ts`, `tests/shell-render.test.ts`, `tests/shell-visual-check.cjs`.
- Fixtures `render-shell.tsx`, `shell-visual.tsx`, `shell-router.web.ts`, `shell-auth.web.ts`, `prepare-shell-visual.cjs`.
- Ce dossier de review et ses preuves visuelles.

Modifiés :
- `components/MobileShell.tsx`, `ui/FixeoScreen.tsx`.
- `app/index.tsx`, `app/artisan.tsx`.
- `app/client-workspace/{index,history,notifications,account}.tsx`.
- `app/artisan-workspace/{index,clients,quotes,agenda,finance}.tsx`.

Modifications des écrans limitées au placement du Shell, à ses destinations et aux raccourcis repris par le Dock. Les fonctions métier et chargements restent intacts. Aucune nouvelle dépendance applicative, aucun changement de config Expo/EAS ou de contrat W1.

## E–F. Destinations et affichage

| Univers | Drawer | Dock W2 |
|---|---|---|
| Client | RAFI ; Mon espace ; Interventions ; Alertes ; Mon compte | `/client-workspace` : RAFI, Interventions, Alertes ; compteurs existants uniquement |
| Artisan | Cockpit ; Artisan OS ; Clients ; Devis ; Agenda ; Finance | `/artisan-workspace` : Cockpit, Agenda, Devis |

Client : les anciens raccourcis Interventions/Alertes sont remplacés par le Dock ; Mon compte reste l’action droite unique. Artisan : Clients/Finance restent dans les raccourcis de l’overview ; Agenda/Devis passent dans le Dock, ainsi que Cockpit. Le Drawer reste l’accès profond à l’ensemble.

Dock volontairement absent de RAFI root, cockpit, sous-pages/listes/formulaires, sign-in, boot/auth, missions, evidence, routes inconnues et univers non correspondant. Caché également si clavier visible, contrat `hidden`, liste vide ou espace insuffisant. Pas de profil Artisan fictif, pas de fausse intelligence contextuelle, pas de polling ni de requête supplémentaire.

## G. Missions et invariants

Diff nul sur les deux pages mission, `MissionEvidenceCapture`, `mobile/lib/**`, `_layout.tsx`, `RafiOrb`, motion RAFI, backend, API et Supabase. Workflow création → matching → acceptation → arrivée → photo avant → début → photo après → fin → validation conservé. Evidence et toute logique métier intacts. Aucun test backend en écriture nécessaire ou exécuté.

W4/W5 pourront déterminer l’utilité d’un Dock de mission après audit des contrôles terrain. W2 n’en installe aucun.

## H. Tests et portée des preuves

Commandes exécutées depuis `mobile/` :

| Commande | Résultat |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:contracts` | 55 PASS, 0 échec, 0 skip |
| `npx expo-doctor@1.20.4` | 18/18 PASS |
| `npm run gate:a` | PASS — export web uniquement |
| `git diff --check` | PASS |

Le lockfile local généré utilisé pour W1 a été repris avec les mêmes dépendances. Il reste exclu par la règle Git locale déjà présente ; aucune dépendance ou version du projet n’a été modifiée. CI conserve son installation et ses gates existants.

Tests ciblés : routes Client/Artisan existantes et actives, limites Dock, caché/clavier/contexts interdits, réservations et texte agrandi, min-target, Reduced Motion, vrai StackRouter (absence de pile infinie), AST des 11 intégrations (un Shell hors scroller), rendu réel React Native Web des composants et de leurs états accessibles. Aucun snapshot cosmétique.

Vérification navigateur locale : composants réels React Native Web, **frontières router/auth simulées explicitement**, huit scénarios Client/Artisan × 320×568 et 390×844 × Reduced Motion et animation normale ; header stable, cibles >=48, dernier CTA au-dessus du Dock, selected, fermeture sur destination active, Escape, backdrop, navigation, logout busy, absence d’erreur JS. Compatibilité ancienne action et émulation texte ×2 vérifiées. Captures dans `evidence/`.

Reproduction, avec Playwright/Chromium disponibles dans l’environnement de test :

```sh
node tests/fixtures/prepare-shell-visual.cjs
node tests/shell-visual-check.cjs
```

Le vérificateur accepte `W2_PLAYWRIGHT_MODULE`, `W2_CHROMIUM_EXECUTABLE` et `W2_CHROMIUM_ARGS` (JSON) si les outils sont fournis hors du projet. Aucun accès réseau/backend de l’app dans cette fixture. L’environnement utilisé a installé son navigateur séparément du projet ; ce runtime ne fait pas partie du candidat.

## I. Git / CI

Branche : `feat/fixeo-mobile-w2-shell-v2`.
Cible PR : **`feat/fixeo-mobile-m4-terrain`**, Draft uniquement.
Le SHA final, le numéro de PR et le run CI sont consignés dans le message de livraison et la description de PR après publication. Ils identifient le commit qui contient ce dossier. Aucun merge automatique ou manuel.

## J. Non-modifié

MAIN / Production, backend, Enterprise / Control OS intacts par W2. RAFI V2, Client WOW et Artisan WOW non commencés. W1 non reconstruit. Aucun APK, AAB, EAS build, iOS/TestFlight ou Store upload lancé. Gate A produit uniquement l’export web exigé par le mandat.

## K. Limites restantes

- Recette physique Android/iOS, TalkBack/VoiceOver, vraies safe areas/clavier et Dynamic Type à réaliser au build conjoint W1+W2+W3 prévu. Le Back Android est câblé sur le contrat natif Modal, pas certifié sur appareil dans W2.
- Les captures valident le Shell sur fixture ; elles ne certifient ni les données backend ni un parcours métier complet. Ces surfaces métier sont inchangées.
- Les animations Stack existantes et les retours propres aux missions restent hors migration W2.
- Le Dock W2 est volontairement limité aux deux overviews. W4/W5 possèdent son enrichissement métier.

## L. Verdict

Le verdict de livraison dépend de la CI du SHA candidat final ; les gates et preuves locales ci-dessus sont acquis. Le message final donnera exactement le verdict demandé après contrôle de cette CI.


## M. Correction ciblée des preuves Drawer — PR #145

Correction relue depuis le candidat `5a06f2006c2a22477ba51e8d257050a0e28ee5ef`, base canonique inchangée. Aucun fichier produit modifié par cette correction.

**Cause confirmée : course de timing dans la fixture.** `close.waitFor()` garantit le montage/état visible Playwright du bouton, mais pas son intersection avec le viewport ni la fin de la translation du panneau. Sur le code produit inchangé, juste après cette attente, les deux panneaux mesurent 366 px de large à **x = −358,701 px** : environ 7,3 px seulement sont à l’écran. Les observations rAF suivantes atteignent spontanément x = 0 et la matrice identité, environ 213–215 ms après le début du relevé. La transition normale DS2 reste active ; aucun défaut d’ouverture produit constaté. Voir `evidence/drawer-timing.json`.

Le vérificateur attend désormais, à chaque ouverture, le panneau réel identifié depuis le bouton de fermeture dans le Modal : polling `requestAnimationFrame` jusqu’à x = 0, largeur contractuelle et transformation identité. Le timeout de 5 s est une borne d’échec, pas une pause ; aucun sleep, désactivation d’animation ou hook produit ajouté. Chaque capture Drawer passe ensuite par une assertion bloquante indépendante juste avant le screenshot.

Contrôles obligatoires : panneau visible et intégralement dans le viewport, origine (0, 0), largeur `min(viewport − 24, 390)`, hauteur du viewport, matrice identité, bouton fermer et destination sélectionnée entièrement visibles, non masqués et atteignables au point central, aucun débordement horizontal ou troncature de texte/contrôle. Toutes les destinations et la déconnexion sont aussi vérifiées individuellement après défilement, puis la position initiale du scroller est restaurée. Sur petit écran ou pour une destination profonde, le défilement vertical reste normal ; une ligne hors de la fenêtre du scroller n’est pas assimilée à un débordement horizontal. Le garde de capture exige toujours la sélection dans la zone visible.

| Preuve | Viewport | Panneau final | Sélection visible | Fermer visible |
|---|---|---|---|---|
| `evidence/client-drawer.png` | 390×844, animation normale | x=0, y=0, 366×844 | Mon espace | oui, 48×48 |
| `evidence/artisan-drawer.png` | 390×844, animation normale | x=0, y=0, 366×844 | Artisan OS | oui, 48×48 |
| Matrice navigateur, 8 scénarios | 320×568 / 390×844, deux modes | x=0, largeur 296 / 366 | oui | oui |

Les deux PNG ci-dessus remplacent les anciennes captures prématurées ; les captures Shell sans Drawer restent inchangées. Inspection visuelle des nouveaux PNG réalisée. La déconnexion Artisan se trouve plus bas dans le scroller et a été vérifiée entièrement visible après défilement. L’émulation texte ×2 conserve la sélection et la fermeture visibles au screenshot, sans débordement ; tous ses contrôles restent accessibles par défilement. Résultats géométriques complets dans `evidence/browser-results.json`.

Trois nouveaux tests de contrat protègent le garde : géométrie finale et plafond de largeur acceptés ; panneau monté mais hors écran/translation non terminée refusé ; mauvaise largeur, contrôles critiques masqués et débordement refusés. Ils s’ajoutent aux 52 tests existants.

Gates de cette correction : typecheck PASS, 55 contrats PASS, Expo Doctor 18/18 PASS, Gate A PASS (export web requis uniquement), diff check PASS. Le SHA final et la CI Mobile Gate A correspondante sont consignés dans la description de PR et la livraison après publication. PR #145 conservée Draft, non mergée ; aucune modification mission/evidence métier/backend/MAIN/Production, aucun build physique, aucun W3.
