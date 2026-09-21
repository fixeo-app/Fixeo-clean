# Plomberie — calibrage VAP proposé

État au 21 septembre 2026 : **audit et proposition commerciale terminés ; tarifs non approuvés, non intégrés et non déployés**.
Base vérifiée : `1acfc1fe8ba7aa574c91662c3defde0c5a53189a` (production après peinture avec fournitures).
Proposition structurée : `data/pricing/research/plomberie/vap-proposal.v1.json`.

## Pourquoi ce métier maintenant

Le catalogue VAP actif couvre jardinage, carrelage, maçonnerie, manutention et trois forfaits peinture. Les six prestations plomberie existent dans le registre historique, mais aucune n’a d’entrée approuvée dans `vap-approved-v1.json`. Elles peuvent encore suivre le calcul historique : l’absence d’entrée VAP ne signifie pas que la plomberie est absente du site.

La plomberie est proposée comme prochaine priorité parce que ces six situations sont déjà reliées au parcours RAFI et que leurs frontières sont auditables : fuite visible, appareil bouché isolé, remplacement d’un équipement standard et diagnostic. Cette priorité est une décision de produit ; aucune statistique récente de demandes n’a été consultée pour prétendre qu’il s’agit du métier le plus demandé.

## Grille proposée à la validation du propriétaire

Les anciens montants sont des totaux client issus du document `human-decision.v0.3.md`, approuvé le 9 août 2026. Ils ne constituent pas une rémunération artisan sous BP3.3. La nouvelle proposition reconstruit les trois composantes explicitement.

| Service, une intervention | Ancien total de référence | Prestation artisan proposée | Frais FIXEO BP3.3 | Nouveau total proposé |
|---|---:|---:|---:|---:|
| Diagnostic seul | 180 MAD | 160 MAD | 60 MAD | **220 MAD** |
| Fuite simple visible | 250 MAD | 220 MAD | 60 MAD | **280 MAD** |
| Débouchage évier ou lavabo | 250 MAD | 220 MAD | 60 MAD | **280 MAD** |
| Débouchage WC simple | 300 MAD | 270 MAD | 60 MAD | **330 MAD** |
| Remplacement robinet standard | 250 MAD | 220 MAD | 60 MAD | **280 MAD** |
| Remplacement mécanisme de chasse d’eau | 300 MAD | 270 MAD | 60 MAD | **330 MAD** |

Les frais de 60 MAD résultent du minimum BP3.3 déjà utilisé sur FIXEO : 15 % de 160, 220 ou 270 MAD est inférieur à ce minimum. Aucun nouveau taux, supplément de ville, supplément automatique d’urgence ou minimum d’intervention additionnel n’est proposé.

Proposition identique pour les 20 villes du catalogue, déplacement dans la ville choisie inclus, sous réserve de disponibilité de l’artisan. La rémunération artisan proposée est légèrement supérieure à l’ancienne rétention après commission de 15 % : 160 contre 153 MAD, 220 contre 212,50 MAD, 270 contre 255 MAD. Il s’agit de montants avant dépenses, pas d’un bénéfice garanti. Les temps, transports et achats réels ne sont pas validés par des missions terrain.

## Fournitures et périmètre

Les petits consommables et outils nécessaires dans le périmètre annoncé sont compris dans le montant artisan. `materials_minor: 0` signifie absence de ligne fournitures distincte, pas absence de coût ni inclusion de tous les équipements. Les plafonds de consommables sont des limites de périmètre, jamais des suppléments automatiques.

| Prestation | Inclus dans le forfait | Devis ou autre parcours |
|---|---|---|
| Diagnostic seul | Déplacement, examen visuel et vérifications simples accessibles d’un problème, explication au client | Réparation, détection spécialisée, ouverture de murs, démontage lourd, rapport certifié, second déplacement |
| Fuite simple | Un raccord visible accessible d’un équipement sanitaire, resserrage ou remplacement d’un joint standard, étanchéité et essai ; joints/téflon jusqu’à 50 MAD inclus | Fuite cachée, plusieurs points, remplacement de tuyau/robinet/flexible, corrosion importante, soudure, réseau collectif, gaz ou chauffe-eau |
| Évier/lavabo bouché | Un appareil isolé, siphon accessible, nettoyage/remontage et débouchage manuel local, essai d’écoulement | Plusieurs appareils refoulent, colonne collective, retour récurrent après intervention professionnelle, machine motorisée, siphon à remplacer, accès à ouvrir |
| WC bouché | Un WC classique sans broyeur, obstruction isolée traitable manuellement, essai d’écoulement | Dépose du WC, corps étranger nécessitant extraction spéciale, broyeur, colonne collective, refoulement multiple, intervention professionnelle précédente en échec |
| Robinet | Dépose et pose d’un robinet/mitigeur standard sur évier ou lavabo, raccordements existants compatibles, contrôle d’étanchéité ; petits consommables jusqu’à 50 MAD | Robinet absent/incompatible, flexibles/robinet d’arrêt à changer, raccords grippés, robinet encastré ou thermostatique, réseau à modifier |
| Chasse d’eau | Mécanisme standard fourni par le client sur WC au sol à réservoir apparent, montage/réglage et essai ; petits consommables jusqu’à 30 MAD | WC suspendu ou encastré, réservoir fissuré, alimentation défectueuse, mécanisme absent/incompatible, système propriétaire |

