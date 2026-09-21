# Peinture de plafonds — pilote validé

Statut au 21 septembre 2026 : **tarif et périmètre validés par FIXEO ; publication GitHub autorisée**.
Branche `feat/paint-ceiling-vap-v1`, base `0171a912a300aab2b8af76c2ea054347c88defd3`.

## Décision validée

Tarif validé : `peinture.plafond.labour_only`, **40 MAD/m² pour l’artisan + frais progressifs FIXEO BP3.3**, dans les 20 villes déjà couvertes. Peinture fournie par le client. Ce montant est un tarif pilote propriétaire FIXEO ; il n’est ni un prix de marché vérifié ni un tarif validé par des missions terrain.

La rémunération validée est supérieure de 10 MAD/m² à celle des murs déjà activée (30 MAD/m²), pour tenir compte du travail en plafond. Le calibrage reste à confronter aux missions terrain ; la productivité n’est pas mesurée. La plage commence à 20 m², soit 800 MAD de prestation artisan incluant préparation des protections, déplacement et retours de séchage ; les petites surfaces passent sur devis.

| Surface réelle | Artisan | Frais FIXEO | Total client |
|---|---:|---:|---:|
| 20 m² | 800,00 MAD | 120,00 MAD | 920,00 MAD |
| 20,01 m² | 800,40 MAD | 120,06 MAD | 920,46 MAD |
| 40 m² | 1 600,00 MAD | 240,00 MAD | 1 840,00 MAD |
| 50 m² | 2 000,00 MAD | 300,00 MAD | 2 300,00 MAD |
| 50,03 m² | 2 001,20 MAD | 300,12 MAD | 2 301,32 MAD |
| 60 m² | 2 400,00 MAD | 340,00 MAD | 2 740,00 MAD |
| 100 m² | 4 000,00 MAD | 500,00 MAD | 4 500,00 MAD |

Les frais sont progressifs ; ils ne sont pas systématiquement égaux à 15 % du montant artisan et ne sont pas prélevés sur le total client. Aucun ancien minimum ne s’ajoute au tarif.

## Périmètre

- Surface réelle de plafond de 20 à 100 m², deux décimales maximum, comptée une seule fois pour les deux couches. Mesure longueur × largeur de chaque plafond plat concerné, sans addition des murs ni des pièces non concernées.
- Plafond plat, intérieur, déjà peint, sec, sain et prêt à repeindre ; teinte identique ou proche ; deux couches standard.
- Hauteur maximale de 2,80 m ; sol plat et stable ; zone dégagée ; eau et électricité disponibles ; aucun escalier ou accès spécial.
- Peinture compatible et suffisante fournie par le client. Protection, outils, déplacement dans la ville sélectionnée, retours nécessaires au séchage et nettoyage inclus.
- Préparation, sous-couche, fissures, écaillage, moulures, corniches, reliefs, création ou réparation de faux plafond, murs, changement marqué de couleur et effets décoratifs : devis.
- Humidité active : arrêt du chiffrage avant peinture. Moisissures ou support non prêt : pas de forfait.

## Audit et corrections

L’ancien document `data/pricing/research/peinture/human-decision.v0.3.md` décrivait un prix total à 45 MAD/m², minimum 800 MAD, avec peinture standard incluse. Le service canonique `peinture.plafond.labour_only` décrit au contraire une peinture fournie par le client. Ce prix historique ne peut donc pas être converti automatiquement en rémunération artisan. Le dernier déploiement avait correctement placé ce service sur devis.

Cette modification crée six questions adaptées aux plafonds et un calcul distinct. L’option plafond devient candidate dans « Repeindre une pièce ». Le résumé des murs n’est plus réutilisé pour les plafonds : il aurait annoncé des murs et exclu les plafonds. L’interface accepte les centièmes de m² et explique leur mesure.

## Préparation et activation

Le propriétaire a explicitement validé le nouveau tarif et autorisé sa publication le 21 septembre 2026 : « je valide ce nouveau tarif et j’autorise la publication ».

Les vingt entrées plafond ont désormais `approved: true` et `approval_status: OWNER_APPROVED`. Les indicateurs `production_ready`, `active_in_estimator` et `active_in_reservation` sont vrais sur cette branche ; la provenance est `FIXEO_OWNER_APPROVED_PILOT`. Le catalogue réel est utilisé dans les tests de calcul et de règlement. Un test désactive temporairement les entrées en mémoire pour vérifier le refus d’une offre non approuvée, puis restaure leur état.

La publication autorisée concerne la branche et le brouillon de demande de fusion sur le dépôt public `fixeo-app/Fixeo-clean`. Elle ne constitue pas une fusion sur `main` ni une confirmation de déploiement en production. Les fournitures incluses restent sur devis et feront l’objet de l’étape suivante.

Aucune migration SQL nécessaire : le parcours existant accepte déjà la catégorie peinture. Aucun appel de réservation, mission ou dispatch en production. Le fichier de tests PostgreSQL couvre les murs et plafonds avec une véritable offre issue de l’estimateur dans une base PGlite locale.

## Vérifications

Résultat du 21 septembre 2026 : **75 tests réussis, aucun échec** dans la suite de l’estimateur. Simulation API et PostgreSQL local uniquement ; aucun test de réservation ou de règlement réel en production.

Après validation et activation des entrées sur la branche : **12 tests ciblés réussis**, couvrant plafonds, régression murs et parcours financier PostgreSQL avec le catalogue réellement approuvé.

Tests du tarif validé dans 20 villes, seuils 20/100 m², frontière de commission à 50 m², centimes, refus de réponses incomplètes ou complexes, humidité, confusion murs/plafonds, état non approuvé, signature et confirmation par le vrai gestionnaire API avec réseau simulé, questions rendues dans un DOM, confirmation idempotente, affectation Peinture, montant et frais conservés au règlement, refus de modification du prix ou de déliaison de l’offre.

Commande : `NODE_PATH=<dépendances de test> node --test tests/estimator/*.test.cjs`, avec `@electric-sql/pglite@0.3.14` et `jsdom@26.1.0`.

Commit de préparation : `feat(pricing): prepare scoped ceiling painting calibration for approval`

Commit de validation : `feat(pricing): approve ceiling painting tariff across 20 cities`
