# W3 — décision renderer, avant ajout de dépendance

Base auditée : `3a809035ffea579e1f18798bf5493c2022f0b58e`.

Spike d'architecture sur le renderer réel : 8 Views (4 Animated), 3 valeurs Animated, 2 boucles simultanées dès idle, 1 séquence success additionnelle. À 44 px, le frame actuel vaut 65,12 px pour un logement Drawer de 56 px ; le halo success peut atteindre 75,47 px pour ce frame. La matière est constituée d'aplats, d'un cercle et d'un reflet carré arrondi. Aucun arrêt AppState/focus. Pas de mesure CPU/batterie native possible sans le build interdit dans ce mandat.

| Option | Budget proposé | Décision |
|---|---|---|
| Animated + Views natives seules | Une valeur/horloge ; opacité et transform uniquement | Retenu pour le mouvement. Les aplats actuels et anneaux concentriques ne donnent pas le reflet continu recherché. |
| Reanimated ~4.1.1 (compatibilité relevée dans Expo 54 installé) | Worklets pour la même animation de transform/opacity | Non ajouté : aucun geste pilotant l'Orb ni donnée audio par frame ; Animated possède déjà le driver natif requis. |
| Animated + expo-linear-gradient ~15.0.8 | Trois dégradés statiques medium/hero, un compact ; aucune couleur animée | Retenu pour la matière : bord éclairé et noyau graphite/noir continus. Le wrapper seul est animé. |
| Skia / Lottie / WebGL / 3D | Runtimes supplémentaires | Non nécessaires, non ajoutés. |

La version gradient provient de `expo/bundledNativeModules.json` local et de la [documentation Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/linear-gradient/), qui documente Android/iOS/Web. Les contrôles de bundle/export/Doctor suivront après implémentation. Cette comparaison porte sur le graphe d'animation et le rendu requis ; elle ne prétend pas être un benchmark matériel.

Cible : une horloge native au maximum par Orb animée, aucune horloge compact/Reduced Motion/background/hors focus, un listener AppState partagé entre les Orbs animables, nettoyage de toutes les subscriptions. Success ne possède pas de boucle ; l'événement est consommé même si l'animation est suspendue. Frame compact 55 px pour size 44, contenu dans le logement W2 inchangé.

## Addendum — polish visuel ciblé

Architecture conservée. Un quatrième gradient **statique**, uniquement Hero >=96, apporte un retour chaud au bord inférieur droit. Medium garde trois gradients, Compact un. Aucun wrapper animé, horloge ou dépendance supplémentaire. Détails et verdict dans [VISUAL-REVIEW.md](VISUAL-REVIEW.md).

## Addendum — Master Core V1 hybride

La matière Medium/Hero est désormais une seule Image PNG locale dans le wrapper Animated existant. Halo, orbit et signature restent runtime. Ancien matériau conservé en fallback interne/testable ; Compact reste procédural. Aucun moteur, dépendance, horloge ou wrapper animé supplémentaire. Mesures et certification visuelle actuelles : [HYBRID-REVIEW.md](HYBRID-REVIEW.md).
