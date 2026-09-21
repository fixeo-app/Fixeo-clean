# Électricité — pilote VAP validé, intégration prête à déployer

État au 21 septembre 2026 : **tarifs et périmètres approuvés par le propriétaire pour les 20 villes**. Intégration réalisée et testée sur la branche `docs/electricity-vap-calibration-v1`, PR #39. Migration et déploiement en production en attente ; le site public sert encore la version précédente.
Base auditée : `5391869683ee373714107656f525f9639370f36d`, après livraison de la plomberie.
Grille structurée : `data/pricing/research/electricite/vap-proposal.v1.json` ; version : `electricity-pilot-v1`.

## Grille validée

Même prix dans les 20 villes du catalogue actuel, sous réserve de disponibilité d'un artisan qualifié. Les montants sont en MAD.

| Prestation | Part artisan VAP | Frais FIXEO | Total client | Ancien total de référence |
|---|---:|---:|---:|---:|
| Diagnostic électrique local, jusqu'à 45 minutes sur place | 180 | 60 | **240** | 200 |
| Remplacement d'une prise standard | 200 | 60 | **260** | 220 |
| Remplacement d'un interrupteur simple | 200 | 60 | **260** | 220 |
| Remplacement d'un va-et-vient : deux interrupteurs d'un circuit | 240 | 60 | **300** | 250 |
| Pose d'un plafonnier ou d'une applique simple | 220 | 60 | **280** | 220 |
| Remplacement d'un disjoncteur divisionnaire simple confirmé défectueux | 250 | 60 | **310** | 250 |

Les anciens montants sont des prix client globaux : les réutiliser comme VAP ajouterait mécaniquement des frais sans recalibrer la rémunération. La VAP validée est la somme conservée par l'artisan après reversement des frais FIXEO, avant ses coûts, charges et impôts. Les frais suivent BP3.3 : le minimum de 60 MAD s'applique à ces six VAP. Aucun coefficient automatique de ville, d'urgence, de nuit ou de week-end.

Main-d'œuvre, déplacement dans la ville choisie, outillage, vérifications professionnelles liées au travail et petits consommables nécessaires au périmètre sont inclus. Budget interne de consommables : 15 MAD par réparation ; ce budget n'autorise aucun supplément. Les pièces principales sont fournies par le client, disponibles avant intervention et vérifiées par l'artisan. Une fourniture par l'artisan exige un devis distinct accepté au préalable ; aucun achat, remboursement ou seconde visite n'est inclus dans ce pilote. `materials_minor = 0` signifie absence de ligne de fourniture facturée, pas absence de coûts artisan.

## Périmètres précis

- **Diagnostic :** un problème électrique local dans un logement, inspection et recherche non invasive jusqu'à 45 minutes sur place, mesures appropriées et explication des constats. Aucune réparation, pièce, recherche destructive, certification, audit complet ni rapport réglementaire. Une panne non localisée ne garantit pas un résultat ; la limite et le prix doivent être acceptés avant le déplacement. Une investigation prolongée nécessite un devis accepté avant continuation.
- **Prise :** une prise intérieure standard remplacée au même emplacement, boîtier et câblage existants réutilisables après contrôle professionnel. Hors prises spécialisées, circuit neuf, saignée, déplacement de prise et réparation de terre ou de câblage.
- **Interrupteur simple :** un appareil standard commandant un circuit existant depuis un seul point, remplacé au même emplacement. Hors variateur, appareil connecté, programmation et modification de circuit.
- **Va-et-vient :** remplacement des **deux interrupteurs** existants commandant un même éclairage, avec les deux appareils fournis par le client. Identification et essai des deux commandes inclus. Hors création d'un va-et-vient, ajout de point, recâblage, télérupteur ou commande depuis plus de deux endroits. Le prix n'est ni un prix par interrupteur ni un lot libre de deux travaux.
- **Luminaire :** un plafonnier ou une applique simple, au plus 3 kg et point de pose au plus 2,80 m, fixation existante adaptée et réutilisable, point électrique déjà fonctionnel ; dépose de l'ancien appareil simple incluse. Sol stable et dégagé, sans escalier ni accès spécial. Lustre, spots encastrés, nouveau perçage structurel, éclairage extérieur ou connecté : devis. Les limites de poids et hauteur sont des bornes commerciales proposées, pas des normes électriques. L'artisan vérifie la fixation et les protections requises par le matériel ; une protection nécessaire absente exclut la pose, même avec l'accord du client.
- **Disjoncteur :** un disjoncteur divisionnaire modulaire simple dans un tableau résidentiel privé monophasé, panne propre à l'appareil confirmée par l'artisan, remplacement compatible disponible, sans dommage de câblage ni de peigne. Hors différentiel, tableau complet, triphasé et équipement du distributeur. Des déclenchements répétés ou une cause incertaine conduisent d'abord à un diagnostic, sans promesse de remplacement. La compatibilité est contrôlée par le professionnel ; aucune augmentation de calibre pour faire disparaître un déclenchement.

