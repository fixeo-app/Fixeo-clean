# Peinture des murs avec fournitures — pilote validé

État au 21 septembre 2026 : **tarif et périmètre approuvés par FIXEO ; activation et déploiement autorisés**.
Branche : `feat/paint-supplies-vap-v1`. Base production : `3884863d638cba76e8aaae24aac968b23abfcb61`.
Service : `peinture.mur_interieur.all_in`. Version : `paint-supplies-pilot-v1`.

## Tarif validé

- Prestation artisan : **30 MAD/m²**, comme le pilote murs sans peinture déjà approuvé.
- Peinture fournie : **15 MAD/m² avec minimum de 450 MAD par intervention**.
- Frais FIXEO BP3.3 calculés exclusivement sur la prestation artisan. Aucun frais FIXEO sur les fournitures.
- Surface réelle de murs comprise entre 20 et 100 m², deux décimales maximum. Portes et fenêtres déduites ; deux couches ne doublent pas la surface. Aucun calcul à partir de la surface au sol.
- Même tarif dans les 20 villes du catalogue ; cela ne garantit ni stock fournisseur ni disponibilité partenaire.

Formule : `total client = 30 × surface + max(450, 15 × surface) + frais BP3.3(30 × surface)`.
Les composantes et les frais sont arrondis séparément au centime, au plus proche, demi-centime vers le haut. Le minimum de 450 MAD est celui des fournitures ; il ne s’ajoute pas à leur montant calculé. L’ancien minimum peinture de 800 MAD reste désactivé.

| Surface réelle | Artisan | Fournitures | Frais FIXEO | Total client |
|---|---:|---:|---:|---:|
| 20 m² | 600,00 | 450,00 | 90,00 | **1 140,00 MAD** |
| 20,25 m² | 607,50 | 450,00 | 91,13 | **1 148,63 MAD** |
| 30 m² | 900,00 | 450,00 | 135,00 | **1 485,00 MAD** |
| 30,01 m² | 900,30 | 450,15 | 135,05 | **1 485,50 MAD** |
| 40 m² | 1 200,00 | 600,00 | 180,00 | **1 980,00 MAD** |
| 60 m² | 1 800,00 | 900,00 | 270,00 | **2 970,00 MAD** |
| 66,67 m² | 2 000,10 | 1 000,05 | 300,01 | **3 300,16 MAD** |
| 100 m² | 3 000,00 | 1 500,00 | 400,00 | **4 900,00 MAD** |

L’artisan conserve la prestation artisan et le forfait fournitures après reversement des frais FIXEO. Cette somme n’est pas son bénéfice : il achète la peinture et supporte ses coûts. Le forfait fournitures est un prix commercial validé, incluant achat, conditionnement, pertes et acheminement ; ce n’est pas un remboursement au coût réel. Les outils, protections et consommables déjà inclus dans la prestation artisan ne sont pas facturés une deuxième fois.

## Produit et chantier inclus

Deux couches de **Colorado Colovinyl 900 blanc mat**, en quantité suffisante, sur murs intérieurs déjà peints en blanc ou blanc cassé très clair, mats, lisses, secs, sains et compatibles avec une peinture à l’eau. Support prêt à repeindre, sans lessivage, enduit, ponçage ni sous-couche nécessaires. Hauteur maximale 2,80 m ; sol plat et stable, zone dégagée, eau et électricité disponibles, aucun escalier ni accès spécial.

L’artisan apporte des pots identifiables et laisse le reliquat au client. Protection, outillage, déplacement dans la ville choisie, achat et acheminement de la peinture, retours nécessaires au séchage et nettoyage sont inclus. Le produit et sa disponibilité doivent être confirmés par le partenaire avant acceptation ; compatibilité et adhérence du support à vérifier avant application. Produit indisponible ou support incompatible : requalification et devis, aucun remplacement ni supplément automatique.

Les plafonds, façades, teintes, satin, effets décoratifs, exigence de peinture lessivable, passage d’une couleur soutenue au blanc, fissures, taches, écaillage, préparation et sous-couche restent sur devis. L’humidité active arrête le chiffrage. Une réponse incertaine ne permet pas de forfait.

## Références consultées et limites

