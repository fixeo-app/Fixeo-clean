# Audit de couverture du modal estimation FIXEO — 20 septembre 2026

Référence auditée : `fdcd532a16bffa8f08555def181f21e6c90d7921`. Audit du code et exécution locale du même orchestrateur importé par `/api/estimator-v1`. Aucun appel de réservation, aucune modification tarifaire, aucun déploiement applicatif dans cet audit.

## Conclusion

Les 62 situations de découverte ne sont pas 62 prestations tarifaires. Le catalogue contient 53 prestations sur 8 métiers. La couche de découverte transmet un libellé et parfois un métier, mais aucun identifiant stable de situation ou service canonique. Au point d’entrée serveur testé : 40 situations conduisent à une sélection de prestation et 22 à une sélection de métier. Aucune ne sélectionne directement une prestation canonique. Ces chiffres décrivent le contrat serveur ; le classificateur navigateur peut proposer un métier pour certains textes libres, sans étendre le catalogue.

12 situations transmettent explicitement un métier absent de la liste acceptée : jardinage (3), déménagement (6), carrelage (2), maçonnerie (1). Elles ne disposent pas de chemin tarifaire correspondant dans ce sélecteur. Les 10 autres sans indication métier demandent une qualification.

## Constats prioritaires et preuves

| Priorité | Constat | Conséquence / correction recommandée |
|---|---|---|
| P1 | Les 12 indications métier non prises en charge retournent METIER_SELECTION ; les 8 choix ne comprennent pas le métier demandé. | Ajouter une orientation explicite pour ces situations, puis cataloguer les prestations validées. Ne jamais rabattre vers un métier voisin pour afficher un prix. |
| P1 | Grand ménage : le catalogue décrit un F2/F3 de 60–100 m², mais le plan ne demande que property_type. Les simulations APARTMENT de 60 et 300 m² produisent toutes deux 600 MAD. | Faire respecter surface et périmètre côté serveur ; au-delà, devis ou autre prestation validée. Montants cités comme résultats observés, pas comme recommandations de prix. |
| P1 | WC simple : sélection directe → READY_FOR_ENGINE → 300 MAD sans question ; aucune condition/exclusion structurée. | Vérifier et formaliser ce qui distingue un débouchage local standard d’un réseau principal ou collectif. |
| P1 | Dans les probes, scope_summary et exclusions_summary sont vides. Le mapper lit pricing.scope_summary, tandis que le moteur produit un objet scope distinct. | Corriger le contrat de sortie et rendre obligatoires inclusions, exclusions et fourniture des pièces pour chaque prix. |
| P2 | Aucune des 62 entrées ne transmet service_hint ; le catalogue complet du métier est proposé. | Registre central de situations → candidats canoniques + questions de distinction. Une situation ambiguë ne doit pas sélectionner un acte automatiquement. |
| P2 | 12 prestations ont zéro question ; les 53 ont un plan présent. | Zéro question peut être légitime, mais doit être justifié par un périmètre déjà confirmé ; revoir les prestations de réparation ouvertes. |
| P2 | Des fichiers importés par l’API se déclarent encore DORMANT / production_active:false ; les fiches portent production_ready:false et active_in_estimator:false. | Réconcilier les métadonnées avec le runtime et définir une autorité d’activation unique, sans simplement basculer tous les drapeaux. |
| P2 | Catalogue calibré humainement en pilote, provenance transaction_backed:false. | Un calcul déterministe ne prouve pas la justesse économique du tarif. Valider coûts, durée, déplacement, consommables, pièces et retours terrain avant extension. |

## Architecture recommandée

1. Registre serveur unique : situation_id, univers, libellés FR/darija, candidats, questions de distinction, statut de couverture et route de secours. La homepage et Services consomment les mêmes situations.
2. Le langage propose une interprétation ; le serveur valide le service et ses conditions. Une modification du besoin invalide les réponses dépendantes.
3. Qualification progressive : identité, limites du périmètre, quantité/surface/accès, fournitures. Réutiliser les informations confirmées, distinguer inconnu de non, proposer retour et conservation des réponses.
4. Le moteur canonique reste seul calculateur. Ne pas appliquer de coefficient ville/urgence implicite : les règles actuelles les excluent du calcul. Toute nouvelle règle commerciale doit être explicite et validée.
5. Résultats : prix complet, main-d’œuvre + pièce séparée, diagnostic au tarif défini, devis, orientation/hors périmètre. Ne pas créer un diagnostic payant universel pour combler les trous.
6. Réserver reste une confirmation explicite après estimation ; un devis/orientation nécessite un véritable parcours de collecte et de suivi, pas un simple écran sans suite.

