# Jardinage — activation nationale du pilote

Autorisation utilisateur : activer les deux forfaits dans toutes les villes FIXEO. Registre : 40 entrées (deux services × 20 villes), sans majoration géographique.

- Entretien courant de 1 à 100 m² : VAP 300 + FIXEO 60 = client 360 MAD.
- Haie jusqu'à 10 m de long, 1,80 m de haut et 0,80 m de large, dessus et deux faces accessibles : VAP 250 + FIXEO 60 = client 310 MAD.

Cinq réponses structurées requises : dimensions dans les limites annoncées, accès direct au sol plat, entretien régulier, déchets regroupés sur place, aucune autre tâche/fourniture. Les dimensions sont confirmées sous forme de choix de périmètre ; aucune mesure automatique n'est effectuée. Toute réponse hors périmètre ou inconnue mène au devis. Une réponse manquante bloque le prix. Outils, fonctionnement et déplacement dans la ville retenue compris ; pas d'évacuation hors site, arbres, débroussaillage important, plantation, traitement ni arrosage.

Le même parcours couvre la homepage et la page services. Les autres besoins jardinage et les demandes combinées restent sur devis. Le tarif national ne garantit pas la disponibilité d'un artisan dans chaque ville.

Migration garden_vap_confirmation : ajout de jardinage à la liste des catégories autorisées par la confirmation VAP, sans changement des prix existants. La ventilation signée et persistée reste l'autorité jusqu'au règlement.

52 tests réussis : 40 couples tarif/ville, entrées inconnues/manquantes/hors périmètre, absence de repli de prix hors ville autorisée, confirmation jardinage vers mission et règlement dans PostgreSQL embarqué, régressions des autres parcours. Les prix sont décidés par FIXEO pour le pilote ; ils ne constituent pas une preuve de coûts terrain. Suivre temps, déplacement, consommables, retours artisans et demandes de supplément après lancement.
