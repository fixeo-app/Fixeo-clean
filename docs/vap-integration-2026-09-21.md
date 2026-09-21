# VAP : estimation, réservation et règlement

## État

Migration `20260921012731_vap_booking_settlement_binding.sql` appliquée sur fixeo-mvp le 21 septembre 2026. Les 23 missions existantes ont la même empreinte financière avant et après : `f0b64550b324177ef843c44cb50ca96a`. Aucun faux client, demande ou mission inséré en production. Les avis Supabase ne signalent aucun objet VAP ajouté ; les alertes historiques restent à traiter séparément ([documentation](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)).

## Parcours branché

- L'estimation cherche exclusivement une entrée explicitement approuvée par service, ville, résultat payable et critères de périmètre. Elle persiste l'offre avant de signer le jeton. Échec réseau : réponse explicite, aucun repli tarifaire.
- Le jeton porte identifiant d'offre, version et ventilation. La confirmation VAP vérifie ces données et crée atomiquement une demande liée à l'offre. Le parcours COD historique refuse ces jetons pour éviter une réservation sans liaison persistée.
- Toute nouvelle mission créée par les procédures serveur pour cette demande reprend son offre et ses montants. Les mises à jour de statut conservent la commission VAP. Les missions historiques restent sur leur fonctionnement antérieur.
- Le règlement reprend les montants enregistrés, même sur une nouvelle tentative. Un montant différent est refusé pour VAP, y compris avec force. Les statuts réels done/validated sont acceptés. Une modification de périmètre exige une nouvelle offre ; aucun flux d'avenant automatique n'est livré ici.
- L'estimateur affiche les centimes et la ventilation prestation/service FIXEO/fournitures.

## Activation tarifaire distincte

`data/pricing/canonical/vap-approved-v1.json` contient volontairement zéro entrée. Les anciens prix ne sont ni assimilés à des VAP ni augmentés automatiquement. Les six montants proposés restent des hypothèses à calibrer : ce branchement n'est pas leur activation commerciale.

Pour activer une prestation : entrée avec approved=true, service_code, city_slug, outcome_type, inputs explicites, vap_minor, materials_minor et catalogue_version. Fournitures explicitement chiffrées ; zéro ne signifie pas toutes pièces incluses. Les étapes actuelles de qualification du moteur doivent déjà rendre cette situation payable ; une entrée du registre seule ne convertit pas un devis en forfait.

## Vérification

48 tests de l'estimateur passent : parcours historiques, dictée, retour, demandes de devis, calcul, stockage, confirmation→mission→règlement en PostgreSQL embarqué PGlite, refus des accès navigateur, conflit de montant et réponse idempotente. Référence avec centimes : VAP 300,01 + FIXEO 60 = total 360,01 MAD conservé jusqu'au règlement.

Commande : NODE_PATH vers @electric-sql/pglite@0.3.14 et jsdom@26.1.0 puis `node --test tests/estimator/*.test.cjs`. Tests financiers avec doubles réseau ; pas de réservation réelle de production ni de test terrain iPhone pour cette livraison.

## Retour arrière

Vider le registre d'activation empêche de nouvelles offres VAP. Ne pas retirer la logique de règlement ou les tables après acceptation d'une offre VAP. La désactivation des nouvelles offres ne doit pas reconvertir une ancienne offre en 15 %.