## Matrice exhaustive — propositions à implémenter

Les candidats ci-dessous sont des correspondances éditoriales proposées, pas des nouvelles règles actives ni une validation automatique de prix. « Hors catalogue » signifie absence dans le catalogue tarifaire audité, pas impossibilité pour FIXEO d’organiser la prestation. Les codes abrégés après `/ .` reprennent le préfixe précédent.

| Univers | Situation proposée | Entrée actuelle serveur | Candidat / orientation recommandée | Qualification essentielle |
|---|---|---|---|---|
| eau | Robinet qui fuit | Choix prestation | plomberie.fuite_simple / plomberie.robinet_remplacement | Localisation, accès, réparation ou remplacement ? |
| eau | Fuite sous un évier | Choix prestation | plomberie.fuite_simple / plomberie.diagnostic | Origine visible, raccord accessible ou recherche de fuite ? |
| eau | WC bouché | Choix prestation | plomberie.debouchage_wc_simple | Un seul WC, engorgement local ou réseau collectif ? |
| eau | Canalisation bouchée | Choix prestation | plomberie.debouchage_evier, uniquement si évier | Quel équipement ? Canalisation principale ou évier local ? |
| eau | Chasse d’eau défectueuse | Choix prestation | plomberie.chasse_eau | Mécanisme concerné, accessibilité, fourniture de la pièce ? |
| eau | Installer un sanitaire | Choix prestation | Hors catalogue actuel | Type de sanitaire, pose ou remplacement, raccordements existants ? |
| eau | Chauffe-eau en panne | Choix prestation | Diagnostic plomberie à confirmer selon équipement | Énergie et équipement ; ne pas assimiler une panne à une réparation forfaitaire. |
| eau | Faible pression d’eau | Choix prestation | plomberie.diagnostic, sous réserve de périmètre | Un point d’eau ou tout le logement ? |
| electricite | Prise qui ne fonctionne plus | Choix prestation | electricite.diagnostic / electricite.prise_remplacement | Défaut identifié ou cause inconnue ? Vérifications de sécurité avant prix. |
| electricite | Éclairage en panne | Choix prestation | electricite.diagnostic | Luminaire ou circuit ? Ne pas vendre un remplacement avant identification. |
| electricite | Disjoncteur qui saute | Choix prestation | electricite.diagnostic / electricite.disjoncteur_remplacement | Cause inconnue ou disjoncteur défectueux confirmé ? |
| electricite | Installer un luminaire | Choix prestation | electricite.luminaire_installation | Point électrique existant, équipement fourni, quantité, accessibilité ? |
| electricite | Ajouter une prise | Choix prestation | Hors catalogue actuel | Création de ligne ou remplacement ? Ne pas tarifer une création comme un remplacement. |
| electricite | Vérifier un tableau électrique | Choix prestation | electricite.diagnostic | Tableau privatif et périmètre du diagnostic à confirmer. |
| electricite | Équipement électrique en panne | Choix prestation | Diagnostic / orientation selon appareil | Quel équipement ? Électroménager, circuit et équipement spécialisé à distinguer. |
| confort | Climatiseur qui ne refroidit plus | Choix prestation | climatisation.diagnostic | Type d’appareil et symptômes ; aucune recharge supposée. |
| confort | Installer un climatiseur | Choix prestation | climatisation.installation.standard / climatisation.installation.cassette | Type, puissance, hauteur, accès, cuivre et fourniture appareil. |
| confort | Entretenir une climatisation | Choix prestation | climatisation.entretien_annuel / climatisation.desinfection_profonde | Nombre et type d’unités, entretien normal ou nettoyage profond ? |
| confort | Climatiseur qui fuit | Choix prestation | climatisation.diagnostic | Eau ou fluide frigorigène ? Ne pas assimiler toutes les fuites à une recharge. |
| confort | Bruit inhabituel de climatisation | Choix prestation | climatisation.diagnostic | Type et contexte du bruit. |
| confort | Problème de ventilation | Choix prestation | Hors catalogue actuel sauf climatisation confirmée | VMC, extracteur ou climatiseur ? |
| confort | Chauffage en panne | Choix prestation | Hors catalogue actuel sauf climatisation réversible confirmée | Type et énergie du chauffage ; orientation spécialisée si nécessaire. |
| portes | Porte claquée | Choix prestation | serrurerie.porte_claquee_ouverture / serrurerie.porte_claquee_blindee.ouverture | Claquée ou verrouillée, porte standard ou blindée ? |
| portes | Clé cassée dans la serrure | Choix prestation | serrurerie.cle_cassee_extraction | Clé et serrure concernées, accès et pièces éventuelles. |
| portes | Remplacer une serrure | Choix prestation | serrurerie.serrure_remplacement.standard / serrurerie.cylindre_remplacement.standard | Serrure complète ou cylindre, standard ou système spécial ? |
| portes | Fenêtre qui ferme mal | Choix prestation | Hors catalogue fenêtre | Matériau et mécanisme ; ne pas mapper vers réglage porte bois sans confirmation. |
| portes | Vitre fissurée | Choix métier | Hors catalogue vitrage | Dimensions et type de vitrage ; devis. |
| portes | Volet bloqué | Choix prestation | Hors catalogue volet | Manuel ou motorisé, mécanisme ; diagnostic/devis à définir. |
| portes | Réparer une porte | Choix prestation | menuiserie.reglage_porte.sans_rabotage / .avec_rabotage / remplacement_charniere / installation_porte | Type de porte, réglage, pièce ou remplacement complet ? |
| portes | Installer une grille de protection | Choix métier | Hors catalogue grille | Dimensions, matériau, fabrication ou pose ; devis. |
| travaux | Repeindre une pièce | Choix prestation | peinture.mur_interieur.labour_only / .all_in / .all_in_avec_prep / plafond.labour_only | Murs/plafond, surface réellement peinte, préparation, fournitures. |
| travaux | Peindre une façade | Choix prestation | Hors catalogue façade | Surface, accès et support ; ne pas appliquer le tarif mur intérieur. |
| travaux | Poser du carrelage | Choix métier — métier absent | Hors catalogue carrelage | Surface, dépose, support, format ; devis. |
| travaux | Réparer des joints | Choix métier — métier absent | Hors catalogue carrelage | Joints de carrelage ou joints sanitaires ? Requalifier avant orientation. |
| travaux | Infiltration ou étanchéité | Choix métier | Hors catalogue étanchéité | Localisation, origine et accès ; diagnostic spécialisé à définir. |
| travaux | Rénover une salle de bains | Choix métier | Hors catalogue projet global | Lots, surfaces et équipements ; devis multi-métiers. |
| travaux | Rénover une cuisine | Choix métier | Hors catalogue projet global | Lots, meubles, réseaux ; devis multi-métiers. |
| travaux | Petits travaux de maçonnerie | Choix métier — métier absent | Hors catalogue maçonnerie | Nature, dimensions, structure ; devis. |
| travaux | Aménager une cloison | Choix métier | Hors catalogue cloison | Dimensions, matériau et réseaux ; devis. |
| travaux | Préparer une rénovation complète | Choix métier | Hors catalogue rénovation globale | Périmètre multi-lots ; devis, pas somme arbitraire de forfaits. |
| installation | Monter un meuble | Choix prestation | bricolage.montage_meuble | Quantité, type, dimensions et complexité du meuble. |
| installation | Fixer une étagère | Choix prestation | bricolage.fixation_accrochage | Quantité, support, charge et fixations disponibles. |
| installation | Installer une tringle | Choix prestation | bricolage.fixation_accrochage | Quantité, support, hauteur et longueur. |
| installation | Fixer un téléviseur | Choix prestation | bricolage.intervention_conditionnelle | Taille TV, type de support, mur et matériel fourni. |
| installation | Poser des meubles de cuisine | Choix prestation | Hors catalogue cuisine | Linéaire, découpes, fixations, raccordements ; devis. |
| installation | Réparer un meuble | Choix prestation | menuiserie.remplacement_charniere / remplacement_coulisse_tiroir, si confirmé | Défaut et pièce ; autres réparations à orienter. |
| installation | Créer un rangement sur mesure | Choix prestation | Hors catalogue sur mesure | Dimensions, matériau et finition ; devis. |
| installation | Installer un équipement | Choix métier | À identifier avant tout tarif | Équipement, pose, branchements et contraintes ; aucune affectation forfaitaire automatique. |
| entretien | Nettoyage après travaux | Choix prestation | nettoyage.apres_travaux | Surface, nature/résidus des travaux, accessibilité. |
| entretien | Grand nettoyage | Choix prestation | nettoyage.grand_menage / nettoyage.menage_standard | Surface réelle, type de logement, état ; verrouiller le forfait F2/F3 60–100 m². |
| entretien | Nettoyer un canapé | Choix prestation | nettoyage.canape.deux_places / .trois_places | Nombre de places et matière ; autres formats hors forfait actuel. |
| entretien | Entretien de jardin | Choix métier — métier absent | Hors catalogue jardinage | Surface, opérations et déchets ; devis. |
| entretien | Taille de haie | Choix métier — métier absent | Hors catalogue jardinage | Longueur, hauteur, accès et évacuation ; devis. |
| entretien | Problème d’arrosage | Choix métier — métier absent | Hors catalogue arrosage | Type de réseau et panne ; diagnostic spécialisé à définir. |
| entretien | Aménager une terrasse | Choix métier | Hors catalogue terrasse | Nature du projet, surface, support ; devis multi-lots. |
| entretien | Entretien de piscine | Choix métier | Hors catalogue piscine | Type, volume et besoin ; orientation spécialisée. |
| demenagement | Déménager un appartement | Choix métier — métier absent | Hors catalogue déménagement | Volume, départ/arrivée, étages, ascenseur, accès ; devis. |
| demenagement | Transporter quelques meubles | Choix métier — métier absent | Hors catalogue déménagement | Objets, dimensions, trajet et accès ; devis. |
| demenagement | Déplacer un objet lourd | Choix métier — métier absent | Hors catalogue manutention | Poids, dimensions, accès et matériel ; devis. |
| demenagement | Démonter et remonter du mobilier | Choix métier — métier absent | Bricolage seulement si montage autonome confirmé ; déménagement hors catalogue | Montage seul ou transport associé ? Définir la prestation sans confusion. |
| demenagement | Charger ou décharger un véhicule | Choix métier — métier absent | Hors catalogue manutention | Volume, équipe, durée, charge ; devis. |
| demenagement | Préparer un déménagement de bureau | Choix métier — métier absent | Hors catalogue déménagement professionnel | Inventaire, accès, distance, planning ; devis. |