La [fiche Colorado, édition décembre 2025](https://www.colorado.ma/sites/default/files/documents/colovinyl_900_eng_dc28g_2025.pdf), consultée le 21 septembre 2026, décrit un blanc mat, un rendement de 7 à 9 m²/kg par couche et un délai de recouvrement de quatre heures dans les conditions indiquées. Conditionnements : 1, 5, 10, 30 et 45 kg. Le système complet présenté comprend une préparation et une impression : les supports qui en ont besoin sont exclus de ce pilote de remise en peinture. La fiche ne justifie pas une promesse commerciale de finition lessivable.

La [fiche Bricoma Colovinyl900, SKU 111768](https://www.bricoma.ma/vinylastral-blanc-1.html), consultée le 21 septembre 2026, affiche **439 MAD pour 30 kg**, blanc. Malgré le nom de l’URL, le titre, la marque et les caractéristiques identifient Colovinyl900. Les stocks varient selon le magasin et la livraison en ligne est facturée séparément. C’est une référence de détail ponctuelle, pas un accord fournisseur ni une garantie de prix national. Le minimum proposé de 450 MAD est supérieur de 11 MAD à ce pot repère ; l’approvisionnement local reste à confirmer.

Hypothèse interne de consommation, non garantie fabricant : borne prudente de 7 m²/kg/couche, deux couches et 10 % de pertes, soit `surface × 2 / 7 × 1,10` kg avant arrondi aux pots disponibles.

| Surface | Quantité calculée avec pertes | Exemple d’achat au conditionnement repère | Coût repère avant transport | Forfait validé |
|---|---:|---:|---:|---:|
| 20 m² | 6,29 kg | 1 pot de 30 kg | 439 MAD | 450 MAD |
| 40 m² | 12,57 kg | 1 pot de 30 kg | 439 MAD | 600 MAD |
| 60 m² | 18,86 kg | 1 pot de 30 kg | 439 MAD | 900 MAD |
| 100 m² | 31,43 kg | 2 pots de 30 kg | 878 MAD | 1 500 MAD |

Ces exemples vérifient les besoins et les pots complets au prix observé ; ils ne prescrivent pas d’acheter le plus gros format. Des formats adaptés peuvent limiter le reliquat. La provision de 15 MAD/m² et son minimum sont un tarif pilote validé par FIXEO, à confronter aux missions terrain, pas un prix de marché établi. Les achats et temps d’approvisionnement réels restent inconnus.

L’ancien PEIN-003 à 65 MAD/m² était un total client issu d’un autre périmètre et d’un autre modèle de commission. Il n’a pas été repris comme rémunération artisan. L’ancienne estimation de fournitures incluait sous-couche, enduit et usure d’outils ; elle ne convient pas à ce nouveau périmètre.

## Intégration et contrôle d’activation

Six questions : humidité, état des murs, accès, acceptation du produit, deux couches blanches, surface réelle. L’option apparaît dans « Repeindre une pièce » sur la branche de préparation. Le résumé et la ventilation affichent les fournitures et leur minimum, sans demander au client d’acheter la peinture.

Le calcul partagé accepte désormais une composante fournitures proportionnelle à une quantité, avec minimum. Le calcul en centimes reste séparé de la commission. Les anciennes prestations à fournitures fixes conservent leur comportement, notamment les modèles jardinage qui omettaient le champ fournitures.

Le propriétaire a validé le tarif et le périmètre en répondant « oui je valide » à la demande d’activation sur fixeo.ma, le 21 septembre 2026.

Les vingt entrées sont désormais `approved: true` avec `OWNER_APPROVED`. Les indicateurs `production_ready`, `active_in_estimator` et `active_in_reservation` sont vrais et la provenance est `FIXEO_OWNER_APPROVED_PILOT`. Le catalogue réel est utilisé dans les tests ; un scénario désactive temporairement les entrées en mémoire pour vérifier le refus d’une offre non approuvée, puis restaure leur état.

La PR 37 porte l’activation autorisée. Les références du script client utilisent `paint-supplies-pilot-v1` pour renouveler le cache lors du déploiement. L’état effectif du déploiement et les contrôles en ligne sont consignés dans cette PR après publication.

Aucune migration SQL : les offres existantes conservent déjà les composantes prestation, fournitures et commission. Aucun appel de réservation, dispatch, règlement, commande de peinture ou notification en production.

## Vérifications

Résultat après activation du 21 septembre 2026 : **84 tests réussis, aucun échec** dans la suite complète de l’estimateur, avec le catalogue réellement approuvé. Les deux rapports JSON protégés sont inchangés, tout comme les tarifs approuvés des autres prestations.

Le parcours testé couvre les montants dans les vingt villes, le minimum fournitures à 30 m², la frontière de commission à 66,67 m², les centimes, les réponses manquantes ou incompatibles, l’humidité, les mesures invalides, les villes inconnues et le refus d’une offre non approuvée. L’API réelle est exercée avec réseau simulé ; l’interface est rendue dans un DOM. PostgreSQL local vérifie confirmation, idempotence, affectation Peinture, conservation des frais au règlement et refus de modification des montants.

Commande : `NODE_PATH=<dépendances de test> node --test tests/estimator/*.test.cjs` avec PGlite 0.3.14 et jsdom 26.1.0.

Commit de préparation : `feat(pricing): prepare supplied wall painting tariff for approval`

Commit d’activation : `feat(pricing): activate approved supplied wall painting tariff`
