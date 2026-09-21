# Réconciliation des prix FIXEO avec le business plan 3.3

Audit du code au commit `b06faef066aa8857dbf6237cac2e9bab83422617`, le 21 septembre 2026. Aucune modification de production ni migration de données.

## Conclusion

Le prix calculé par RAFI est utilisé comme montant client à réserver. Le chemin examiné n'ajoute pas une commission à ce montant. En revanche, la répartition financière du code reste à 15 % du prix total, ce qui ne correspond pas au barème du business plan 3.3. La présence de ce calcul dans plusieurs composants n'établit pas une double facturation ; elle crée un risque de divergences de répartition et d'arrondi.

L'audit porte sur les sources, pas sur l'état des fonctions effectivement installées dans Supabase. Aucun accès de lecture au trigger en production n'a été utilisé. Le script SQL du dépôt ne prouve donc pas à lui seul la règle actuellement exécutée dans la base.

## Preuves dans les sources

| Source | Comportement constaté |
| --- | --- |
| `data/pricing/engine/pricing-engine-core-v1.js`, fonction calculate | Le modèle FIXED restitue directement fixed_amount_mad comme final_amount_mad. Pas de ventilation VAP/commission. |
| `api/fixeo-booking-authority-v1.js` | Le montant du jeton est autoritaire pour une réservation issue de RAFI ; LABOUR_PLUS_PART utilise labour_amount_mad, avec pièces séparées. |
| `api/server.js`, parcours COD | totalAmount = bookingAuthority.amount_mad ; commission = arrondi(totalAmount × 0,15) ; netArtisan = totalAmount − commission. |
| `api/admin-settle-mission-fn/index.js` | Constante 0,15 ; le chemin idempotent recalcule 15 % du prix final ; le chemin de règlement utilise la commission renvoyée par la base, avec repli à 15 %. |
| `supabase/7c11f6-financial-settlement.sql` | Le trigger proposé calcule 15 % de final_price ou agreed_price, arrondi à deux décimales. |
| `js/cod-payment.js` | Calcul de présentation/repli à 15 % du total, arrondi au dirham. |

Les montants du catalogue sont donc des prix affichés au client dans le parcours examiné. Cela ne démontre pas comment leur rémunération artisan a été calibrée à l'origine. Le code ne permet pas de déduire une ventilation fiable des matériaux inclus.

## Règle normative retrouvée dans le plan

Source : FIXEO-Business-Plan-Master-Final3.3.pdf, chapitre 14 pages 39–41 et chapitre 38 page 109. Le chapitre 14 marque le barème comme hypothèse de modélisation à valider. Le chapitre 38 définit la VAP comme valeur nette artisan de prestation, hors matériel.

Pour V > 0, la commission C(V) est le minimum de 1 500 et le maximum de 60 et de :

`0,15 × min(V, 2000) + 0,10 × min(max(V−2000, 0), 3000) + 0,07 × min(max(V−5000, 0), 5000) + 0,05 × max(V−10000, 0)`.

Prix client = VAP + C(VAP) + matériel justifié + suppléments annoncés. Aucun minimum n'est à facturer pour une simulation sans mission ; les règles d'annulation doivent être définies séparément. Les tranches doivent être continues en monnaie décimale : les libellés imprimés « 2001 » ne créent pas de trou entre 2000 et 2001 MAD.

Le client paie l'artisan ; celui-ci reverse la part FIXEO. La commission théorique n'est pas encore une commission encaissée. Le matériel remboursé n'est pas un revenu de main-d'œuvre artisan.

### Ambiguïté documentaire à corriger

Le chapitre 14 évoque un total annoncé de 10 000 MAD pour 8 000 de matériel et 2 000 de prestation, avec 300 de commission. En appliquant la convention VAP du chapitre 38, 2 000 de VAP + 300 + 8 000 donnent 10 300 MAD. Il faut retenir explicitement le chapitre 38 pour la nouvelle grille et réconcilier cet exemple ainsi que les agrégats financiers avant de prétendre que l'ensemble du plan est inchangé. Le PDF n'a pas été modifié.

## Effet sur un prix existant de 300 MAD

Exemple simplifié sans matériel séparé ; il ne constitue pas une nouvelle ventilation du forfait WC, dont les consommables restent à chiffrer.

