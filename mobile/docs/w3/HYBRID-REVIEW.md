# W3 — RAFI Master Core V1 / renderer hybride

**PASS W3 VISUAL REVIEW — NORTH STAR CERTIFIED**

Cette revue remplace le STOP esthétique du candidat `37733f0af1f2df61d04e0bd692fb76e2029831df`. Elle porte sur RAFI intégrée aux écrans actuels, avec captures des vrais composants React Native Web. Aucun build physique. Le SHA publié et la CI correspondante sont inscrits dans la PR #146.

## A. Analyse de l'asset

Source utilisateur : `RAFI_MASTER_CORE_V1.png`, copiée **sans réencodage ni modification d'un pixel** vers `mobile/assets/rafi/rafi-master-core-v1.png`.

| Contrôle | Résultat |
|---|---|
| Format / dimensions | PNG RGBA, 1 230 × 1 278 px |
| Poids exact | 1 110 997 octets |
| SHA-256 | `b08ce64b07953205c03317e08737ce9dbfef7aeec79179792d8820833c3311d6` |
| Alpha | Réel, de 0 à 255 ; 662 841 pixels entièrement transparents |
| Bounds alpha brut | `[0,9,1212,1260]`, incluant des traces presque transparentes |
| Bounds utiles, alpha > 8 | `[70,93,1160,1154]` |
| Marges utiles | gauche 70, droite 70, haut 93, bas 124 px |
| Core central | Noir, pixel central `(2,1,2,252)` ; le détourage conserve une légère transparence du matériau |
| Fond baked | Aucun aplat rectangulaire visible sur le fond clair d'intégration |
| Contenu | Matière, rim et reflets physiques ; aucun état métier, aucune signature RAFI centrale baked |
| Clipping | Aucun pixel alpha > 8 coupé par le viewport circulaire ; pas de bord physique tronqué |

Le cadrage d'affichage est un carré de 1 104 px, origine `(63,71)`, centre `(615,623)`, rayon 552. Tous les pixels alpha > 8 sont à moins de 546,13 px de ce centre. Ce cadrage supprime à l'affichage les traces de détourage quasi transparentes à distance du core et les marges superflues. Le PNG reste intact. Échelle uniforme, sans déformation. Les bounds utiles légèrement ovales de la source sont conservés.

Référence émotionnelle consultée : capture complète `8D09AA48-8AB6-4788-B447-4E298F255826(1).jpeg`, ivoire, RAFI noire/champagne, « Un problème ? On s'en occupe. ». Elle sert au jugement matière/lumière. Sa composition d'écran n'est pas reproduite dans ce mandat.

Analyse reproductible et mesures : `hybrid-evidence/asset-analysis.json`.

## B. Architecture hybride exacte

- FRAME et géométrie W3 inchangés.
- Halo externe : wrapper Animated et trois disques existants ; seules les opacités de matière sont atténuées pour le Master.
- Matching : orbite et point existants, même horloge et même mouvement.
- CORE : wrapper Animated existant, contenant une seule `Image` statique locale, puis la signature runtime au-dessus.
- Signature : même JSX, même géométrie, mêmes interpolations et profils qu'au candidat parent.

`RafiCoreMaterial` ne possède ni horloge, ni effet, ni calcul de texture. La respiration et l'impulsion success transforment le parent commun ; l'image suit donc le core sans animation interne. `fadeDuration=0` évite une transition implicite au chargement de l'image Android.

Les blocs effet/lifecycle et interpolation de `RafiOrb` sont identiques octet pour octet au parent. Presence Engine, huit états, success latch, AppState/focus, Reduced Motion, mappings Client/Artisan et labels sont inchangés. Aucun changement de composer.

Fallback temporaire : `materialMode="procedural"` est une option interne de comparaison, sans commande utilisateur. Une erreur de chargement de l'image active également le fallback automatiquement, une seule fois, dans la même instance ; le parent Animated reste monté. Une seule matière et une seule signature sont rendues. Ce chemin est testé par une réponse image HTTP 404 dans la fixture, et le mode procédural est visible dans la comparaison avant/après.

Halo Master uniquement, RGB champagne `198,174,132` :

