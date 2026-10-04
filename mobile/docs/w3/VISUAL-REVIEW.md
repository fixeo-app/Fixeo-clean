# W3 — passe de polish RAFI / revue North Star

**Rapport historique du polish procédural.** Son STOP a été remplacé par la revue du renderer hybride : [HYBRID-REVIEW.md](HYBRID-REVIEW.md).

**STOP — RAFI NORTH STAR NOT REACHED**

Une passe ciblée sur le candidat `eb1776de080346632cdb4518887312caca3c71ef`, base canonique `3a809035ffea579e1f18798bf5493c2022f0b58e`. Le SHA publié et sa CI sont consignés dans la description de la PR #146 ; ce dossier appartient au nouveau commit candidat.

## A. Changements visuels exacts

- Halo champagne plus présent sur Medium 76 et Hero 96, même emprise et mêmes trois disques. Aucune nouvelle couleur de statut.
- Noyau `#08090B` conservé ; graphite et bord supérieur éclaircis, dégradé diagonal plus étendu et reflet chaud repositionné. Les reflets trop découpés du premier essai ont été atténués avant les captures livrées.
- Signature oblique plus large, plus lumineuse et plus épaisse ; son enveloppe lumineuse est resserrée (2,1 fois le trait, contre 4 auparavant). La hauteur relative et l'inclinaison restent les mêmes ; aucun visage ajouté.
- Hero >=96 : palette de halo/reflet plus présente et un retour chaud statique au bord inférieur droit. À 96, signature de 37,44 px de large / 2,40 px de trait, contre 31,68 / 1,536 auparavant. À 76 : 27,36 / 1,748, contre 25,08 / 1,30.
- Compact 44 : palette, géométrie et couches conservées. Capture Drawer régénérée **identique octet pour octet** au candidat précédent ; frame 55 px dans son hôte W2 de 56 px.
- Seuls trois fichiers applicatifs changent : `ui/RafiOrb.tsx`, `ui/tokens.ts`, `ui/rafiOrbMotion.ts`. Aucune modification des routes Client/Artisan, Shell, composer, mission/evidence, navigation, auth, services ou backend dans cette passe.

## B. Tokens et paramètres

Les anciens tokens restent disponibles pour Compact. Les finitions Medium/Hero sont regroupées dans `rafiVisualTokens.finish`.

| Paramètre | Candidat précédent | Medium | Hero |
|---|---|---|---|
| Graphite éclairé | `#454548` | `#57595C` | idem |
| Graphite | `#26272A` | `#26282C` | idem |
| Rim / deepRim | `#71706D` / `#161719` | `#A29E94` / `#242629` | idem |
| Signature | `#F3E1BA` | `#FBE8BD` | idem |
| Glow signature | `rgba(218,189,139,0.18)` | `rgba(231,195,130,0.30)` | idem |
| Halo alpha extérieur / milieu / intérieur | `.035 / .055 / .10` | `.060 / .085 / .13` | `.080 / .11 / .16` |
| Reflet | `rgba(255,247,229,0.14)` | `rgba(255,237,207,0.38)` | `rgba(255,237,207,0.54)` |
| Retour chaud inférieur | absent | absent | `rgba(209,175,117,0.18)` |
| Largeur arc / diamètre | `.33` | `.36` | `.39` |
| Épaisseur arc / diamètre, minimum 1,3 px | `.016` | `.023` | `.025` |
| Hauteur arc / diamètre | `.19` | `.19` | `.19` |

RGB du halo toujours `198,174,132`. Durées, easing, opacités animées du halo et nombre d'horloges inchangés. Ajustements d'amplitude uniquement dans `rafiOrbMotion.ts` :

| État | Paramètres modifiés |
|---|---|
| listening | Pic core `1.022 → 1.032`, halo `1.06 → 1.08`, signature `1.10 → 1.12` |
| matching | Opacité orbite `.70 → .82`, période toujours 12 s |
| attention | Pic halo `1.035 → 1.065`, signature `1.04 → 1.065` |
| success | Pic halo `1.12 → 1.17`, signature `1.10 → 1.14`, séquence toujours 280 + 600 ms |

Les quatre autres profils restent inchangés. Une seule matière pour les huit états.

## C. Performance et runtime