Ces réparations sont à l'unité, sauf le va-et-vient explicitement composé de deux commandes. Plusieurs prises, luminaires ou réparations différentes lors d'une visite passent sur devis : aucun empilement automatique de forfaits ou de frais de déplacement.

## Qualification et arrêt du forfait

L'estimateur doit confirmer un logement privé, l'équipement et le nombre prévus, l'accès, le travail demandé, les pièces disponibles et l'absence de signe apparent de danger. Il doit proposer « Je ne sais pas » plutôt que demander au client de contrôler une installation. Le client n'ouvre aucun boîtier ou tableau et ne réalise aucun test électrique pour répondre.

Les vérifications techniques de câblage, terre, fixation, compatibilité et possibilité de travailler hors tension relèvent de l'artisan avant travaux. Elles ne peuvent pas être attestées à distance par une case client. Condition incertaine : diagnostic ou devis explicite, pas de prix de réparation inconditionnel. Hors périmètre découvert sur place : arrêt, explication et accord sur une nouvelle proposition avant travaux ; aucun supplément ni conversion payante automatique.

Fumée, odeur de brûlé, traces de chauffe, étincelles, conducteurs accessibles ou eau au contact d'un équipement électrique arrêtent le parcours de forfait ordinaire. Le parcours doit orienter vers une prise en charge adaptée au danger, sans demander au client de manipuler l'installation. Un équipement identifié comme relevant du distributeur est orienté vers l'opérateur local avant réservation, sans vente automatique d'un diagnostic FIXEO. Si cette origine n'est découverte qu'après un diagnostic réellement commandé et effectué, seul le diagnostic accepté peut rester dû.

## Diagnostic absorbé pendant la même visite

Règle validée, implémentée sur la branche : si le diagnostic aboutit à l'une des cinq réparations ci-dessus, acceptée par le client et réalisée par le même artisan pendant la même visite, **le total de la réparation remplace celui du diagnostic**. Une seule mission et une seule commission FIXEO de 60 MAD ; pas de diagnostic ajouté au forfait.

| Réparation acceptée | Total final de la mission | Diagnostic déjà versé | Reste client |
|---|---:|---:|---:|
| Prise ou interrupteur simple | 260 | 240 | **20** |
| Va-et-vient, deux interrupteurs | 300 | 240 | **60** |
| Luminaire simple | 280 | 240 | **40** |
| Disjoncteur divisionnaire | 310 | 240 | **70** |

Si rien n'a été versé, le reste est le total final. Le crédit de 0 ou 240 MAD doit être déclaré par l'artisan et confirmé par le client ; un désaccord ou montant partiel requiert une résolution avant conversion. Il ne s'agit pas d'un paiement bancaire vérifié. Le règlement administratif et le revenu artisan portent sur le total final, pas seulement sur le solde en espèces. Refus, expiration ou diagnostic sans réparation : le diagnostic accepté reste à 240 MAD. Seconde visite ou réparation hors pilote : nouveau devis, sans appliquer silencieusement cette absorption. Aucune réparation non effectuée ne doit être soldée comme effectuée.

## Repères de marché consultés le 21 septembre 2026

Ces pages donnent des indications de marché, pas des offres partenaires fermes ni des prix comparables sur tous les postes.

