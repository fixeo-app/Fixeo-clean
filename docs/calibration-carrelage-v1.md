# Carrelage — pilote national validé

Validation du propriétaire : deux propositions, déploiement dans les 20 villes FIXEO. Catalogue `tile-pilot-v1`, calcul `vap-bp33-v1`.

| Prestation | VAP artisan | Commission FIXEO | Prix client hors fournitures |
|---|---:|---:|---:|
| Remplacement local de 1 à 4 carreaux de sol | 300 MAD | 60 MAD | 360 MAD |
| Pose droite de 10 m² | 500 MAD | 75 MAD | 575 MAD |
| Pose droite de 20 m² | 1 000 MAD | 150 MAD | 1 150 MAD |
| Pose droite de 30 m² | 1 500 MAD | 225 MAD | 1 725 MAD |

Pose : VAP 50 MAD/m², surface réelle de 10 à 30 m², deux décimales maximum. Calcul en centimes puis commission progressive BP3.3. Aucun arrondi au m² supérieur. En dehors des limites, devis : pas de forfait extrapolé.

## Périmètre contractuel

Sol intérieur, support sain, sec, stable et prêt. Carreaux standards ≤ 60 × 60 cm. Client fournissant les carreaux adaptés (identiques pour remplacement), la colle et les joints compatibles en quantité suffisante. Ces fournitures ne sont ni vendues ni encaissées dans le forfait (materials_minor = 0).

Main-d’œuvre, outillage, déplacement dans la ville sélectionnée, pose, joints standards, retour nécessaire pour réaliser les joints après séchage, nettoyage et regroupement des petits gravats sur place inclus. Pour le remplacement : dépose locale des carreaux concernés incluse. Pour la pose : aucune dépose incluse. Zone dégagée et accessible, eau et électricité disponibles.

Hors forfait : support endommagé, ragréage, humidité, étanchéité, murs, escaliers, plinthes, marbre, zellige, mosaïque, motifs, évacuation hors site, fournitures manquantes et travaux supplémentaires. Aucun supplément automatiquement ajouté ; qualification/devis nécessaire.

## Réservation et dispatch

Les deux services conservent `carrelage` comme catégorie. La confirmation VAP lie l'offre immuable à la demande ; les triggers existants propagent montant client et commission à la mission et protègent le règlement. Les demandes de devis carrelage conservent également cette catégorie dans le formulaire et l'API.

Inspection de production : 10 profils catégorisés Carrelage. Les moteurs de dispatch existants acceptent cette correspondance exacte ; pas de reclassement vers maçonnerie ou autre. L'activation tarifaire nationale ne garantit pas un carreleur disponible dans chaque ville.

## Vérifications

Tests : 40 combinaisons forfait/ville, bornes, surfaces décimales, fournitures manquantes, réponses inconnues, quantités invalides, villes non approuvées, conservation du montant et de la commission. Le test PostgreSQL isolé utilise la définition du dispatch de production au 21/09/2026 : un maçon mieux noté n'est pas choisi à la place d'un carreleur.

Pas de demandes client ni de missions créées pour les contrôles de production. Les tarifs sont des prix pilotes validés par FIXEO, pas des coûts moyens démontrés par des interventions terrain. Suivre durée réelle, consommables disponibles, retours pour joints et acceptation artisan avant élargissement du périmètre.