| Convention | Montant artisan avant ses coûts | FIXEO | Client |
| --- | ---: | ---: | ---: |
| Code à 15 % du total | 255 | 45 | 300 |
| BP 3.3, prix client conservé | 240 | 60 | 300 |
| BP 3.3, montant artisan 255 conservé | 255 | 60 | 315 |

On ne peut pas conserver simultanément le prix client, le net artisan et remplacer 45 par 60 de rémunération FIXEO. Il faut choisir une politique commerciale explicite. Ne jamais ajouter automatiquement 60 MAD aux 53 prix affichés ni appliquer 15 % une seconde fois au prix incluant la rémunération FIXEO.

## Six hypothèses de lancement à évaluer

Ces montants sont des propositions internes choisies pour tester l'économie du service, pas des prix de marché établis ni des prix justes démontrés. Aucune prestation n'est activée. Périmètres détaillés dans `docs/calibration-nouveaux-metiers-v1.md`.

| Prestation pilote | Périmètre de chiffrage | VAP proposée | FIXEO calculé | Sous-total client hors matériel/option |
| --- | --- | ---: | ---: | ---: |
| Entretien courant de jardin | Jusqu'à 100 m², déjà entretenu, accessible ; pas d'évacuation hors site | 300 | 60 | 360 |
| Taille de haie basse | Jusqu'à 10 ml, hauteur ≤ 1,80 m, taille d'entretien accessible du sol | 250 | 60 | 310 |
| Pose droite de carrelage | Exemple 20 m² × VAP 50/m², support prêt, format standard ; fournitures exclues | 1 000 | 150 | 1 150 |
| Remplacement local de carreaux | 1–4 carreaux, support sain, carreaux client ; colle/joint à chiffrer | 300 | 60 | 360 |
| Reprise locale d'enduit | Jusqu'à 1 m², non structurel, sec ; matériaux et passages à confirmer | 350 | 60 | 410 |
| Manutention sur place | Équipe de deux, deux heures, sans transport, escalier ni objet spécial | 500 | 75 | 575 |

Pour la manutention, 500 MAD correspond à l'équipe complète, pas à chacun. Pour le carrelage, le minimum de chantier reste à définir : l'exemple 20 m² ne suffit pas à autoriser un tarif applicable à toute surface. La VAP doit intégrer les coûts ordinaires de main-d'œuvre, outils et déplacement définis dans la zone ; toute dépense ajoutée séparément doit éviter le double comptage.

Les sous-totaux ne sont pas des prix clients complets lorsque du matériel ou une option reste à déterminer. Ne pas afficher « prix fixe tout compris » dans ces cas. L'exemple 50 MAD/m² est une hypothèse interne ; le repère public 40–70 DH/m² de Carrelage Tanger cité dans le dossier précédent ne prouve ni un net artisan ni l'adéquation du périmètre.

## Migration recommandée

1. Relever en lecture seule le trigger de commission réellement installé et les chemins actifs de règlement. Recenser les missions existantes sans les recalculer.
2. Introduire une version tarifaire par estimation/mission et une ventilation signée côté serveur : VAP, commission, matériel, suppléments, total client, zone et règles d'arrondi. Pas de montant financier autoritaire fourni par le navigateur.
3. Conserver les missions déjà acceptées sous leur convention historique. Nouvelle convention uniquement pour les nouvelles offres explicitement versionnées.
4. Séparer le moteur de prix client du calcul de ventilation ; une seule fonction de barème partagée, reflétée dans la persistance. Les tableaux de bord affichent la ventilation enregistrée sans reconstruire 15 %.
5. Vérifier les arrondis au centime, limites de tranches, minimum, plafond, montant nul, matériel, nouvelle tentative et règlement idempotent. Les arrondis commerciaux doivent recalculer une ventilation cohérente, pas modifier le total seul.
6. Valider l'économie des pilotes : temps et coût artisan, acceptation des offres, suppléments, coûts FIXEO et collecte réelle. Ne pas promettre un revenu net de bénéfice à partir de la seule VAP.
7. Activer par prestation et zone après validation ; la catégorie carrelage doit aussi être alignée jusqu'à l'affectation. Toute situation hors périmètre conserve une sortie devis.

## État de livraison

Audit et propositions terminés. Aucun runtime, montant du catalogue, trigger, commission de mission ou paramètre de production modifié. La migration et l'activation commerciale restent une étape distincte.