- [Afous — électricien](https://afous.ma/prix/electricien) affiche 90–160 MAD par prise/interrupteur et 190–280 MAD au forfait pour un disjoncteur ; les prestations indiquent respectivement 13 et 12 relevés. Déplacement et matériel ne sont pas décomposés. Les anciens dossiers FIXEO mentionnaient d'autres valeurs et 480 relevés : ces données historiques ne sont pas reprises comme observations actuelles.
- [Mano — prix électricien au Maroc](https://mano.ma/prix-electricien-au-maroc/) donne 200–500 MAD pour la recherche de panne, 150–300 MAD pour un plafonnier simple et 200–400 MAD pour une petite réparation. Le guide évoque un déplacement urbain de 50–100 MAD, parfois inclus. Les périmètres et fournitures restent hétérogènes ; ne pas additionner ce déplacement à tous les forfaits par défaut.
- [Bnidari — tarifs électricien](https://www.bnidari.ma/tarifs/electricien) indique 150–500 MAD par point/intervention, avec un périmètre pouvant inclure gaines et câbles. Cette référence est trop large pour fixer un remplacement simple et ne sert pas d'ancrage chiffré.

Les montants validés sont des choix commerciaux FIXEO. Le diagnostic reste dans le repère Mano ; la prise et le simple sont au-dessus du repère unitaire Afous mais incluent une visite autonome et les frais FIXEO. Le va-et-vient couvre deux commandes. Le total disjoncteur de 310 MAD dépasse la borne Afous de 280 MAD, avec un écart de périmètre non résolu : son acceptation terrain doit être suivie, sans le présenter comme un consensus de marché. Aucune mesure de demande ou d'acceptation artisan n'a été réalisée pour cette proposition.

## Économie artisan : hypothèses, pas bénéfice net

Comparaison de référence avec une retenue historique de 15 % du prix client ; ce calcul ne remplace pas les montants réellement enregistrés sur les anciennes missions. Les coûts ci-dessous sont des hypothèses internes reprises pour sensibilité, sans validation par devis artisan : 40 MAD de déplacement et jusqu'à 15 MAD de consommables par réparation.

| Prestation | Ancienne retenue artisan théorique | VAP validée | Écart | Reste après déplacement de 40 et consommables |
|---|---:|---:|---:|---:|
| Diagnostic | 170 | 180 | +10 | 140 |
| Prise | 187 | 200 | +13 | 145 |
| Interrupteur simple | 187 | 200 | +13 | 145 |
| Va-et-vient, deux commandes | 212,50 | 240 | +27,50 | 185 |
| Luminaire | 187 | 220 | +33 | 165 |
| Disjoncteur | 212,50 | 250 | +37,50 | 195 |

Avec 60 MAD de déplacement, ces restes diminuent de 20 MAD. Le temps de travail, les charges, l'outillage et l'assurance restent à couvrir. Les remplacements complexes sont exclus précisément pour garder un forfait borné. Suivre durée réelle, déplacement, consommables, acceptation client/artisan et sorties de périmètre avant d'élargir ; ne pas prétendre qu'un seuil de rentabilité est prouvé.

## Audit initial de la base et corrections apportées

L'audit local de la base indiquée confirme les six anciens montants. Aucune entrée `electricite.*` n'existe dans `vap-approved-v1.json`. Les drapeaux historiques de préparation dans le registre de recherche ne désactivent pas le parcours existant.

1. La prise, les interrupteurs et le luminaire peuvent actuellement produire un prix sans qualification détaillée du nombre, de l'accès ou des pièces. Le luminaire pose une question sur un différentiel, sans rapport suffisant avec son périmètre. Définir les questions propres à chaque prestation et un module de périmètre partagé, avec contrôles serveur bloquants.
2. Les arrêts de sécurité et certaines orientations sont appliqués lors des réponses aux questions, sans résultat équivalent garanti pour les réponses déjà présentes au démarrage ou l'appel direct du moteur. La reproduction locale donne notamment un prix de prise avec une trace de chauffe pré-renseignée ; une réponse interactive à l'odeur de brûlé arrête bien le parcours. Imposer les mêmes arrêts au moteur et à chaque point d'entrée avant d'ajouter des offres électriques.
3. Un disjoncteur déclaré à déclenchements répétés produit actuellement `QUOTE_REQUIRED`, au lieu d'une orientation explicite vers le diagnostic. L'équipement distributeur pré-renseigné produit aussi un devis générique, tandis que la réponse interactive produit une orientation. Unifier ces décisions et retirer la facturation automatique suggérée par certains anciens textes de politique.
4. Le diagnostic local sort avec `absorption_possible=false`. L'ancien dossier contient pourtant une absorption et une référence d'interrupteur non déclinée. Utiliser les cinq codes réels et implémenter la conversion consentie de 240 MAD ; le mécanisme déployé pour la plomberie est spécifique à ce métier et ne couvre pas l'électricité.
5. Le dossier historique laisse au client un choix ambigu sur la terre d'un luminaire. Le pilote doit exclure une pose dont une protection nécessaire est absente. Harmoniser textes, qualification, notice artisan et restitution client, sans transformer une réparation en promesse de conformité globale.
6. Après validation commerciale, ajouter les 120 entrées approuvées, bloquer tout retour au tarif historique lorsqu'une entrée ou condition manque, conserver les offres immuables et répercuter l'accord de réparation sur règlement et interfaces. Préserver intégralement les missions historiques et la plomberie déjà livrée.

## Parcours livré sur la branche

Les points 1 à 6 ci-dessus sont traités. Les questions et limites partagées sont dans `data/pricing/engine/electricity-pilot-v1.js`. L’estimateur dispose de 120 entrées approuvées, d’un arrêt serveur cohérent pour les réponses interactives ou pré-renseignées, et d’un blocage des anciens prix lorsque le périmètre ou la ville ne correspond pas. La situation « disjoncteur qui saute » propose désormais le diagnostic ; aucune offre n’est émise pour le distributeur ou un danger signalé.

Le bouton artisan « Vérifications / réparation électrique » ouvre le suivi de la mission. Pour une réparation réservée directement, le professionnel confirme les contrôles de périmètre, sécurité, installation et pièce ; pour un disjoncteur, il confirme également le défaut de l’appareil. Les attestations sont conservées dans une table privée immuable. Une réparation ne peut être clôturée ou réglée sans cette confirmation. Le client ne remplit jamais ces attestations techniques.

Pour une mission de diagnostic en cours, l’artisan vérifie le périmètre et les conditions professionnelles, confirme la même visite et déclare 0 ou 240 MAD encaissés. Le client accepte ou refuse la proposition dans son suivi. L’accord porte sur le total, le périmètre et le crédit déclaré. La proposition expire après 45 minutes ; toute nouvelle proposition remplace la précédente en attente. Un accord est irréversible par simple répétition d’une requête. Les montants initiaux restent immuables dans l’offre ; seule la réparation acceptée fixe le total effectif de la mission. Les refus, propositions expirées, crédits partiels ou litigieux ne déclenchent aucun supplément automatique.

Le règlement et les interfaces artisan utilisent le total effectif et une commission de 60 MAD. Le mécanisme de plomberie reste inchangé et couvert par ses tests après la nouvelle migration. Les offres historiques et les autres métiers ne sont pas recalculés. Aucun paiement par carte, notification, nouveau dispatch ou envoi WhatsApp n’est ajouté au parcours de réparation.

## Vérification réalisée

Commande : `NODE_PATH=/workspace/scratch/7e6d7edda414/test-deps/node_modules node --test tests/estimator/*.test.cjs` — **106 tests réussis**. Les 13 tests propres à l’électricité couvrent les 120 entrées, la qualification et les textes affichés, les limites de hauteur/poids/quantité, les arrêts serveur, l’API réelle avec offres signées, les six chaînes offre → réservation atomique → dispatch → règlement dans PostgreSQL local, les cinq réparations avec crédit nul ou intégral, l’accord explicite, les vérifications artisan, les droits d’accès, les répétitions, refus, propositions remplacées et expirées. Un cas utilise volontairement le même identifiant de proposition dans les deux métiers pour vérifier que leurs montants ne se mélangent pas.

La migration est exécutée dans PostgreSQL local via PGlite, après les migrations existantes, avec les fonctions de dispatch inspectées en production. Les tests plomberie passent avec le nouveau contrôle financier partagé. Un ancien test qui attendait un prix de prise sans aucune qualification a été adapté pour fournir le périmètre désormais obligatoire ; l’absence de réponses est couverte par les nouveaux tests de rejet. Les vérifications de routage ont été relancées après avoir restreint « disjoncteur qui saute » au diagnostic.

Comparaison structurelle à la base : toutes les entrées tarifaires et fiches de service des autres métiers sont identiques. Les rapports protégés `data/pricing/engine/engine-test-report.v1.json` et `data/pricing/shadow/shadow-results.v1.json` restent inchangés. Aucun test n’a créé de demande, mission ou paiement en production.

## Migration et ordre de publication

Migration préparée : `supabase/migrations/20260921132727_electricity_same_visit_repair.sql`.
SHA-256 : `6835152d453d6cee7d3488301108a1503ebc62cb0d75b3e472a27e3999c17721`.

Appliquer la migration avant de déployer ce code. Elle crée trois tables privées (propositions, décisions, vérifications), des RPC artisan limitées au propriétaire de la mission et des RPC client/admin réservées au serveur. RLS et révocation des accès directs sont explicites. Elle étend le contrôle financier commun pour prendre en compte les réparations acceptées des deux métiers. Aucun `UPDATE` ou recalcul de mission historique n’est exécuté lors de la migration.

Un contrôle préalable abortif exige la définition auditée du contrôle financier : MD5 `ccbf541b6dd0939a5ed54daff9b024a3`. Si elle a changé, réexaminer le changement avant application. L’inspection en production a relevé 23 missions, aucune mission VAP. Empreinte de contrôle des identifiants et montants, avec sérialisation séparée par `:` et `|` : `5d65622a767c61ef2affa823b9d6132e`.

L’audit de sécurité Supabase lu avant déploiement présente des alertes préexistantes (notamment trois vues publiques en `SECURITY DEFINER` et des fonctions historiques exposées). Elles ne sont pas modifiées par cette livraison. [Référence des contrôles Supabase](https://supabase.com/docs/guides/database/database-linter). Les nouvelles tables privées sont volontairement sans politique d’accès client ; seules les fonctions autorisées y accèdent.

Après migration et déploiement : vérifier la version publiée, les six montants dans les 20 villes, les arrêts sans offre, les ressources réellement servies, les permissions des nouvelles RPC et l’empreinte des missions historiques. Ne pas créer de réservation, de dispatch ou de paiement réel pour cette vérification. La publication en production n’est pas réalisée dans ce checkpoint.

Message de commit : `feat(electricity): integrate approved VAP tariffs and consented same-visit repairs`