## Lotissement et critères de sortie

**Lot 1 — cohérence et périmètre.** Registre de 62 identifiants stables, orientation explicite des situations non cataloguées, correction grand ménage et contrat inclus/exclus. Conserver prix existants tant que le périmètre reste inchangé.

**Lot 2 — parcours guidés.** Ne présenter que les candidats pertinents ; questions discriminantes, inconnus, limites de réparation et fournitures. Éviter d’interpréter un symptôme comme un remplacement ou une recharge.

**Lot 3 — extension tarifaire.** Commencer par les demandes fréquentes hors catalogue, chiffrer et valider chaque fiche avant activation. Les rénovations et prestations sur mesure gardent un devis tant que leur périmètre n’est pas standardisé.

**Validation.** Chaque situation atteint une sortie utile ; chaque prix est lié à une prestation et un périmètre confirmé ; tous les dépassements/quantités inconnues bloquent un prix injustifié. Tester variantes, seuils, réponses inconnues, descriptions FR/darija, modification et retour arrière. Aucun tarif ne vient du navigateur ou d’une génération libre.

## Reproduction et limites

`node scripts/audit-estimator-coverage.cjs` produit le relevé JSON. Cette exécution couvre les 62 démarrages, les 53 plans et trois probes tarifaires. Elle ne remplace pas un test E2E de toutes les réponses possibles, ni un audit économique externe des prix. Les montants observés ne prouvent pas qu’ils sont justes. Aucun test ne crée de demande réelle.

Fichiers de référence : `js/fixeo-discovery-v1.js`, `js/fixeo-estimator-v2.js`, `api/estimator-v1/index.js`, `data/pricing/orchestrator/estimator-service-resolver-v1.js`, `estimator-question-planner-v1.js`, `estimator-outcome-mapper-v1.js`, `data/pricing/engine/pricing-engine-core-v1.js`, `data/pricing/canonical/canonical-registry.v1.draft.json`.