- Toujours Animated + expo-linear-gradient ; **0 dépendance, 0 horloge, 0 wrapper animé supplémentaires**.
- Une valeur Animated, une horloge au maximum ; 3 wrappers animés usuels, 4 en matching. Les blocs effet/lifecycle et interpolation sont identiques octet pour octet au précédent candidat.
- Gradients statiques : Compact 1, Medium 3, Hero 4. Le seul ajout est le retour de lumière statique Hero, contenu dans le core déjà animé et clipsé. Petit coût de peinture/composition supplémentaire, non mesuré sur appareil.
- Export web : 1 819 134 octets brut / 487 741 gzip ; delta de cette passe **+1 083 brut / +338 gzip**. Face à W2 : +9 743 / +3 441. Détail dans `evidence/bundle-impact.json`.
- Les mesures DOM du vrai Animated RN Web confirment listening core `1 → 1.032`, halo `1 → 1.08` ; attention halo `1.02 → 1.065`, opacité `.86 → .98` ; matching rotation d'environ 42° en 1,4 s ; success halo `1 → 1.17` puis retour à `1` après la séquence. Voir `evidence/runtime-motion.json`.
- Succès consommé sans replay, pause background/focus, Reduced Motion, absence de boucle Compact et nettoyage des abonnements revérifiés. Aucune mesure GPU/batterie native revendiquée.

## D. Captures renouvelées

Les vrais composants RN Web sont capturés. Client/Artisan sont les exports réels des routes avec frontières de services isolées à vide, sans session staging ni accès backend. Les PNG stables emploient les poses de référence ou Reduced Motion ; les mouvements sont mesurés séparément en runtime.

- [États 390](evidence/rafi-states-390.png)
- [États 320](evidence/rafi-states-320.png)
- [Client](evidence/rafi-client-presence.png)
- [Artisan](evidence/rafi-artisan-presence.png)
- [Reduced Motion](evidence/rafi-reduced-motion.png)
- [Compact Drawer](evidence/rafi-compact-drawer.png)
- [Hero close-up](evidence/rafi-hero-closeup.png) : core **96 px CSS réels**, capture DPR 3, comparaison Medium 76 / Compact 44. Il ne s'agit pas d'un renderer agrandi à 288 px.

Les variantes Client/Artisan 320, composer et texte ×2 sont également renouvelées. Onze PNG au total, dimensions et SHA-256 dans `evidence/manifest.json`. La capture Compact reste identique après régénération.

## E. Gates

| Gate | Résultat local sur le contenu de ce commit |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:contracts` | 61 PASS, 0 fail/skip |
| `npx expo-doctor@1.20.4` | 18/18 PASS |
| `npm run gate:a` | PASS, export web demandé |
| `git diff --check` | PASS avant commit |
| Runner navigateur RAFI | 10 scénarios principaux + contrôles complémentaires ; 0 erreur JS, 0 requête externe |
| Périmètre / animation / Compact | PASS, `evidence/polish-scope.json` |

Les logs de ces gates et les preuves sont renouvelés. `shell-browser-results.json` reste la preuve historique du candidat parent ; la présente passe ne revendique pas une nouvelle exécution de ce runner séparé. Les routes et composants Shell sont inchangés, le vrai Drawer est revérifié par le runner RAFI.

CI **Mobile Gate A sur le nouveau SHA** : résultat et lien exact dans la description de PR après publication. Un succès CI ne certifie pas la North Star.

## F. North Star gate — jugement visuel

**« À 96 px, RAFI évoque-t-elle désormais la sphère iconique de notre North Star, ou encore un composant React Native sobre ? »**

**Encore un composant React Native sobre, désormais plus lumineux et mieux fini.** Le halo est perceptible et contenu, la signature est plus lisible, le noir reste profond et Hero gagne en présence. Mais le reflet diagonal garde une limite graphique visible ; le volume se lit encore trop comme un disque ombré. L'écart de matière Hero/Medium ne suffit pas à établir l'objet physique iconique demandé. La revue visuelle n'est donc pas certifiée.

**STOP — RAFI NORTH STAR NOT REACHED**

La passe ciblée s'arrête ici. Le candidat et ses preuves sont livrés en PR Draft pour décision produit ; aucune nouvelle architecture ni seconde refonte n'est engagée sous ce mandat.

## G. État et stratégie build

PR #146 conservée ouverte et Draft, aucun merge. Branche W3 uniquement. Aucun build physique, aucun W4. Base canonique et MAIN à relire inchangés avant et après publication.

Le premier build physique reste **BUILD PHYSIQUE #1 — FIXEO MOBILE WOW RC CANDIDATE**, uniquement après **W8 CLOSED — POSTMERGE PASS** ; W9 sera la certification physique complète. Ce verdict STOP n'autorise ni clôture visuelle W3 ni passage à W4.
