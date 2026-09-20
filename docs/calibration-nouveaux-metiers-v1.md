# Nouveaux métiers : dossier de calibration et contrôle production

Date : 20 septembre 2026. Version production contrôlée : `b06faef066aa8857dbf6237cac2e9bab83422617` (PR #27).

## Statut

Les nouveaux métiers sont opérationnels par devis. Aucun nouveau montant n'est activé. Ce dossier définit les prestations pilotes à chiffrer ; il ne constitue pas une grille de prix validée. Les limites ci-dessous sont des propositions de produit, à confronter à des interventions réelles et à l'accord des artisans.

## Contrôle production réalisé

Contrôle dans le navigateur desktop sur `https://www.fixeo.ma/services.html?v=b06faef`, sans soumission de réservation ni de devis.

| Cas | Résultat observé |
| --- | --- |
| Entretien & extérieur → Entretien de jardin → RAFI | Description, Rabat et métier Jardinage conservés ; candidat correspondant au besoin |
| Jardinage → résultat | Devis requis ; aucun montant affiché |
| Préparer ma demande de devis | Projet et ville préremplis, téléphone demandé ; retour au résultat disponible |
| Eau & plomberie → WC bouché | Débouchage WC simple et alternative devis proposés |
| WC sur un équipement accessible | Forfait existant de 300 MAD, inclusions et exclusions affichées |
| Trouver mon artisan | Vérification serveur réussie ; résumé Débouchage WC simple · rabat — 300 MAD ; saisie téléphone |
| Retour à mon estimation puis étape précédente | Prix restauré puis réponse de qualification précédente conservée |
| Réponse modifiée : réseau collectif/encastré/multiple | Prix retiré ; devis requis à sa place |

Les 45 tests automatisés de la livraison précédente couvrent notamment les 62 situations et 112 choix de candidats, les seuils du grand ménage et l'idempotence des demandes simulées. Ils ne remplacent pas les tests physiques iPhone ni la validation commerciale des tarifs. Aucun envoi, dispatch ou paiement réel n'a été vérifié ici.

## Six prestations pilotes

Toutes restent `DRAFT_NOT_PRICED`. Le périmètre définit un candidat au forfait, pas un engagement de durée ou de résultat automatique.

| Code proposé | Périmètre pilote | Questions avant prix | Inclus à chiffrer | Hors forfait / devis |
| --- | --- | --- | --- | --- |
| jardinage.entretien_courant | Jardin déjà entretenu, terrain accessible et plat, jusqu'à 100 m² | Surface ; état actuel ; tâches souhaitées ; accès ; évacuation des déchets | Tonte si pelouse, désherbage léger, ramassage ; outils ; déplacement dans la zone validée | Défrichage, arbres, traitement, réseau d'arrosage, création paysagère ; évacuation hors site non chiffrée |
| jardinage.taille_haie_basse | Jusqu'à 10 mètres linéaires, hauteur maximale proposée 1,80 m, accès depuis le sol | Longueur ; hauteur ; largeur ; faces accessibles ; état ; déchets | Taille d'entretien et ramassage ; outils ; déplacement | Travail en hauteur, grosses branches, rabattage important, haie non accessible |
| carrelage.pose_sol_standard | Sol intérieur de 10–30 m², support prêt, pose droite, carreaux standards jusqu'à 60×60 cm | Surface ; format ; support ; dépose ; motifs ; fourniture ; plinthes | Main-d'œuvre de pose et jointoiement ; nettoyage du chantier ; déplacement | Dépose, ragréage, étanchéité, escalier, mur, grands formats, zellige, plinthes non chiffrées |
| carrelage.remplacement_local | 1–4 carreaux, support sain, carreaux identiques fournis par le client | Nombre ; dimensions ; support ; disponibilité des carreaux ; pièces humides | Dépose locale, pose, joints, nettoyage ; colle et joint à chiffrer explicitement | Recherche de carreaux, fuite, support humide, réparation d'étanchéité, atteinte aux carreaux voisins nécessitant une extension |
| maconnerie.reprise_enduit_local | Jusqu'à 1 m² d'enduit intérieur non structurel sur support sec et sain, accessible du sol | Surface ; profondeur ; humidité ; fissures ; état du support ; finition | Préparation locale, rebouchage/enduit et nettoyage ; matériaux et nombre de passages à chiffrer | Fissure inexpliquée, humidité, structure, mur porteur, démolition, peinture, finition décorative |
| demenagement.manutention_sur_place | Deux intervenants jusqu'à deux heures, même site, sans transport ni escalier | Inventaire ; poids/dimensions ; accès ; déplacement exact ; démontage | Temps d'équipe réservé et protections standard ; déplacement de l'équipe | Piano, coffre-fort, objet fragile/exceptionnel, levage, véhicule, étage sans accès adapté, démontage complexe ; durée supplémentaire non acceptée |

Un champ inconnu qui modifie le coût doit provoquer une précision ou un devis, jamais la sélection silencieuse du cas le moins cher. Les seuils seront ajustés après les mesures terrain. Le cas « autre » n'obtient pas de forfait générique.

## Modèle de calcul proposé

1. Fixer une même ville/zone et un même périmètre pour comparer les relevés.
2. Documenter pour chaque offre le montant net demandé par l'artisan, le temps d'équipe, les consommables, les matériaux, le déplacement, l'évacuation, le nombre de visites et les exclusions.
3. Séparer les éléments déjà inclus dans le prix artisan pour éviter de les compter deux fois.
4. Calculer le coût complet comparable : net artisan + coûts assumés par FIXEO non déjà inclus + coûts de service mesurés + provision explicitement justifiée.
5. Ajouter la rémunération FIXEO selon son modèle commercial réel. Si une marge sur prix de vente est retenue, la formule est coût / (1 − taux), et non coût × (1 + taux). Ne pas confondre marge et majoration. Aucun taux n'est présumé dans ce dossier. Le traitement fiscal doit être renseigné selon le fonctionnement réel de FIXEO avant affichage du prix client.
6. Déterminer un prix client total, un net artisan accepté et un périmètre identique pour les deux parties. Pour le carrelage, comparer un minimum d'intervention et un prix au m² ; pour la haie, un minimum et un prix au mètre linéaire. Aucun coefficient de ville arbitraire.

Protocole pilote proposé : au moins trois offres comparables par prestation dans la ville de lancement, puis cinq interventions documentées si disponibles. Ce seuil est une règle de travail proposée, pas une preuve statistique suffisante. En cas de dispersion importante, segmenter le périmètre ou garder un devis. Revoir après les premières interventions et lors des changements de coûts.

## Relevé terrain à fournir

Pour chaque prestation : ville/zone, date, périmètre exact, dimensions, accès, durée et effectif, net artisan, fournitures, déplacement, déchets, total client habituel, inclusions/exclusions, accord de l'artisan pour le forfait. Les références de devis peuvent rester anonymisées ; aucun téléphone client n'est nécessaire.

Les montants manquants restent vides, jamais zéro. Il manque actuellement les coûts artisans et le modèle de rémunération FIXEO pour établir les six prix de manière fiable.

## Recherche publique : repères et limites

Consultation le 20 septembre 2026 :

- [Carrelage Tanger — prix de pose](https://www.carrelage-tanger.com/prix-pose-carrelage/) publie un repère de 40–70 DH/m². Le contenu évoque les variations dues au support, au format, à la complexité et à la région. Ce repère n'est ni une offre engageante ni un coût artisan FIXEO ; ses inclusions et sa fraîcheur tarifaire ne sont pas assez précises pour retenir un montant automatiquement.
- [Demeno — formulaire de devis](https://www.demeno.ma/) demande volume, adresses, étages et ascenseurs. Cela soutient la nécessité de qualifier les accès et le volume ; cette page ne fournit pas un forfait comparable à importer.
- La recherche n'a pas fourni de données publiques suffisamment comparables et vérifiables pour chiffrer l'entretien courant de jardin, la reprise d'enduit ou la manutention pilote. Aucun tarif n'est déduit de prix d'outillage, de budgets de construction ou de transport international.

## Conditions d'activation technique

- Ajouter uniquement les prestations dont le périmètre, les coûts, le prix client et le net artisan sont validés.
- Enregistrer la zone, la date de validation et une date de révision ; garder une sortie devis hors zone/périmètre ou après expiration de la validité.
- Aligner la catégorie carrelage de bout en bout : la collecte actuelle utilise `autre` pour ce métier. Ne pas activer un prix spécialisé avant validation de la réservation et de l'affectation correspondantes.
- Questions, bornes et options côté serveur ; montant non déduit du texte libre ni du navigateur.
- Tester les bornes, réponses inconnues, changements de ville, retour arrière, cohérence des inclusions, validation serveur de réservation et idempotence.
- Activation progressive par prestation et zone ; ne pas lancer quatre métiers tarifés en bloc.

## Ordre recommandé

Commencer par entretien de jardin et remplacement local de carreaux lorsque les offres terrain sont obtenues. Puis taille de haie et reprise d'enduit. La manutention et la pose au m² nécessitent d'abord une grille logistique et de minimum d'intervention. Le déménagement complet, la maçonnerie structurelle et les travaux multi-métiers restent sur devis.
