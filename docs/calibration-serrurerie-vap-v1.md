# Serrurerie — grille validée et déployée

État au 21 septembre 2026 : **grille et périmètre validés pour les 20 villes ; migration appliquée et déploiement sur Fixeo.ma vérifié après autorisation explicite**. Base auditée : `ad688e0e09a8e865995a91d42f302b0cf604f860`, après le déploiement climatisation. Proposition structurée : `data/pricing/research/serrurerie/vap-proposal.v1.json`.

Les six forfaits validés, les contrôles professionnels et l’absorption consentie du diagnostic sont intégrés. La migration est appliquée en production ; la PR nº42 est fusionnée et le déploiement Vercel a réussi. Les missions existantes sont des **missions de test**, selon le propriétaire : elles ne prouvent ni demande réelle, ni acceptation artisan, ni rentabilité. Elles restent inchangées.

## Six forfaits validés

Montants en MAD pour **une porte de logement et une prestation par réservation**, déplacement dans la ville choisie, outillage et petits consommables compris. Créneau pilote validé : **8 h–20 h**, sous réserve de disponibilité et de confirmation du périmètre par le professionnel. Même grille dans les 20 villes, sans majoration automatique de ville, d'urgence ou de week-end. Hors créneau : devis accepté avant déplacement.

| Prestation | VAP artisan | Pièce facturée dans le forfait | Frais FIXEO | Total FIXEO |
|---|---:|---:|---:|---:|
| Diagnostic non destructif, jusqu'à 30 min | 160 | 0 | 60 | **220** |
| Ouverture de porte standard simplement claquée | 200 | 0 | 60 | **260** |
| Ouverture de porte blindée simplement claquée, modèle compatible confirmé | 300 | 0 | 60 | **360** |
| Extraction de clé cassée, porte déjà ouverte | 200 | 0 | 60 | **260** |
| Remplacement d'un cylindre standard, pièce compatible fournie par le client | 240 | 0 | 60 | **300 hors pièce** |
| Remplacement d'une serrure monopoint à l'identique, pièce compatible fournie par le client | 340 | 0 | 60 | **400 hors pièce** |

Les frais suivent BP3.3 : à ces niveaux de VAP, le minimum de 60 MAD s'applique. L'artisan conserve la VAP après reversement ; ce montant doit encore couvrir ses coûts et n'est pas un bénéfice net.

**Zéro sur la ligne pièce ne signifie pas pièce gratuite ou incluse.** Pour les deux remplacements, le client fournit une pièce dont le professionnel a confirmé la compatibilité avant réservation. Ne pas inviter le client à acheter un modèle non vérifié. Si l'artisan fournit la pièce, établir un **devis complet préalable** avec référence, fourniture, prestation, frais et total accepté ; aucun prix variable ajouté à une réservation au forfait. Cette proposition modifie explicitement l'ancienne doctrine « pièce fournie par l'artisan, facturée séparément » pour les seuls nouveaux forfaits pilotes.

Villes : Agadir, Béni Mellal, Casablanca, El Jadida, Fès, Kénitra, Khouribga, Marrakech, Meknès, Mohammedia, Nador, Ouarzazate, Oujda, Rabat, Safi, Salé, Tanger, Taza, Témara et Tétouan. Six services × 20 villes = **120 couples approuvés dans cette branche**, sans présumer une disponibilité effective dans chaque ville.

## Périmètre de chaque forfait

**Diagnostic — 220 MAD.** Examen non destructif d'un problème sur une porte de logement, jusqu'à 30 minutes sur place, explication des constats et des suites possibles. Aucune ouverture de porte, réparation, pièce ou garantie de résolution incluse. Le client commande explicitement ce diagnostic avant déplacement. Une qualification à distance ne devient pas un diagnostic facturé ; un échec d'ouverture ne peut pas être requalifié rétroactivement en diagnostic payant.

