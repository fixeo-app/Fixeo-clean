# Climatisation — calibrage VAP validé et intégré

État au 21 septembre 2026 : **grille et périmètre validés pour les 20 villes ; migration appliquée et déploiement autorisé réalisé**. Base auditée : `ce17ca7386e5f36ad8cc39bf2a6edc201de95c9d`, après la livraison électrique ([PR #39](https://github.com/fixeo-app/Fixeo-clean/pull/39)).

Grille structurée : `data/pricing/research/climatisation/vap-proposal.v1.json` ; version intégrée : `climatisation-pilot-v1`.

Le propriétaire précise que les missions existantes sont des **missions de test**. Elles ne constituent donc pas une preuve de demande réelle, d'acceptation artisan ou de rentabilité. Cette proposition n'effectue aucune suppression, reclassification en base ou nouvelle mission.

## Six forfaits validés

Montants en MAD pour **un appareil par réservation**, déplacement dans la ville choisie compris. Même grille validée dans les 20 villes, sous réserve de disponibilité d'un professionnel et de confirmation du périmètre. Aucun multiplicateur automatique de ville, d'urgence ou de week-end.

| Prestation | Prestation artisan VAP | Fournitures | Frais FIXEO | Total client |
|---|---:|---:|---:|---:|
| Diagnostic local, jusqu'à 45 min | 200 | 0 | 60 | **260** |
| Entretien courant | 240 | 0 | 60 | **300** |
| Nettoyage approfondi | 390 | 0 | 60 | **450** |
| Pose mono-split neuf, liaison jusqu'à 3 m | 500 | 450 | 75 | **1 025** |
| Pose mono-split neuf, liaison de plus de 3 à 5 m | 600 | 600 | 90 | **1 290** |
| Dépose complète d'un mono-split fonctionnel accessible | 400 | 0 | 60 | **460** |

Les frais suivent le calcul existant BP3.3 : ici 15 % de la VAP, avec minimum de 60 MAD. **Les fournitures n'entrent pas dans l'assiette des frais.** L'artisan conserve après reversement VAP + fournitures ; ce montant n'est pas son bénéfice. Outillage et petits consommables d'entretien sont couverts par la VAP. Le climatiseur lui-même est fourni par le client.

Les 450/600 MAD de fournitures sont des **forfaits commerciaux proposés sur hypothèses internes**, pas des prix d'achat vérifiés. L'installation ne doit être acceptée au forfait que si un partenaire confirme pouvoir fournir le kit compatible et honorer le total. Le surcoût d'un kit ne devient jamais un supplément automatique après acceptation. Si le kit est déjà fourni par le client, établir une proposition adaptée avant réservation ; ne pas facturer un kit non fourni.

Villes : Agadir, Béni Mellal, Casablanca, El Jadida, Fès, Kénitra, Khouribga, Marrakech, Meknès, Mohammedia, Nador, Ouarzazate, Oujda, Rabat, Safi, Salé, Tanger, Taza, Témara et Tétouan. Six services × 20 villes = **120 entrées approuvées dans cette branche** ; activation en production autorisée et réalisée.

## Périmètres

**Diagnostic — 260 MAD.** Un problème sur un mono-split mural résidentiel de 7 000 à 24 000 BTU. Recherche non destructive jusqu'à 45 minutes sur place, contrôles professionnels adaptés et explication des constats. Sans ouverture du circuit frigorifique, réparation, recharge, démontage lourd ni garantie de localiser la panne. Une investigation prolongée nécessite un devis accepté avant continuation. Le client accepte le prix et la limite avant déplacement.

**Entretien courant — 300 MAD.** Un appareil fonctionnel de 7 000 à 24 000 BTU, avec accès sûr aux deux unités. Filtres lavables, surfaces et échangeurs accessibles sans démontage lourd, contrôle de l'évacuation accessible et essai. Produits compatibles, protection de la zone et petits consommables compris. Ce n'est pas un contrat annuel : le forfait couvre une visite. Absence de froid, fuite ou bruit anormal : diagnostic avant promesse de résolution par nettoyage.

**Nettoyage approfondi — 450 MAD.** Même appareil et accès ; entretien courant plus nettoyage humide approfondi de l'échangeur intérieur, de la turbine en place et du bac accessible, avec protection de collecte. Extraction de turbine, dépose complète du bloc intérieur, circuit frigorifique ouvert et nettoyage nécessitant une réparation sont exclus. Le libellé public doit devenir « Nettoyage approfondi », sans promesse de désinfection certifiée, d'élimination garantie de microbes ou d'effet sanitaire. Le code historique `climatisation.desinfection_profonde` peut être conservé pour compatibilité interne, avec textes harmonisés.

**Pose 3 m / 5 m — 1 025 / 1 290 MAD.** Un mono-split mural neuf de **9 000 à 12 000 BTU**, R32 ou R410A, fourni par le client avec ses deux unités et sa notice. Cette limite commerciale resserre l'ancien périmètre de 7 000 à 24 000 BTU afin de borner le kit et la manutention. Autre puissance ou matériel réutilisé : devis.

- Pose des deux unités, support adapté, deux tubes cuivre isolés de diamètres conformes au matériel, câble inter-unités, évacuation gravitaire et petits matériaux inclus.
- Longueur mesurée sur **un parcours commun aux deux tubes**, et non en additionnant leur longueur. Jusqu'à 3 m pour le premier forfait ; plus de 3 m jusqu'à 5 m pour le second. Les longueurs minimales et maximales du fabricant restent à respecter.
- Un perçage simple dans une paroi non structurelle de 25 cm maximum ; point intérieur à 2,80 m maximum, accès dégagé depuis un sol stable. Unité extérieure accessible depuis une surface stable protégée, sans travail en façade, cordes, nacelle ni manutention spéciale.
- Alimentation électrique adaptée déjà présente, emplacement et support vérifiés par le professionnel. Contrôles d'étanchéité adaptés, tirage au vide et mise en service selon la notice inclus dans le travail ; aucune instruction de manipulation n'est demandée au client.
- Charge d'usine suffisante pour la liaison réellement posée, confirmée par le professionnel. Aucun appoint de fluide inclus dans ces deux forfaits. Besoin d'appoint : devis complet accepté avant travaux.
- Sans dépose d'ancien appareil, nouveau circuit électrique, carottage structurel, pompe de relevage, goulotte décorative, reprise de peinture ou fourniture du climatiseur.

Le partenaire doit confirmer en amont le matériel, la faisabilité, le kit et son prix fixe à partir des informations disponibles, puis vérifier les conditions sur place avant travaux. Une simple déclaration client ne remplace pas ces vérifications. Une condition impossible à confirmer mène à une qualification ou un devis explicite, sans facturer automatiquement un diagnostic non commandé.

**Dépose — 460 MAD.** Un mono-split mural fonctionnel de 7 000 à 24 000 BTU, R32 ou R410A, deux unités accessibles sans travail en façade. Gestion du fluide selon le matériel et la procédure professionnelle adaptée, déconnexion sécurisée, dépose des unités et du support simple, obturation des raccords et de la traversée simple. Appareils laissés sur place. Transport, évacuation, réinstallation, compresseur hors service, récupération complexe et remise en état du mur exclus. FIXEO doit exiger l'absence de rejet volontaire du fluide ; ne pas imposer une méthode unique à tous les équipements.

Les règles sur les hauteurs, puissances et quantités sont les **bornes commerciales de la proposition**, pas une certification technique ou réglementaire. Plusieurs appareils, cassette, gainable, multi-split, réseau collectif, accès spécial ou besoin industriel : devis. Pas de multiplication automatique de forfaits ni de frais de déplacement.

## Diagnostic absorbé : deux suites possibles

Si le diagnostic commandé montre qu'un entretien courant ou approfondi suffit, effectué sur **le même appareil, par le même artisan et pendant la même visite**, le client accepte une proposition explicite : le total d'entretien remplace le diagnostic. Une seule mission et un seul frais FIXEO de 60 MAD.

| Suite acceptée | Total final | Diagnostic déjà payé | Solde client |
|---|---:|---:|---:|
| Entretien courant | 300 | 260 | **40** |
| Nettoyage approfondi | 450 | 260 | **190** |

Crédit admis : 0 ou 260 MAD, déclaré par l'artisan et confirmé par le client ; aucun paiement bancaire n'est présumé vérifié. Paiement partiel ou désaccord : résolution préalable. Proposition valable 45 minutes ; refus, expiration et répétition traités sans surcoût ni duplication. Le règlement utilise le total effectif, pas seulement le solde. Les offres d'origine restent immuables.

Si aucun entretien n'est accepté ou effectué, seul le diagnostic commandé et effectué reste dû. Réparation de fuite, installation, dépose, pièces ou seconde visite : devis distinct indiquant explicitement tout éventuel crédit de diagnostic. Aucune absorption ni double facturation implicite.

## Sorties du forfait et qualification

Les demandes de recharge, de fuite de fluide ou d'appareil qui ne refroidit plus passent par une qualification/diagnostic adapté puis un devis précisant la réparation, les contrôles, le vide et le fluide réellement nécessaire. Le pilote ne propose aucun forfait de recharge « à l'aveugle ». Le R22 n'est pas remplacé automatiquement par un autre fluide ; les situations correspondantes demandent un spécialiste et un devis. Cette proposition n'affirme aucune interdiction légale générale sur la base d'une référence ancienne.

Le client confirme seulement des éléments visibles ou déjà connus : nombre, type d'appareil, fonctionnement, accès, puissance connue ou photo prise sans grimper, ouverture ni manipulation. « Je ne sais pas » déclenche une qualification, jamais une attestation technique inventée. Les compétences, outils adaptés au fluide, protections électriques, compatibilité du kit et contrôles avant/après travaux relèvent du professionnel.

Fumée, odeur de brûlé, étincelles, eau sur parties électriques, support instable ou fuite de fluide suspectée présentant un danger arrêtent le forfait ordinaire. Cette protection doit fonctionner au démarrage, aux réponses, dans le moteur et avant persistance d'offre. Les vieux indicateurs de danger déjà disponibles doivent aussi être pris en compte.

## Repères externes et limites

[Afous — climatisation/chauffage](https://afous.ma/prix/climatisation-chauffage), consulté le 21 septembre 2026, indique 200–280 MAD pour le nettoyage de filtres et 330–410 MAD pour une recharge non spécifiée. Ce sont des estimations de plateforme ; le déplacement et le type/poids de fluide ne sont pas décomposés. Notre entretien à 300 MAD couvre davantage que les filtres. La fourchette de recharge ne permet pas de construire un forfait précis.

La [page Mano Casablanca](https://mano.ma/climatisation-a-casablanca/), consultée le même jour, présente des services sur devis sans grille chiffrée comparable. L'ancienne référence `https://mano.ma/prix-climatiseur-maroc/` renvoie une erreur HTTP 404 lors de cette vérification : ses anciennes fourchettes ne sont pas reprises comme observations actuelles.

Les six tarifs sont donc **des propositions commerciales FIXEO**, non un consensus de marché établi. Aucune source actuelle ne valide ici les achats de kits à 450/600 MAD, ni une rentabilité ou disponibilité identique dans chaque ville. Leur faisabilité doit être confirmée par les partenaires avant acceptation d'une pose au forfait.

## Économie artisan : hypothèses transparentes

Coûts internes de sensibilité, non vérifiés par factures : déplacement 40 MAD (scénario défavorable 60), consommables/usage d'outillage 0 pour diagnostic, 20 pour courant, 40 pour approfondi, 20 pour pose et dépose. Pour les poses, coût du kit supposé égal au forfait de fournitures, puis scénario de dépassement de 20 %. Temps, charges, assurance et amortissement complet restent à couvrir.

| Prestation | VAP | Reste après coûts supposés, hors temps/charges | Scénario déplacement 60 et kits +20 % |
|---|---:|---:|---:|
| Diagnostic | 200 | 160 | 140 |
| Entretien courant | 240 | 180 | 160 |
| Nettoyage approfondi | 390 | 310 | 290 |
| Pose 3 m | 500 | 440 | 330 |
| Pose 5 m | 600 | 540 | 400 |
| Dépose | 400 | 340 | 320 |

À titre de comparaison arithmétique, une retenue historique de 15 % sur les anciens totaux 250/300/450/1000/1200/550 donnerait 212,50/255/382,50/850/1020/467,50 MAD à l'artisan avant ses coûts. Ces montants ne sont pas des recettes réellement constatées. Les poses comprennent de la fourniture ; leur rétention proposée est 950/1200 MAD avant achat du kit. Diagnostic et entretien courant versent respectivement 12,50/15 MAD de moins que cette référence théorique, tandis que le nettoyage approfondi verse 7,50 MAD de plus. La dépose proposée verse 67,50 MAD de moins mais son périmètre exclut désormais les récupérations complexes et appareils en panne. Suivre l'acceptation artisan avant élargissement ; aucun gain de marge n'est présenté comme prouvé.

Hypothèses du kit 3 m : cuivre/isolant 250, support 90, câble 50, évacuation 30, petits matériaux 30 = 450 MAD. Kit 5 m : 370 + 90 + 65 + 45 + 30 = 600 MAD. La différence de total entre poses, 265 MAD, se décompose en 100 de prestation, 15 de frais et 150 de fournitures. Aucun mètre supplémentaire ni dépassement n'est ajouté automatiquement.

## Audit initial — constats sur la base avant intégration

1. Aucune entrée climatisation ne figure dans le catalogue VAP approuvé. Les indicateurs `production_ready=false` du registre ne suffisent pas à arrêter les chemins historiques du moteur.
2. Diagnostic, entretien et dépose atteignent `READY_FOR_ENGINE` avec seulement `ac_count=1`. L'appel direct d'entretien avec `smoke=true` renvoie encore 300 MAD. Ajouter une qualification commune stricte et les mêmes protections à chaque point d'entrée.
3. `climatisation.installation.cassette` affiche « cassette/encastré » mais décrit et calcule une installation murale 5 m. Créer `climatisation.installation.mono_split_5m`, garder le code cassette sur devis, et requalifier les nouvelles demandes. Ne jamais réinterpréter silencieusement une offre ou mission ancienne.
4. `climatisation.reparation_fuite_recharge` indique du fluide inclus alors que sa note explique que les 600 MAD ne couvrent que la réparation. Retirer ce forfait ambigu des offres fermes et des choix de conversion ; présenter un devis complet préalable.
5. L'appel direct de `recharge_gaz_r22` sans données produit 250 MAD. Fermer cet accès historique et bloquer tout retour à un ancien prix si une condition ou une ville n'est pas approuvée.
6. Le nettoyage dit « désinfection » exige des libellés et limites cohérents sur l'estimateur, les cartes de services, le suivi et les interfaces artisan. Les lots de plusieurs appareils passent sur devis pour ce pilote.
7. Implémenter les vérifications professionnelles, puis l'absorption consentie du diagnostic pour les deux nettoyages, sur une seule mission. Les RPC plomberie/électricité actuelles ne couvrent pas ce métier.
8. Conserver les offres historiques immuables et vérifier l'absence de régression des autres métiers. Les deux rapports de prix protégés ne doivent pas être modifiés.

Vérification de cette proposition : calcul des six décompositions par `buildBreakdown`, couverture exacte des 20 villes existantes, 120 couples service/ville uniques, crédits de diagnostic et sommes des kits. Les constats moteur ci-dessus ont été reproduits localement sur la base auditée. Aucun nouveau test de production.

## Validation et résultat intégré

Le 21 septembre 2026, le propriétaire a confirmé : « Je valide cette grille et ce périmètre pour les 20 villes ». La validation commerciale couvre les six forfaits ci-dessus. Le propriétaire a ensuite autorisé explicitement la migration en production et le déploiement sur Fixeo.ma.

Les huit corrections de l’audit initial sont intégrées : questions communes et protections dans chaque chemin du moteur, contrôle des réponses préremplies (y compris signaux de danger), 120 entrées VAP, code distinct pour la pose 5 m, arrêt des forfaits historiques recharge/cassette, libellé « Nettoyage approfondi », propositions d’entretien consenties et offres immuables. Aucun autre service du registre n’a été modifié ; les entrées VAP des métiers précédents sont inchangées.

La pose demande quatre confirmations professionnelles **avant acceptation** : périmètre et modèle, compétences/outillage, charge d’usine suffisante, kit disponible au prix fixe. Le contrôle est imposé aussi par le déclencheur financier des missions, sur les parcours d’acceptation V1 et V2. Puis l’artisan enregistre ses vérifications sur place avant travaux et, après pose, les contrôles d’étanchéité, tirage au vide et mise en service effectivement réalisés. La clôture et le règlement restent bloqués sans ces attestations. Il s’agit de déclarations professionnelles enregistrées, pas d’une certification indépendante du travail.

Les deux entretiens peuvent remplacer un diagnostic pendant la même visite, après vérifications artisan et accord explicite du client. Un seul total, une seule mission, un seul frais de 60 MAD ; crédit de diagnostic 0 ou 260 MAD confirmé par les deux parties. Installation et dépose ne peuvent pas être proposées dans cette conversion.

**Vérification : 122 tests automatisés réussis.** Exécution du moteur et des API avec réseau simulé, interfaces DOM et PostgreSQL isolé via PGlite. Les tests couvrent les 120 couples service/ville, les limites et refus, les offres signées, réservation et dispatch, les fonctions de production d’acceptation V1/V2 et de démarrage (copies en lecture seule), la mise en service, le règlement, les crédits 40/190 MAD, refus/expiration/répétition, propriété des missions, droits et audit immuable. Les tests existants plomberie/électricité s’exécutent également après la nouvelle migration pour contrôler le déclencheur partagé. Aucun appel de réservation, dispatch, paiement ou notification en production.

Commande : `NODE_PATH=/workspace/scratch/7e6d7edda414/test-deps/node_modules node --test tests/estimator/*.test.cjs`.

## Migration appliquée et déploiement

Fichier : `supabase/migrations/20260921142222_climatisation_same_visit_service.sql`, créé avec la CLI Supabase. Précondition : empreinte de la fonction financière actuelle `cc844ebe2d4fe7d4f2a90182cca2adac`, vérifiée en lecture seule. Délai de verrouillage 3 s et délai d’exécution 30 s. Aucune mise à jour historique : création de cinq tables privées avec RLS, refus d’accès direct, écritures contrôlées et immuables ; quatre fonctions authentifiées artisan et deux fonctions serveur pour suivi client/administration ; extension du déclencheur financier existant.

Les fonctions utilisent un `search_path` vide et des droits explicites. L’audit de sécurité Supabase lu avant livraison conserve les alertes préexistantes : 7 informations RLS sans politique (tables privées), 3 vues SECURITY DEFINER, 4 fonctions avec search_path mutable, 9 fonctions accessibles anonymement, 47 fonctions authentifiées signalées et 1 avertissement de protection des mots de passe. Ces alertes appartiennent à la base existante ; cette PR ne prétend pas les corriger. Les nouvelles tables privées n’ont volontairement aucune politique d’accès direct : seules les fonctions autorisées les utilisent.

Migration appliquée sous la version Supabase `20260921144905`, SHA256 `0f4dfb34bf87d68aea8bf81f80517a4f2db50e03b811fca147534d24fb4aea08`. Les dix fonctions correspondent exactement au SQL testé ; les cinq tables privées ont les droits et déclencheurs attendus. Les 23 missions, 118 demandes et 41 offres préexistantes sont préservées ; empreintes financières et liens demande/offre inchangés. PR #40 fusionnée au commit `210feaa97b7264860b8f0faf4cdf84fe1380b0f8`, compilation et déploiement Vercel réussis. Les 16 fichiers publics contrôlés et les 120 entrées du catalogue correspondent au code testé. Les vérifications de prix créent seulement des offres temporaires non réservées, sans mission ni dispatch. Les missions existantes restent des données de test selon la déclaration du propriétaire ; aucune suppression ni reclassification automatique. WhatsApp et paiement carte ne sont pas activés par cette livraison.

Message de commit : `feat(climatisation): integrate approved VAP tariffs and verified service lifecycle`.

## Correctif de la route publique vers le diagnostic

Le contrôle de livraison a révélé que la normalisation de l’API supprimait les destinations structurées de diagnostic. Le moteur écartait bien la recharge ou l’entretien d’un appareil en panne, mais le bouton vers le diagnostic ne recevait plus sa destination. Le correctif conserve seulement la destination autorisée, l’éventuel opérateur électrique et le message public, sans exposer les données internes. Les routes historiques textuelles restent compatibles. Trois tests ajoutés contrôlent la liste blanche, les vrais appels API start/evaluate sans offre payable et le rendu navigateur ; suite complète portée à 125 tests.

Message de commit du correctif : `fix(estimator): preserve public diagnostic routing after qualification`.
