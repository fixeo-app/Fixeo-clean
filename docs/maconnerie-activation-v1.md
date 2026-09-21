# Petite maçonnerie — pilote national FIXEO

Statut : préparé et testé, NON ACTIVÉ EN PRODUCTION. Le contrôle automatique a refusé la migration modifiant les fonctions partagées de confirmation et de dispatch ; autorisation explicite de cette modification requise avant nouvelle tentative.

Deux propositions validées par le propriétaire, préparées sous `masonry-pilot-v1` dans les 20 villes FIXEO. Prix pilotes à suivre sur les interventions terrain, sans garantie de disponibilité d'un artisan dans chaque ville.

| Forfait | Part artisan avant ses frais | FIXEO | Prix client hors fournitures |
|---|---:|---:|---:|
| Rebouchage de 1 à 5 trous | 300 MAD | 60 MAD | 360 MAD |
| Reprise locale d'enduit de 1 à 3 m² | 500 MAD | 75 MAD | 575 MAD |

Les montants sont forfaitaires : 575 MAD pour la surface totale admissible, et non par m². Calcul BP3.3 en centimes, offre immuable, prix conservé dans la réservation et le règlement.

## Qualification

Mur intérieur dans une même pièce, support sain, sec et stable, absence de fissures, humidité ou intervention structurelle. Accès dégagé jusqu'à 2 m de hauteur, eau et électricité disponibles.

- Rebouchage : 1 à 5 trous, chacun au maximum 10 cm de diamètre et 3 cm de profondeur ; pas de trou traversant ni canalisation/câble touché.
- Enduit : surface totale de 1 à 3 m², épaisseur superficielle jusqu'à 1 cm, sans reconstruction.
- Fournitures compatibles et suffisantes à fournir par le client. Aucun achat ou remboursement de matériaux inclus dans le montant (materials_minor=0).
- Inclus : main-d'œuvre, outillage, déplacement dans la ville, finition locale, retour nécessaire pour terminer après séchage, nettoyage et regroupement des petits gravats sur place.
- Exclus : peinture, évacuation hors site, plafonds, façades, démolition, cloisons, ouvertures de murs, travaux structurels et toute autre prestation.

Questions obligatoires sur quantité/surface, support, accès, fournitures, finition et dimensions/profondeur. Réponse inconnue, hors limite ou différente : pas de prix forfaitaire ; devis/qualification complémentaire.

## Affectation et compatibilité

Catégorie `maconnerie` autorisée dans la confirmation VAP. Pour les demandes maçonnerie liées à une offre VAP, les deux chemins de dispatch (`dispatch_request_v1` et `dispatch_preview_v21`) exigent une spécialité déclarée contenant « maçonn/maconn ». Les anciennes demandes sans offre VAP conservent leur logique existante. Aucune modification des missions historiques.

## Vérification

Tests des 40 combinaisons forfait/ville, bornes, quantités invalides, fournitures manquantes et cas complexes. PostgreSQL isolé : confirmation idempotente, sélection du maçon face à un carreleur mieux noté dans les deux chemins de dispatch, commission persistée, protection du montant au règlement, compatibilité des anciennes demandes.

Contrôles des estimations en production à effectuer après activation. Aucun test de réservation réelle ni notification artisan n’a été créé.