Le robinet ou mécanisme neuf compatible est fourni par le client. Si l’artisan doit acheter une pièce, son montant doit être annoncé et accepté séparément ; aucune pièce ne doit être ajoutée discrètement au prix réservé.

Le forfait réparation comprend sa vérification initiale. Aucune deuxième ligne diagnostic ne doit être ajoutée. Si le périmètre réel est différent ou si le débouchage simple échoue : arrêt, explication et prix accepté avant toute suite. Le montant dû pour une prestation effectivement réalisée doit être annoncé avant engagement ; on ne transforme pas après coup un échec en diagnostic payant sans accord préalable.

## Diagnostic suivi d’une réparation : décision financière à intégrer

Règle proposée, conforme au principe historique de non-cumul : **une réparation standard acceptée pendant la même visite remplace le diagnostic ; un seul total final et un seul frais FIXEO**.

| Exemple, même visite | Total final client | Diagnostic déjà payé | Solde client | Frais FIXEO totaux |
|---|---:|---:|---:|---:|
| Diagnostic puis fuite simple | 280 MAD | 220 MAD | **60 MAD** | **60 MAD** |
| Diagnostic puis chasse d’eau | 330 MAD | 220 MAD | **110 MAD** | **60 MAD** |

Si rien n’a été payé, seul le total final de réparation est dû. Si aucune réparation n’est réalisée, le diagnostic explicitement accepté demeure dû à 220 MAD. Retour un autre jour, matériel spécialisé ou réparation hors forfait : nouvelle proposition, sans absorption automatique promise.

Ce tableau est une règle commerciale et un contrôle arithmétique, **pas une fonctionnalité déjà livrée**. Le changement doit être atomique, lié à la même demande/mission et au consentement client, avec conservation des offres et des paiements passés. Une répétition ne doit pas créer un second solde ou une seconde commission. Les anciennes offres et missions conservent leurs conditions acceptées.

## Résultat de l’audit technique

1. `estimator-question-planner-v1.js` : aucune question pour le diagnostic ; une seule qualification générique `plumbing_scope` pour fuite/évier/WC ; seule question sur une pièce pour robinet/chasse. Ces réponses ne suffisent pas à garantir les périmètres ci-dessus.
2. `canonical-registry.v1.draft.json` : qualifications plomberie `OPEN`, prix historiques 180/250/300 MAD, aucun modèle plomberie versionné BP3.3. Les indicateurs historiques sont faux, mais ils ne constituent pas à eux seuls une désactivation du parcours courant.
3. `fixeo-vap-offers-v1.js` : l’absence de tarif approuvé est bloquante pour les métiers récemment calibrés ; la plomberie conserve un repli historique. La future intégration doit interdire ce repli pour les services migrés afin de ne pas contourner l’approbation.
4. Le calcul VAP générique du moteur produit actuellement un total mais ne conserve pas toutes les particularités `DIAGNOSTIC` et `LABOUR_FIXED_PART_SEPARATE`. Le nouveau forfait robinet/chasse doit afficher clairement un total d’intervention avec pièce fournie par le client, sans annoncer un achat de pièce inclus ou un supplément automatique.
5. La règle d’absorption figure dans le dossier historique. L’interface n’annonce qu’une déduction éventuelle ; le mapper et le moteur n’utilisent pas les mêmes champs d’absorption. Aucun passage diagnostic→réparation avec compensation de paiement n’a été identifié dans le parcours financier VAP inspecté.
6. `20260921012731_vap_booking_settlement_binding.sql` fige le montant accepté et refuse un `final_price` différent. Il ne faut pas contourner cette protection pour absorber le diagnostic. Il faut ajouter un passage contrôlé avec traçabilité ou conserver les cas de transition sur validation manuelle, sans promettre d’automatisation.

## Références externes et limites

Consultation du 21 septembre 2026 : [Hanæ, plombier Casablanca](https://hanae.ma/plombier-casablanca) présente des repères indicatifs, mis à jour en avril 2026, et précise qu’il ne s’agit pas de sa grille de vente. Fourchettes annoncées : fuite de robinet/joint 150–350 MAD, évier/lavabo 200–450 MAD, WC 250–500 MAD, remplacement de mitigeur 200–500 MAD. Les forfaits proposés sont à l’intérieur de ces repères ; les périmètres ne sont toutefois pas identiques et aucune moyenne transactionnelle FIXEO n’en est déduite.

[Mano, guide plomberie Maroc](https://mano.ma/prix-plombier-au-maroc/) affiche également des fourchettes larges et précise que les pièces sont généralement séparées. Cette source est utilisée comme contexte, pas comme preuve d’un tarif national ou comme base de majorations automatiques. Les prix 220/280/330 MAD restent une proposition commerciale FIXEO à approuver et à mesurer sur le terrain.

## Livraison de cette étape

La grille structurée comporte six candidats non approuvés et les 20 villes proposées. Les totaux et frais sont calculés avec le module BP3.3 existant ; les deux exemples de solde respectent l’égalité diagnostic payé + solde = réparation et une seule commission de 60 MAD.

Cette étape ajoute uniquement ce dossier et la proposition JSON de recherche. Aucun catalogue actif, code serveur, interface, SQL, prix en production ou rapport JSON protégé n’est modifié. Il n’y a donc pas de résultat E2E nouveau à annoncer. Après validation commerciale : intégration, tests de qualification et d’absorption, réservation→affectation→règlement, puis activation et contrôles en ligne.

Message de commit : `docs(pricing): propose plumbing calibration and diagnostic settlement rules`
