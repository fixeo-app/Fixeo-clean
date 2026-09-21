# Déménagement : manutention sans camion

Tarif pilote validé par le fondateur le 21 septembre 2026. Pas encore validé par des missions terrain.

- Code : `demenagement.manutention_2h`.
- 2 intervenants pendant 2 heures sur un même site, à compter du début sur place.
- VAP de 600 MAD pour toute l’équipe, frais FIXEO de 90 MAD, total client de 690 MAD.
- Les 20 villes du registre partagent ce forfait. La disponibilité de l’équipe reste à confirmer ; la présence d’un profil dans l’annuaire ne prouve pas une capacité de deux personnes.
- Un professionnel responsable de la mission doit fournir les deux intervenants. La VAP n’est ni un prix par personne ni un salaire net.
- Déplacement de l’équipe dans la ville inclus. Affaires emballées/protégées et meubles vidés par le client ; appareils débranchés ; accès dégagé au rez-de-chaussée ou ascenseur adapté, sans portage en escalier ; véhicule à proximité si nécessaire.
- Pas de camion, transport, emballage, démontage/remontage, objets exceptionnellement lourds ou fragiles, piano, coffre-fort ni levage.
- Forfait de temps, sans promesse de terminer un déménagement complet. Aucun supplément ni prolongation automatique ; prestation supplémentaire à convenir séparément avant réalisation.

## Parcours

Le chargement/déchargement propose ce forfait et une alternative devis. Les cinq autres situations de découverte restent sur devis : appartement, transport de meubles, objet lourd, démontage/remontage, bureau. L’entrée directe du métier propose également le forfait.

Cinq questions obligatoires : tâche, accès, objets, préparation, durée/équipe. Toute réponse complexe ou inconnue exclut le prix fixe. Le serveur vérifie les mêmes conditions avant de créer l’offre tarifaire immuable.

La confirmation ajoute uniquement `demenagement` à la liste de métiers VAP acceptés et préfixe la description opérationnelle du forfait. Aucune signature, autorisation, politique RLS ou fonction de dispatch modifiée. Le rapprochement existant reconnaît Déménagement ; contrôlé sur une base isolée avec un profil Carrelage concurrent.

## Vérifications avant livraison

63 tests passent : parcours séquentiel dans les 20 villes, conditions manquantes/inconnues/forgées, alternatives devis, confirmation idempotente, dispatch V1/V2, règlement 690/90, rejet de modification des montants et préservation des anciennes missions.
Les tests de réservation/règlement utilisent PGlite : aucune demande ni mission de test en production.

Message de commit : `feat(pricing): calibrate two-person moving handling package at 690 MAD`
