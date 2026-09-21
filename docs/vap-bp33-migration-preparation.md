# VAP BP 3.3 — calcul commun et préparation de migration

21 septembre 2026. Fondation SQL appliquée en production : module applicatif non branché, aucun changement de prix ou de mission.

## Livrable

`data/pricing/engine/vap-bp33-v1.js` contient le calcul pur du barème progressif 15/10/7/5 %, minimum 60 MAD et plafond 1 500 MAD. Les seuils de VAP sont 2 000, 5 000 et 10 000 MAD. Calcul en centimes entiers, somme des tranches puis arrondi au centime le plus proche (demi supérieur). Le plafond est atteint à 21 000 MAD de VAP.

Le calcul demande une version explicite, une VAP positive et un montant de matériel explicite, même nul. Il refuse les champs supplémentaires : aucun total client ni commission venant d'un appelant ne peut écraser son résultat. La limite technique du total est de 500 000 MAD. Les prestations supplémentaires doivent être requalifiées et intégrées à la VAP, les fournitures supplémentaires au matériel ; une ligne générique de supplément sans assiette définie n'est pas acceptée.

Le module ne valide pas une situation, un artisan, une ville, un catalogue ou un contrat. Il ne signe pas de jeton et n'autorise aucune réservation. Il sera appelé uniquement après ces contrôles côté serveur. Il ne doit pas être exposé comme autorité tarifaire dans le navigateur.

## Ventilation à conserver par offre

Une future offre versionnée doit enregistrer : identifiant de l'offre et de la mission, service, périmètre validé, zone, quantités, version du tarif et du catalogue, VAP, rémunération FIXEO, matériel justifié, total client, date de création, expiration et acceptation. Les montants enregistrés font autorité après acceptation. La somme VAP + rémunération FIXEO + matériel doit égaler le total.

Le montant conservé par l'artisan après reversement inclut le remboursement du matériel ; ce n'est pas son bénéfice. La VAP n'est pas non plus un bénéfice après ses coûts.

## Séquence de migration à réaliser

1. **Inventaire réel en lecture seule.** Lire le schéma, les triggers et fonctions de commission installés dans Supabase ; lire les chemins actifs de réservation et de règlement. Les scripts du dépôt ne suffisent pas à établir l'état de la base.
2. **Extension additive.** Préparer une table d'offres financières versionnées ou des colonnes équivalentes après cet inventaire. Écriture réservée au serveur ; lecture limitée aux parties autorisées. Immutabilité après acceptation. Ne pas modifier ou rétrocalculer les missions existantes.
3. **Coexistence explicite.** Missions existantes et non versionnées : route historique et montants enregistrés. Nouvelle offre validée `vap-bp33-v1` : calcul du module, ventilation persistée atomiquement lors de la réservation. Version inconnue sur une nouvelle offre : refus, jamais repli vers 15 %.
4. **Jeton et réservation.** Porter la version et l'identifiant de l'offre dans le contrat signé ; vérifier expiration, utilisateur, service, périmètre et total. Étendre le validateur : le flux actuel arrondit certains montants au dirham, ce qui doit être réconcilié avec les centimes du nouveau module avant activation.
5. **Règlement et affichage.** Pour VAP, lire la ventilation persistée ; aucun nouveau calcul à 15 % dans l'API, le trigger ou les tableaux de bord. Corriger aussi la réponse idempotente du règlement. Changement de périmètre : nouvelle offre acceptée, pas écrasement silencieux.
6. **Vérification bout en bout.** Même ventilation de l'estimation à la réservation, puis clôture et règlement ; tests de double clic, nouvelle tentative, ancienne mission, version inconnue, fournitures et changement de périmètre. Confirmer le comportement des droits d'accès et de l'atomicité dans une base de test.
7. **Activation progressive.** Activer par prestation et zone seulement après validation du périmètre, de la VAP et du prix client. Les six hypothèses chiffrées du dossier #28 restent non activées.

## Retour arrière

Désactiver la création de nouvelles offres VAP si nécessaire, tout en conservant la lecture et le règlement des offres VAP déjà acceptées selon leurs montants enregistrés. Ne pas convertir une mission VAP en ancienne commission de 15 %. Le module livré ici étant non branché, son retrait n'affecte pas le fonctionnement actuel.

## Vérification livrée

Tests unitaires : exemples du business plan, seuils au centime, minimum/plafond, matériel hors assiette, six hypothèses de forfait, entrées invalides, total maximal, refus de versions inconnues, absence de modification d'une donnée historique et monotonie. Ces tests vérifient le calcul ; ils ne prouvent ni une migration appliquée ni la protection réelle des missions en base. La base de production a ensuite été auditée et étendue ; voir le compte rendu ci-dessous.


## Fondation appliquée le 21 septembre 2026

Migration `20260921005143_vap_bp33_offers_foundation.sql` appliquée au projet de production fixeo-mvp. Table interne `fixeo_pricing_offers_v1`, calcul SQL progressif identique au module JavaScript, contraintes de ventilation et immutabilité. Aucun changement du trigger historique de commission.

Vérification locale : 8 tests réussis (module et PGlite), incluant comparaison SQL/JavaScript, droits anon/authenticated/service_role, refus de modification/suppression, doublons et conservation d'une mission historique. Pour reproduire, installer `@electric-sql/pglite@0.3.14` dans un répertoire temporaire puis lancer les deux fichiers de test avec NODE_PATH vers ce répertoire node_modules.

Vérification production : 23 missions ; empreinte financière avant/après identique `f0b64550b324177ef843c44cb50ca96a`. Zéro offre créée. RLS actif. Aucune lecture/écriture ni exécution du calcul pour anon/authenticated ; service_role peut lire/créer et calculer, pas modifier. Références SQL : VAP 300 MAD donne 60 MAD de commission ; VAP 10 000 MAD donne 950 MAD. Aucun faux service_request ou mission créé.

Les avis de sécurité Supabase restent identiques après retrait des horodatages d'observation. Les alertes existantes ne constituent pas un audit global résolu : notamment trois vues SECURITY DEFINER à examiner séparément. Documentation : https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

Les étapes 1 et 2 ci-dessus sont réalisées pour cette fondation. Les étapes 3 à 7 restent à implémenter : rattachement atomique de l'offre à la réservation, autorisation du demandeur, contrat signé, conservation des centimes, règlement versionné et affichage. La table interne seule ne constitue aucune autorité de réservation. Les six forfaits proposés restent des hypothèses non activées.


## Mise à jour : branchement applicatif

Voir `vap-integration-2026-09-21.md` pour la liaison estimation/réservation/règlement, la deuxième migration appliquée et les 48 tests. Le registre des forfaits approuvés reste vide ; la calibration commerciale reste distincte de la livraison technique.
