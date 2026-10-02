# Jardinage — calibration pilote FIXEO
Statut : proposition commerciale, non activée. Les seuils et durées ci-dessous sont des hypothèses de conception à confronter au travail réel. Ville de lancement non choisie.

## Deux prestations distinctes

| Prestation | Périmètre proposé | VAP artisan | FIXEO | Prix client proposé |
|---|---|---:|---:|---:|
| Entretien courant | Jusqu'à 100 m² de surface effectivement à entretenir ; jardin déjà entretenu, plat, accès direct au sol | 300 MAD | 60 MAD | 360 MAD |
| Taille d'entretien d'une haie basse | Jusqu'à 10 mètres linéaires ; hauteur ≤ 1,80 m ; largeur ≤ 0,80 m proposée ; dessus et deux faces accessibles depuis le sol | 250 MAD | 60 MAD | 310 MAD |

La VAP couvre le travail, les outils et leur fonctionnement, le déplacement dans la zone à définir et le ramassage. Ce n'est pas le bénéfice de l'artisan après ses frais. Les 60 MAD FIXEO résultent du minimum du barème BP 3.3. Aucun prix au m² ou au mètre supplémentaire n'est encore validé. Aucun coefficient de ville inventé.

Entretien : tonte d'une pelouse existante si présente, désherbage léger et ramassage des résidus produits. Exclut haies, arbres, jardin envahi, gros débroussaillage, plantation, traitement, réparation d'arrosage et création paysagère.
Haie : taille d'entretien de la pousse récente, pas de rabattage important, grosses branches, élagage ou travail depuis une échelle.

Déchets : regroupement sur place dans un emplacement désigné par le client ; pas de transport hors site. L'absence d'emplacement ou une évacuation demandée impose un devis comprenant cette prestation. Ne pas présenter le forfait comme une remise à neuf ou un enlèvement des déchets.

Achat de végétaux, terreau, engrais et produits exclu. Zéro matériel séparé dans ces propositions signifie aucune fourniture additionnelle nécessaire au périmètre, pas toutes fournitures offertes.

## Questions RAFI proposées

1. Besoin : entretien courant / taille de haie / remise en état / autre.
2. Ville et accès : terrain au niveau du sol, plat, accès direct pour outils ; autrement devis.
3. Dimensions : surface à entretenir ; pour haie longueur, hauteur, largeur et accès aux faces.
4. État : entretien régulier / végétation dense ou jardin longtemps délaissé / je ne sais pas.
5. Déchets : peuvent rester regroupés sur place / évacuation souhaitée.
6. Récapitulatif modifiable avant prix et réservation : tâches, dimensions, ville, exclusions et prix total.

RAFI ne redemande pas une réponse déjà structurée et vérifiée. Une dimension dictée est reprise et confirmée. Une donnée absente ou « je ne sais pas » n'est jamais convertie en zéro ou en option bon marché. Demander une précision ; à défaut devis. Photo facultative uniquement si un vrai flux de téléversement/analyse est ensuite livré, ne pas le promettre actuellement.

## Décision serveur

Forfait uniquement si toutes les bornes et conditions sont vérifiées, la ville est activée et la version commerciale valide. Toute demande additionnelle ou dépassement connu passe par devis. Une erreur d'estimation de durée par FIXEO ne devient pas automatiquement un supplément client. Changement de périmètre : nouveau montant accepté avant les travaux supplémentaires.

Ne pas additionner automatiquement 360 + 310 pour un jardin avec haie : l'intervention combinée peut partager déplacement et préparation ; son périmètre et sa VAP sont à définir séparément. Pour le pilote, la demande mixte passe sur devis.

## Contrôle de l'équité économique

Relever sur les premiers cas comparables : temps de déplacement et chantier, effectif, frais de trajet, consommables et outillage, évacuation éventuelle, incidents, acceptation du montant artisan.
Calcul : (VAP − frais directs artisan documentés) / heures totales mobilisées.
Exemple de sensibilité, pas revenu constaté : VAP 300, frais supposés 60 → 240 avant autres charges, soit 120/h pour 2 h totales ou 60/h pour 4 h. Cette dispersion justifie la qualification de l'état du jardin.
Côté FIXEO : comparer 60 MAD aux coûts réellement mesurés de coordination, support et collecte ; aucun bénéfice garanti déduit du barème.

La recherche publique effectuée n'a pas fourni de référence marocaine suffisamment comparable pour confirmer 360/310 MAD. Ce sont des prix proposés par FIXEO, pas des prix de marché prouvés.

## Travail technique restant avant activation

Le jardinage est actuellement routé vers devis. Il faut ajouter les deux services et leurs questions au moteur, leurs règles de prix et leurs inclusions, puis les rattacher aux situations de découverte. Le registre VAP seul ne transforme pas un devis en forfait.
La confirmation SQL VAP conserve actuellement une liste de huit familles ne comprenant pas jardinage : l'étendre et tester la catégorie jusqu'à la mission avant activation.
Le sélecteur VAP actuel compare des critères exacts ; des dimensions continues exigent une qualification de périmètre côté serveur, pas une entrée différente pour chaque surface et pas une catégorie fournie par le navigateur.

Cas requis : 100/101 m² ; 10/10,01 ml ; 1,80/1,81 m ; 0,80/0,81 m ; zéro/négatif/absent ; jardin dense ; accès complexe ; évacuation ; ville non active ; retour et changement de dimensions ; VAP300+60 et VAP250+60 cohérents jusqu'au règlement.

## Décision manquante pour finaliser le pilote
Ville/zone de lancement. Aucun choix déduit des précédents tests à Rabat ou captures à Fès.
