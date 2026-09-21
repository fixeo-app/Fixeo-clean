# Peinture intérieure — pilote VAP BP3.3

Validé par FIXEO le 21 septembre 2026. Tarif propriétaire, non encore validé par des missions terrain.

## Prix et périmètre

`peinture.mur_interieur.labour_only` : 30 MAD/m² pour l’artisan, plus frais progressifs FIXEO BP3.3. Surface réelle de murs de 20 à 100 m², deux décimales maximum. Deux couches incluses : ne pas doubler la surface. Ouvertures déduites ; aucune conversion automatique depuis la surface du logement.

Exemples : 20 m² = 600 + 90 = 690 MAD ; 40 m² = 1200 + 180 = 1380 MAD ; 60 m² = 1800 + 270 = 2070 MAD ; 100 m² = 3000 + 400 = 3400 MAD. 20,25 m² = 607,50 + 91,13 = 698,63 MAD.

Murs intérieurs secs, sains, prêts à peindre, sans enduit ni ponçage à réaliser ; teinte identique ou proche ; hauteur ≤ 2,80 m ; zone dégagée, eau et électricité disponibles. Peinture compatible et suffisante pour deux couches fournie par le client. Protection, outillage, déplacement en ville, retours nécessaires au séchage et nettoyage inclus.

Humidité active : arrêt du chiffrage, résoudre la source avant peinture. Préparation, fissures, fournitures à acheter, changement marqué de couleur, effets décoratifs, plafonds et façades : devis. Les anciens codes avec fournitures/plafond/préparation sont convertis en devis ; le forfait minimum isolé est retiré des propositions. Aucune ancienne formule à 800 MAD ne s’ajoute au nouveau calcul.

## Parcours et vérifications

Six questions : humidité, support, accès, peinture disponible, finition, surface. Aide au calcul dans le champ de surface. Mêmes gardes appliqués au moteur et au registre d’offres signées, dans les 20 villes. Les surfaces invalides, les réponses manquantes et les villes non approuvées ne produisent pas d’offre VAP.

68 tests passent, dont les cinq nouveaux tests peinture : progression des questions, 20 villes, bornes et décimales, fournitures client, exclusion des anciens tarifs, confirmation idempotente, affectation Peinture, règlement à 698,63 MAD et frais 91,13 MAD. Réservation/règlement testés avec PGlite uniquement, sans demande ou mission en production.

Aucune migration de base : la confirmation VAP accepte déjà le métier peinture. Les missions historiques restent inchangées.

Message de commit : `feat(pricing): calibrate interior wall painting with scoped VAP pricing`
