# PB1 Final Correction — RAFI MASTER LOOP V1

Périmètre : corrections de l’audit Android PB1, branche `feat/fixeo-mobile-w6-entry-auth-trust`, PR #150 ouverte / Draft / non mergée. Checkpoint de départ : `04569139234fe760c14d407302dd73846cc54883`. Aucun changement Main ou Production. Un seul nouveau build final, après CI verte et gel logiciel.

## Source canonique et fichiers runtime

`RAFI_MASTER_LOOP_V1.mp4`, fourni et certifié visuellement par le propriétaire : H.264, 1440 × 1440, 24 images/s, 217 images, 9,041666667 s, sans alpha. SHA-256 : `248147026d95a171ebafc650d1f476c46cde7013d8d90997d9ffb16013b1ea2a`.

La boucle n’a pas été modifiée. Aucun optical flow, aucune interpolation temporelle, aucun changement d’ordre, de vitesse ou de respiration, aucune génération. La rotation reste celle apparente de la source ; aucune certification géométrique 360° ni face cachée inventée.

Fichiers sous `mobile/assets/rafi/master-loop-v1/` :

| Fichier | Dimensions | Format / alpha | Cadence / durée |
|---|---|---|---|
| rafi-hero.webp | 448 × 448 | WebP animé RGBA, qualité 92 | 217 images, 9,042 s, boucle infinie |
| rafi-medium.webp | 256 × 256 | WebP animé RGBA, qualité 92 | identique |
| rafi-mini.webp | 128 × 128 | WebP animé RGBA, qualité 92 | identique |
| rafi-hero-poster.png | 448 × 448 | PNG RGBA | première image fixe |
| rafi-medium-poster.png | 256 × 256 | PNG RGBA | première image fixe |
| rafi-mini-poster.png | 128 × 128 | PNG RGBA | première image fixe |
| rafi-launcher.png | 1024 × 1024 | PNG RGBA | icône issue de la même première image |
| manifest.json | — | métadonnées / durées / matte | aucune donnée photo utilisateur |

WebP exprime les durées en millisecondes entières : alternance 41/42 ms, erreur totale +0,333 ms sur la boucle. Toutes les images restent présentes. Pas de crossfade à la répétition ; raccord certifié de la source conservé.

Le détourage suit le bord réfléchissant par contour radial régularisé. L’intérieur reste opaque, indépendamment de sa couleur noire. Le fond neutre extérieur est estimé spatialement ; seul le halo champagne de la source est conservé autour du contour. Réduction en alpha prémultiplié, puis stockage RGBA droit. Aucun Screen/Add sur le cœur. MINI reçoit une correction spatiale de luminosité de +8 % pour préserver sa lisibilité ; aucun mouvement ajouté.

Reproduction : `python scripts/rafi/derive_master.py docs/w6/pb1-final-correction/RAFI_MASTER_LOOP_V1.mp4 /tmp/rafi-runtime-v1` depuis `mobile`. Vérification indépendante : `python scripts/rafi/verify_runtime.py`. Le rapport `asset-qa.json` décode toutes les images et compare matière, ordre temporel, contour et raccord à la source.

## Intégration native

`RafiOrb` conserve les labels accessibles et les signaux métier. Son rendu unique est `RafiMasterLoop` / `expo-image` 3.0.11. HERO à partir de 92 dp de diamètre, MEDIUM de 59 à 91 dp, MINI jusqu’à 58 dp. Le carré d’affichage vaut 1,5 × le diamètre afin de réserver le halo. Le shader historique n’est plus importé par le rendu RAFI de l’application.

La lecture native n’utilise aucun timer d’animation JS. Chargement animé seulement après visibilité effective ; pas de décodage du master 1440. Pause sur perte de focus, sortie du viewport et background. Reduce Motion et erreur de décodage utilisent la première image canonique. `autoplay=false`, `cachePolicy=none`, pas de transition visuelle au chargement. Le contrôleur sérialise les appels natifs et empêche un chargement tardif de redémarrer après démontage.

Poids compressés : HERO 9 349 814 octets, MEDIUM 4 008 410, MINI 1 462 898. Une image RGBA décodée représente respectivement 802 816 / 262 144 / 65 536 octets. Ce ne sont pas des mesures du heap Android : décodeur, buffers et textures ajoutent leur propre coût. Ne pas pré-décoder les 217 images ni employer une spritesheet géante. Une future interaction tactile doit rester indépendante de la chronologie IDLE validée ; aucune nouvelle animation tactile n’est introduite ici.