**Porte standard claquée — 260 MAD.** Une porte non blindée simplement refermée, non verrouillée, mécanisme compatible et intact confirmé par le professionnel. Ouverture sans dégradation, puis vérification de fonctionnement. Aucun remplacement, reprise de porte ou réparation de bâti. Porte verrouillée, mécanisme bloqué ou état incertain : qualification puis devis, sans promesse du forfait d'ouverture.

**Porte blindée claquée — 360 MAD.** Uniquement une porte refermée dont les points de verrouillage ne sont pas engagés, modèle reconnu compatible avec une ouverture sans dégradation. Le professionnel doit confirmer sa compétence et la faisabilité au tarif annoncé avant acceptation. Verrouillage automatique, points engagés, serrure électrique/connectée, mécanisme défectueux ou modèle inconnu : devis. Ce forfait ne couvre pas toutes les ouvertures de portes blindées ou multipoints.

**Clé cassée — 260 MAD.** Un fragment dans un cylindre mécanique standard, sur une porte **déjà ouverte**. Extraction sans dégradation et essai avec un double fonctionnel disponible. L'état du cylindre et la faisabilité relèvent du professionnel ; le client ne certifie pas l'absence de dommage interne. Porte fermée, double indisponible, cylindre abîmé ou sécurité particulière : qualification/devis. Pas de reproduction de clé ni d'ouverture comprise.

**Cylindre — 300 MAD hors pièce.** Un cylindre mécanique standard remplacé à l'identique par une pièce compatible fournie par le client, porte déjà ouverte, ancien cylindre démontable normalement et clé disponible. Dépose, pose, ajustement simple et essais inclus. Sans ouverture préalable, retrait forcé, modification de porte, conversion de sécurité ni équipement connecté. Les modèles spéciaux et les interventions sur un mécanisme multipoints passent sur devis.

**Serrure — 400 MAD hors pièce.** Une serrure mécanique monopoint remplacée à l'identique sur une porte déjà ouverte, avec pièce client compatible avec le format et les fixations existantes. Dépose, pose, réglage simple et essais inclus. Si le nouvel ensemble comprend son cylindre, sa pose fait partie de ce forfait : aucune seconde ligne de main-d'œuvre cylindre. Sans nouvelle réservation dans la porte, soudure, adaptation du bâti, multipoints, motorisation ou réparation de porte.

Plusieurs portes, ouverture suivie de remplacement, coffre-fort, véhicule, rideau métallique, accès collectif, local professionnel ou dispositif spécial : **devis complet**, sans multiplication automatique des forfaits. Toute fourniture ou opération destructive sort du forfait d'ouverture ; le devis doit aussi préciser la remise en fermeture sûre. Aucune méthode d'ouverture n'est prescrite au client.

## Droit d'accès et déroulement

Le protocole proposé est une **règle interne FIXEO**, pas l'affirmation d'une obligation légale vérifiée.

1. Avant l'offre, le client déclare son droit d'accès, sa présence ou celle d'un adulte mandaté, l'absence de litige d'occupation et sa capacité à présenter les justificatifs au professionnel. La propriété seule ne valide pas une demande d'éviction ou d'accès contesté. Réponse inconnue, contradictoire ou droit contesté : aucun forfait réservable tant que la situation n'est pas clarifiée.
2. Avant acceptation, le partenaire confirme compétence, modèle/périmètre, disponibilité et prix fixe. Les informations techniques inconnues se qualifient ; elles ne deviennent pas automatiquement « non » dans un booléen.
3. **Avant toute ouverture ou modification sur place**, le professionnel vérifie visuellement identité, droit d'accès et éventuel mandat, puis les conditions techniques. La déclaration en ligne ne remplace pas cette vérification. Des documents annoncés à l'intérieur ne valent pas autorisation d'ouvrir pour aller les chercher ; le droit d'accès doit être établi au préalable, sinon l'intervention s'arrête.
4. Conserver seulement l'attestation du contrôle, son type, son statut, sa date et son lien au professionnel, à la mission et à l'offre. Aucun numéro ou copie de CIN, photo de clé, justificatif brut ou détail sensible dans le suivi public. Les modalités précises de contrôle devront être définies dans le parcours professionnel avant activation.
5. Après intervention, le professionnel enregistre le résultat et l'essai de fonctionnement, remet les clés et propose la restitution des anciennes pièces. La clôture et le règlement doivent exiger les attestations correspondantes. Un enregistrement logiciel ne certifie pas indépendamment le travail réalisé.