| Alphas extérieur / milieu / intérieur | Parent procédural | Hybride |
|---|---|---|
| Medium | `.060 / .085 / .13` | `.035 / .050 / .070` |
| Hero | `.080 / .11 / .16` | `.045 / .065 / .090` |

Le halo conserve toutes ses amplitudes, opacités animées et durées. Le fallback conserve la palette précédente. Compact ne change pas.

## C. Fichiers modifiés

Application :

- `mobile/assets/rafi/rafi-master-core-v1.png` — asset original.
- `mobile/ui/RafiCoreMaterial.tsx` — couche statique, cadrage et ancien matériau procédural.
- `mobile/ui/RafiOrb.tsx` — sélection de matière, fallback sur erreur, palette de halo Master.
- `mobile/ui/tokens.ts` — alphas de halo Master uniquement.

Vérification : `tests/fixtures/rafi-visual.tsx`, `tests/rafi-visual-check.cjs`, `tests/fixtures/prepare-rafi-visual.cjs`, `tests/fixtures/prepare-shell-visual.cjs`, `tests/shell-visual-check.cjs`, `tests/shell-render.test.ts`. Les adaptations Shell concernent uniquement le chargement PNG dans les fixtures ; assertions W2 conservées.

Documentation : ce rapport, les pointeurs d'état dans REVIEW / VISUAL-REVIEW / RENDERER-DECISION, et `hybrid-evidence/`.

Diff nul par rapport au parent sur toutes les routes, composants, `mobile/lib`, Presence Engine, lifecycle partagé, profils motion, dépendances/configuration, workflows, API et Supabase. Les deux pages mission et MissionEvidenceCapture restent également identiques à la base W2, vérifiés par les contrats existants. Voir `hybrid-evidence/scope-review.json`.

## D–E. Hero 96, Medium 76, Compact 44

Hero : conteneur de core **96 px réels**, frame 144 px conservé. La silhouette utile occupe environ 95 px de large, sans les anciennes marges de l'asset. Le reflet supérieur droit et les reflets chauds latéraux restent lisibles après réduction, avec un centre noir profond qui laisse respirer l'arc runtime.

Medium : même source et même identité à 76 px, halo un peu plus discret. Lisibilité conservée dans le cockpit Artisan et dans les huit états.

Compact : matériau procédural conservé, aucun chargement d'image dans cette instance. La capture réelle Drawer est identique octet pour octet à celle du candidat parent ; frame 55 px, hôte W2 inchangé. La précision et la discrétion de cette version sont adaptées à 44 px.

## F. Bundle, mémoire et couches

| Mesure | Résultat |
|---|---|
| Dépendances / horloges / wrappers animés ajoutés | **0 / 0 / 0** |
| Texture | 1 230 × 1 278 RGBA |
| Mémoire RGBA théorique pleine définition | **6 287 760 octets ≈ 6,00 Mio**, par texture décodée |
| PNG embarqué | **1 110 997 octets**, une seule copie dans l'export |
| JS exporté | 1 820 867 octets brut / 488 254 gzip |
| Delta JS face au parent | **+1 733 octets brut / +513 gzip** |
| Export complet | 3 343 070 octets, contre 2 230 340 |
| Delta total export | **+1 112 730 octets**, principalement le PNG |
| Matière Hero | 4 gradients statiques → 1 Image : **−3 primitives** |
| Matière Medium | 3 gradients statiques → 1 Image : **−2 primitives** |
| Matière Compact | 1 gradient → 1 gradient : inchangé |

Toujours 3 wrappers Animated ordinaires, 4 en matching ; une valeur/horloge maximum par présence animable. Zéro horloge Compact, Reduced Motion, background ou sans focus. Aucun traitement texture par frame, Skia ou Reanimated. Le sous-composant matériau n'ajoute pas de View enveloppante.

Le comptage concerne les primitives de rendu déclarées ; ce n'est pas une mesure des couches GPU natives. Décodage, mémoire effectivement allouée, partage de cache et consommation sur appareil restent à mesurer lors du hardening/certification physique autorisés après W8. Le coût de stockage du PNG n'est pas masqué dans le seul delta JavaScript. Voir `hybrid-evidence/bundle-impact.json`.

## G. Preuves visuelles déterministes