## Corrections de l’audit

- Vision Mobile : instructions séparant visible, déclaré, hypothèse et incertitude ; garde déterministe limitée au cas de la prise inutilisée, sans symptôme déclaré, dommage visible ou signal de sécurité. Les dangers positivement établis restent conservés.
- Copilot : agenda/today commun au français, Darija arabe, Darija latine/Arabizi et code-switching ; réponse sur les rendez-vous disponibles avant navigation, heure Maroc, distinction agenda vide / indisponible. Les commandes françaises de création gardent leurs formulaires et confirmations.
- Commande exécutée ou annulée consommée ; texte actionnable et proposition vidés, double navigation empêchée, résultats asynchrones périmés ignorés.
- CTA partagés avec fond/contour explicites ; rythme Page Shell partagé Client/Artisan ; réserve dock mesurée + safe area + 24 dp ; placeholders métriques plus discrets.
- Registre métier unique `api/diagnostic/cities.json`, projection Mobile générée, 21 villes dont Martil, Fès/Tétouan/Kénitra/Témara canoniques. Liste complète défilante et recherche sans accents.
- Migration STAGING strictement nécessaire : Martil accepté et Témara canonique dans quatre fonctions existantes ; contrainte diagnostic alignée. Corps métier, ACL, SECURITY DEFINER et search_path conservés. `city-staging-proof.json` : empreintes normalisées identiques, aucun nouvel avis de sécurité, aucune mutation Auth ou donnée métier.
- Vercel : branche Mobile explicitement désactivée pour déploiement Git automatique, y compris relay ; aucune Preview UI requise.

## Gates logiciels reproductibles

Résultats locaux : 156 tests Mobile PASS, 207 tests Server PASS, TypeScript PASS, lint zéro erreur (7 avertissements préexistants), Expo Doctor 18/18, export Android Hermes PASS, décodeur/alpha/chronologie RAFI PASS. Les tests historiques GLES passent aussi, sans prétendre qu’ils représentent le nouveau moteur RAFI.

CI : les mêmes tests, lint, vérification de chaque image RAFI et export Android Hermes sont requis dans Mobile Gate A. L’export produit du JavaScript/Hermes et des assets, aucun APK ni build EAS intermédiaire. Les preuves CI finale, backend déployé, SHA gelé et identifiant du seul nouveau build sont consignés dans la PR après exécution.

Tests : contrats Auth Client/Artisan, navigation, permissions, photo réelle jusqu’à la frontière fournisseur, preview/remplacement/suppression, disponibilité et garde onboarding, agenda, devis, finance, mutations serveur, requêtes concurrentes, provenance Vision, Darija/FR, composants natifs simulés, 30 cycles de navigation/lecture/pause/démontage, CTA et sélecteur complet.

## Re-certification physique sur le seul APK final

Statut : **PHYSICAL RE-CERTIFICATION REQUIRED**. Aucun PASS PHYSICAL émis.

| Contrôle | Preuve logicielle | Contrôle Android restant |
|---|---|---|
| RAFI HERO/MEDIUM/MINI | RGBA, 217 images, cœur/halo, cadre fixe, lecture native et pauses | volume, lisibilité MINI, continuité sur plusieurs minutes, rythme perceptible |
| Performance | décodage complet des fichiers sur hôte ; cycle de vie et cleanup automatisés | FPS réel, CPU/GPU, mémoire après navigation répétée, autonomie |
| Vision | image réelle sanitizée transmise à la frontière fournisseur, contrats et calibration | session utilisateur existante + modèle réel sur prise vide et autres scènes |
| Voice | Darija/FR et données agenda, consommation après exécution/annulation | ASR Darija/FR → réponse → action dans les conditions du téléphone |
| UI | boutons rendus, taille cible, shell partagé, réserve dock | petit écran, grand texte, clavier, dernier CTA, contraste et métriques |
| Parcours précédemment PASS | régressions Auth, photo, disponibilité, agenda, devis, finance, missions, notifications, opportunités | réexécution de l’audit après installation |

Profil final : `w6-physical-certification`, environnement EAS `preview`, application STAGING uniquement, package `ma.fixeo.app`, version 0.3.0, versionCode 7. Aucun merge ni changement Production autorisé.
