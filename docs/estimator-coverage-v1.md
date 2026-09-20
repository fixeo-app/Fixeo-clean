# RAFI : couverture des situations, première activation fonctionnelle

## Ce qui change

- 62 identifiants stables relient les situations affichées au registre serveur `discovery-routing-v1.json`. Les candidats proposés sont filtrés et vérifiés côté serveur ; un identifiant inconnu est refusé.
- Jardinage, déménagement, carrelage, maçonnerie et autre besoin sont accessibles dans le sélecteur. Ils proposent un devis, pas un tarif non calibré. Le catalogue monétaire conserve ses 53 prestations et tous ses montants.
- Chaque situation possède une sortie devis explicite si les prestations standardisées ne conviennent pas. Une demande de devis comporte un projet, une ville et un téléphone, dans RAFI. Elle n'est envoyée qu'après confirmation explicite au service existant `/api/create-request-fn`, sans prix ni artisan imposé. Ce service conserve sa persistance et son dispatch existants. Aucun nouveau writer, schéma ou traitement de dispatch n'est ajouté.
- Le forfait grand ménage vérifie 60–100 m² en plus du type F2/F3 ; les autres surfaces ne reçoivent plus automatiquement le forfait.
- Fuite simple et débouchages demandent de confirmer un problème local sur un équipement accessible. Un périmètre complexe ou inconnu conduit à un devis ; aucun diagnostic payant n'est imposé automatiquement.
- Les inclusions et exclusions sont dérivées des fiches canoniques, des quantités confirmées et des règles de fourniture des pièces. Les questions peuvent utiliser la formulation française du registre serveur.
- Une réponse réseau perdue au devis réutilise la même clé d'idempotence. La mémoire de session ne conserve que l'empreinte du contenu et la clé, pas le numéro ou le projet. Un délai réseau de 20 s permet de réessayer.

## Vérification

Suite locale : 45 tests, dont 62 démarrages contextualisés et 112 choix de candidats, limites de surface, plomberie hors périmètre, refus de services incohérents, aller-retour API avec jetons chiffrés, devis sans autorité tarifaire, double clic et nouvelle tentative après perte de réponse. Les envois de devis sont simulés : aucune demande réelle n'est créée par ces tests.

Commande : `NODE_PATH=/tmp/fixeo-discovery/node_modules FIXEO_TEST_ASSET_DIR=/tmp/fixeo-discovery/assets node --test tests/performance/*.test.cjs tests/estimator/*.test.cjs` (installer jsdom et fournir les fixtures locales dans un autre environnement).

## Limites commerciales explicites

Couvrir un besoin par devis ne signifie pas disposer d'un forfait. Aucun nouveau montant n'est activé pour les quatre métiers ajoutés. La calibration économique et les fiches détaillées des nouvelles prestations restent à établir et valider. Le moteur ne peut pas déduire un tarif fiable à partir d'un simple intitulé métier. La qualification approfondie des variantes des 53 prestations doit se poursuivre sur les cas réels.

Le service de collecte existant ne distingue pas une catégorie carrelage/bricolage dédiée ; ces devis utilisent `autre`, avec la spécialité et la situation dans la description. Jardinage, déménagement et maçonnerie conservent leur catégorie propre. Ceci évite d'élargir silencieusement les règles d'affectation. Il faudra harmoniser ultérieurement cette taxonomie sur toute la chaîne avant une affectation spécialisée de ces deux catégories.