Danger immédiat pour une personne, incendie, violence ou intrusion en cours : arrêter la réservation ordinaire et orienter vers les services d'urgence compétents. Un différend d'occupation ne devient pas une mission d'ouverture via le diagnostic. Ces limites doivent être communes au démarrage, aux réponses préremplies, au moteur, à la création d'offre et à la réservation.

Le forfait d'ouverture, d'extraction ou de remplacement rémunère le résultat convenu. S'il n'est pas réalisable, arrêter, expliquer et proposer éventuellement un devis avant nouveaux travaux ; ne pas clôturer comme prestation réussie ni créer des frais de diagnostic/déplacement non commandés. Une modification doit produire un accord explicite et un total clair ; aucun supplément décidé sur place sans consentement préalable.

## Diagnostic absorbé pendant la même visite

Un diagnostic commandé peut être remplacé par l'un des cinq services qualifiés, sur **la même porte, avec le même artisan, pendant la même visite**, après vérification professionnelle et accord explicite du client. Pour un remplacement, la pièce compatible doit déjà être disponible. Le total final remplace celui du diagnostic : une mission et un seul frais FIXEO de 60 MAD.

| Suite acceptée | Total final | Diagnostic déjà payé | Solde client |
|---|---:|---:|---:|
| Porte standard claquée | 260 | 220 | **40** |
| Porte blindée claquée compatible | 360 | 220 | **140** |
| Clé cassée, porte ouverte | 260 | 220 | **40** |
| Cylindre, pièce client disponible | 300 | 220 | **80** |
| Serrure monopoint, pièce client disponible | 400 | 220 | **180** |

Crédit admis : 0 ou 220 MAD, déclaré par l'artisan et confirmé par le client ; aucun paiement bancaire n'est présumé vérifié. Si le diagnostic n'a pas été payé, le solde est le total final. Paiement partiel ou désaccord : résolution avant conversion. Proposition valable 45 minutes, refus/expiration/répétition sans duplication ; offres d'origine immuables et règlement calculé sur le total effectif, pas sur le solde seul.

Sans conversion acceptée et réalisée, seul le diagnostic effectivement commandé et réalisé reste dû. Pièce achetée ultérieurement, seconde visite, ouverture avec remplacement ou autre devis : pas d'absorption automatique. Le devis doit préciser le crédit éventuel du diagnostic et éviter toute double facturation implicite.

## Repères externes et limites