- [Hero 96](hybrid-evidence/rafi-master-hero-96.png)
- [Medium 76](hybrid-evidence/rafi-master-medium-76.png)
- [Compact 44](hybrid-evidence/rafi-master-compact-44.png)
- [Client réel](hybrid-evidence/rafi-master-client.png)
- [Artisan réel](hybrid-evidence/rafi-master-artisan.png)
- [Huit états, 390](hybrid-evidence/rafi-master-states-390.png)
- [Reduced Motion](hybrid-evidence/rafi-master-reduced-motion.png)
- [Avant / après Hero](hybrid-evidence/rafi-before-after-hero.png)

Les vues détail/comparaison gardent les tailles CSS 96/76/44 et utilisent une densité ×3, sans agrandir la taille logique du renderer. Chargement/décodage PNG attendu avant chaque capture. Deux captures espacées de frames sont comparées pour confirmer les poses stables.

Compléments : états 320, Client/Artisan 320, Drawer, composer et texte ×2. Les routes Client/Artisan sont leurs vrais exports, avec frontières de session/services isolées à vide ; aucune requête backend ni mission inventée. Les PNG sont statiques par Reduced Motion ou `active=false`. Les mouvements normaux sont testés séparément avec le vrai Animated RN Web. Aucun screenshot pris au milieu d'une transition.

## H. Tests et gates

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:contracts` | **61 PASS**, 0 fail/skip |
| `npx expo-doctor@1.20.4` | **18/18 PASS** |
| `npm run gate:a` | PASS, export web uniquement |
| `git diff --check` | PASS avant commit |
| RAFI browser | **12 scénarios principaux**, 0 erreur JS, 0 requête externe |
| Shell W2 browser | **8 combinaisons Client/Artisan × 320/390 × Reduced Motion**, plus legacy et texte ×2 : PASS |
| Composer | Écrire/focus, micro démarrer/arrêter, photo/MIME, permissions refusées, cibles et texte ×2 : PASS |
| Lifecycle | Success unique et stable sans replay, AppState, focus, Reduced Motion, cleanup et Compact sans horloge : PASS |
| Échec image | Retour automatique au procédural, une seule signature : PASS |

Amplitudes listening, attention, matching et success mesurées en runtime après intégration ; profils identiques au parent. Les logs, résultats détaillés et manifeste des PNG sont dans `hybrid-evidence/`. Revue React Best Practices : composant de matière déclaré au niveau module, callback d'erreur stable, aucun rendu React par frame, cleanup inchangé, image décorative masquée à l'accessibilité, label porté par la présence parente.

CI **Mobile Gate A du nouveau SHA** : résultat exact et lien inscrits dans la description de PR après publication. Aucun résultat CI du parent n'est utilisé pour certifier ce nouveau commit.

## North Star gate

**« À 96 px dans l'interface réelle, RAFI évoque-t-elle désormais l'objet physique premium de la North Star ? »**

**OUI.** Après inspection du Hero à sa taille réelle dans Client, de Medium dans Artisan, des huit états et de l'avant/après, les reflets courbes, le centre noir et le rim chaud produisent désormais un volume physique convaincant. Le halo externe reste doux et contenu, l'arc runtime garde sa lisibilité et son indépendance, et aucun fond rectangulaire ne casse l'intégration. L'identité est cohérente avec la référence North Star consultée, sans couleur néon ni effet gaming.

**PASS W3 VISUAL REVIEW — NORTH STAR CERTIFIED**

Cette certification visuelle concerne le renderer hybride W3 dans les layouts actuels. Elle n'est ni une refonte Client/Artisan, ni une certification physique Android/iOS, ni un postmerge PASS.

## I–J. Livraison et limites du mandat

Nouveau SHA candidat / état distant exact / CI : consignés dans la PR #146. PR à maintenir **ouverte, Draft, non mergée**, vers `feat/fixeo-mobile-m4-terrain`. Base canonique attendue : `3a809035ffea579e1f18798bf5493c2022f0b58e`. MAIN attendu : `f8e59d5ad7294dd5493bf7b0219740248d2a8d64`.

Aucun merge, aucun build physique, aucun W4. Premier build physique seulement après **W8 CLOSED — POSTMERGE PASS** : **BUILD PHYSIQUE #1 — FIXEO MOBILE WOW RC CANDIDATE** ; W9 sera la certification physique complète. Une autorisation distincte reste nécessaire pour la fermeture W3.