La [page Allo Maison, redirigée vers Hanæ](https://hanae.ma/serrurier), consultée le 21 septembre 2026, annonce 150–350 MAD pour une porte claquée en journée, 500–1 500 MAD pour les ouvertures blindées/multipoints et 200–500 MAD pour un cylindre posé. Elle indique avoir **arrêté le métier** ; les fourchettes restent éditoriales, sans échantillon vérifiable. Le large périmètre blindée/multipoints n'est pas comparable à notre cas strictement claqué. Le cylindre y comprend la pièce, contrairement à notre forfait de main-d'œuvre.

La [page Serrurier Pro](https://www.serrurierpro.ma/), consultée le même jour, affiche la vente du site et ne fournit pas de grille exploitable : écartée comme preuve de prix ou de disponibilité. La référence historique [Mano](https://mano.ma/prix-serrurier-au-maroc/) n'a pas pu être chargée lors du contrôle ; ses anciennes valeurs ne sont pas présentées comme observations actuelles.

Les six montants sont donc **des hypothèses commerciales FIXEO**, sans prix d'achat de pièce vérifié ni médiane de marché établie. En particulier, 300 MAD de main-d'œuvre pour un cylindre ne doit pas être présenté comme moins cher qu'une offre pièce comprise. La disponibilité au prix annoncé et l'acceptation artisan restent à mesurer avant élargissement.

## Économie artisan : calculs de sensibilité

Hypothèses internes, non issues de factures : déplacement 40 MAD, puis 60 MAD en scénario défavorable ; consommables/usure d'outillage 0 MAD pour le diagnostic et 10 MAD pour les cinq interventions. Le solde doit encore couvrir temps, charges, assurance et amortissement complet. Aucune marge nette n'est affirmée.

| Prestation | VAP | Reste après déplacement 40 et consommables supposés | Déplacement 60 |
|---|---:|---:|---:|
| Diagnostic | 160 | 120 | 100 |
| Claquée standard | 200 | 150 | 130 |
| Claquée blindée compatible | 300 | 250 | 230 |
| Clé cassée | 200 | 150 | 130 |
| Cylindre, hors pièce | 240 | 190 | 170 |
| Serrure monopoint, hors pièce | 340 | 290 | 270 |

Une retenue historique théorique de 15 % sur les anciens montants 220/350/220/280/400 donnerait 187/297,50/187/238/340 MAD à l'artisan. Les nouvelles VAP correspondantes ajoutent respectivement 13/2,50/13/2/0 MAD avant coûts. Ce sont des comparaisons arithmétiques, pas des revenus constatés ; les périmètres sont désormais plus stricts et les remplacements changent de règle de fourniture.

## Audit initial — constats avant intégration

Constats reproduits localement sur la base citée, sans appel de réservation ni écriture en production :

- Le catalogue VAP approuvé ne contient aucune entrée serrurerie. Les six services historiques et leurs anciens accords ne valent pas validation de cette nouvelle grille.
- L'appel direct `evaluateFixeoPrice` pour `serrurerie.porte_claquee_ouverture` avec `{}` renvoie 220 MAD et `ELIGIBLE`. Le même prix sort avec `security_door:false, door_locked_with_key:true`. Ajouter les limites d'identité et d'état de porte dans chaque chemin, pas seulement dans les questions.
- Le champ canonique `property_occupied_status` décrit un contrôle de droit d'accès, mais aucun des six plans de questions serrurerie ne l'utilise. Une ouverture standard avec `property_occupied_status:'OCCUPIED_THIRD_PARTY'` reste éligible dans le moteur. Une référence textuelle à une politique ne constitue pas son contrôle effectif.
- Un remplacement de cylindre avec `cylinder_count:2` produit encore le prix fixe de main-d'œuvre 280 MAD. Le nouveau pilote doit imposer une unité ; lots sur devis.
- Le service historique `serrurerie.porte_verrouillee.ouverture` a un forfait 380 MAD et une exclusion en cas de pièce nécessaire, alors que son texte envisage un remplacement séparé. Retirer ce forfait des nouvelles offres fermes et proposer un devis complet ; conserver les offres historiques immuables.
- L'extraction actuelle ne vérifie pas que la porte est déjà ouverte. Le nouveau forfait doit demander l'état observable, puis laisser au professionnel la vérification du mécanisme et du double.
- Le refus de création d'offre en l'absence de tarif VAP dans `api/estimator-v1/fixeo-vap-offers-v1.js` couvre les huit métiers déjà intégrés, mais pas la serrurerie. Étendre ce refus pour éviter un retour à l'ancien prix, y compris pour une ville ou un code non autorisé.

Corrections désormais intégrées : la qualification commune, les six périmètres, les 120 entrées, les contrôles professionnels et la conversion du diagnostic ; harmoniser estimateur, cartes de service, suivi et interfaces partenaires. Prévoir les chemins historiques, les liens directs, les réponses inconnues/contradictoires et les tentatives de contournement côté API/DB. Aucune promesse 24 h/24, de pièce incluse ou de réussite universelle sur porte blindée.

Vérification de la proposition : six décompositions par `buildBreakdown`, couverture exacte des 20 villes, 120 couples uniques, cinq conversions avec crédits 0/220 MAD, comparaisons historiques et scénarios de coûts. Contrôle du diff limité aux deux fichiers de proposition. Les rapports `data/pricing/engine/engine-test-report.v1.json` et `data/pricing/shadow/shadow-results.v1.json` restent protégés et inchangés.

Décision prise : le propriétaire a validé cette grille et ce périmètre, notamment pièce client, créneau 8 h–20 h et contrôle préalable du droit d’accès. Il a ensuite autorisé explicitement la migration en production puis le déploiement de ce métier.

Message de commit de la proposition : `docs(serrurerie): propose VAP tariffs and authorization-first scopes`.


## Résultat intégré et vérifié

Le propriétaire a validé la grille et le périmètre pour les 20 villes le 21 septembre 2026. Les 120 entrées ont été ajoutées ; les 560 entrées VAP des métiers précédents et leurs services canoniques sont inchangés.

L’estimation demande explicitement danger, droit d’accès non contesté, adulte autorisé présent, porte privative de logement, quantité, créneau et périmètre. Les réponses inconnues, contradictoires et les signaux préremplis passent par les mêmes contrôles que les réponses successives. Les remplacements demandent une pièce disponible dont la compatibilité a déjà été confirmée par un professionnel. Porte verrouillée et cas complexes restent sur devis. Les anciens contextes de prix serrurerie ne peuvent pas réserver au tarif historique ; une nouvelle qualification est nécessaire. Les nouvelles offres en base sont aussi limitées aux villes, prix et périmètres exacts autorisés.

Les six prestations exigent une confirmation de compétence, de périmètre et de prix avant acceptation partenaire, sur les parcours existants V1 et V2. Sur place, avant intervention, l’artisan enregistre les vérifications et choisit le type de contrôle effectué : identité et justificatif nominatif d’occupation, ou identité, droit du mandant et mandat. Aucun champ de document, numéro d’identité ou texte libre de justificatif n’est accepté. Les informations détaillées du contrôle ne figurent pas dans le suivi client.

Le résultat réel de chaque prestation doit être attesté séparément avant clôture et règlement, y compris le diagnostic. Pour proposer une conversion, le diagnostic et son contrôle d’accès doivent déjà avoir été effectués. L’artisan atteste le périmètre de la suite ; le client confirme le total et le crédit 0/220 MAD. Les offres restent immuables. Le résultat de l’intervention acceptée doit ensuite être attesté ; l’attestation du diagnostic ne suffit pas à clôturer la réparation. Le logiciel enregistre les déclarations professionnelles, sans certifier indépendamment les actes physiques.

**140 tests automatisés réussis.** La suite couvre les 120 couples service/ville, les offres signées, la réservation atomique et le dispatch dans PostgreSQL isolé, l’acceptation V1/V2, les vérifications d’accès, les pièces, les limites, les droits et l’audit immuable, le consentement et les dix conversions (cinq prestations × deux crédits). Les fonctions réelles de production d’acceptation, démarrage et clôture sont reproduites en lecture seule dans les fixtures. Les tests vérifient le total effectif au règlement, le refus des soldes utilisés comme prix final et l’absence de double frais. Les interfaces sont exercées avec JSDOM et les API avec réseau simulé. Les suites plomberie, électricité et climatisation appliquent aussi la nouvelle migration pour vérifier le déclencheur partagé.

Commande : `NODE_PATH=/workspace/scratch/7e6d7edda414/test-deps/node_modules node --test tests/estimator/*.test.cjs`.

## Migration appliquée et déploiement vérifié

Fichier créé avec la CLI Supabase : `supabase/migrations/20260921154406_serrurerie_same_visit_service.sql`.

- Précondition : fonction financière actuelle d’empreinte MD5 `04c2261556061bc8f1ae80f1bf51e40e`, confirmée en production en lecture seule avant préparation de la PR.
- Cinq tables privées avec RLS, aucun accès direct pour PUBLIC/anon/authenticated/service_role, attestations et décisions immuables ; aucun stockage de justificatif brut.
- Quatre fonctions authentifiées réservées au professionnel propriétaire de la mission ou de l’opportunité ; deux fonctions serveur pour suivi client et administration. Fonctions avec `search_path` vide et privilèges explicites.
- Extension du déclencheur financier partagé et contrôle des nouvelles offres serrurerie. Verrouillage limité à 3 secondes et exécution à 30 secondes ; aucune mise à jour de mission ou offre historique.
- SHA256 : `9bd631815d3e39cf3252d29a6ebeab3da16c37e5562ec09f96fc06f53673f6c7`.

Avant migration, les nouvelles tables et RPC serrurerie étaient absentes ; la base contenait 23 missions, 118 demandes et 48 offres. Après autorisation explicite du propriétaire le 21 septembre 2026, la migration a été appliquée sous la version Supabase `20260921162453`. Les sources des onze fonctions installées correspondent exactement au SQL testé ; les cinq tables privées, leurs droits et leurs déclencheurs sont conformes. Nouvelle empreinte du déclencheur financier : `fa1dd89e2ad8f1ad7b8409abe689e4df`. Les deux rapports protégés sont inchangés.

La revue des privilèges et les essais de la migration sont terminés en base isolée. La disponibilité réelle des partenaires et les contrôles physiques restent à confirmer par les professionnels, comme prévu dans le périmètre validé. Les anciennes pages éditoriales de prix restent indicatives ; cette intégration porte sur le parcours transactionnel de l’estimateur et des missions.

Message de commit : `feat(serrurerie): integrate approved VAP tariffs and verified access lifecycle`.


La [PR nº42](https://github.com/fixeo-app/Fixeo-clean/pull/42) a été fusionnée au commit `9385c3a7b369951accf38ae400a8dd94df86afbb`. Le [déploiement Vercel](https://vercel.com/elalaouibiz-3410s-projects/fixeo-clean/2thAt1jJ5Gx5xLyXNMZz2F5hRg2L) a réussi. Les 16 fichiers publics contrôlés correspondent octet pour octet à la version testée ; le catalogue publié comprend les 120 couples serrurerie et préserve les 560 entrées des autres métiers.

**35 contrôles publics réussis** : six tarifs et contextes de prix signés, limites de périmètre, droit d’accès, danger, pièces, créneau, porte verrouillée et accès au suivi. Ces vérifications ont créé six offres temporaires non réservées. La base contient ensuite 54 offres, toujours 23 missions et 118 demandes. Les empreintes financières des missions et les liens demande/offre sont inchangés. Aucun appel de réservation, dispatch, règlement ou notification ; aucun changement de l’activation WhatsApp ou carte.

L’audit Supabase après migration ajoute les cinq informations attendues de [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) pour des tables privées sans accès direct, et quatre signalements de [fonctions authentifiées SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) intentionnelles, contrôlées par `auth.uid()` et la propriété de la mission/opportunité. Les autres alertes préexistantes sont inchangées : trois vues SECURITY DEFINER, quatre search_path mutables, neuf fonctions anonymes et une alerte de protection des mots de passe. Cette livraison ne prétend pas corriger ces éléments historiques.

Preuves structurées : `data/pricing/research/serrurerie/production-verification.v1.json`. La disponibilité effective des partenaires dans chaque ville reste soumise à leur acceptation ; les missions existantes sont des tests.

Message de commit de livraison : `feat(serrurerie): deploy approved VAP tariffs and verified access lifecycle (#42)`.
Message de commit du compte rendu : `docs(serrurerie): record authorized production deployment and verification`.
