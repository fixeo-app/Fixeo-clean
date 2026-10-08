# FIXEO PB1.1 — candidat logiciel du 8 octobre 2026

## Périmètre et provenance

Reprise depuis `8d5555ac0bbe1d61eece3c5fe23914c9562c2ff5`, arbre `4f6c92b6bef42625e5ec96c4763f5e8250ca8430`, PR #150 ouverte Draft, base `feat/fixeo-mobile-m4-terrain` (`7256eeda9898639debe7c5a4e574a463d6fb2234`). Le worktree détaché PB1.1 préserve les worktrees et fichiers antérieurs. Aucun concurrent visible ; la dernière exécution avait déclaré STOP. Voir RECOVERY.md et recovery.json.

L’APK audité par le fondateur était 0.3.1(10), EAS `712d2e3e-09a2-44e3-ab95-6fd9b08a3df2`, SHA 8d5555ac, fingerprint `0c7bcdea51c494c8b34982987c978710f600db93`. Les constats Samsung sont USER-OBSERVED. Ce document décrit les preuves logicielles de PB1.1, pas une manipulation physique par Work.

Candidat Android : **0.3.2 (11)**, `ma.fixeo.app`, profil existant `w6-physical-certification`, EAS preview / application STAGING. Signature JKS existante observée le 8 octobre ; aucune génération, aucun changement de credentials. Starter : 7 $ consommés sur 45 $ à la récupération, concurrence 1. Prébuild natif sans APK réussi ; aucune permission ajoutée par rapport au manifeste PB1 conservé.

## Corrections

- Clavier partagé : mesure réelle de la fenêtre et du champ actif, réserve seulement le recouvrement non déjà traité par adjustResize, marge 24, défilement minimal, champs multilignes bornés et compteur dans la zone visible ; nettoyage listeners/frames et callbacks après démontage. Le dock existant se retire quand le clavier est ouvert.
- Devis : trois étapes conservées, restauration locale par owner/contexte après navigation et redémarrage, identifiant stable, brouillon supprimé après sauvegarde et purge au logout. Une revalidation serveur plus récente prime sur un brouillon local ancien. Aperçu ivoire/noir/champagne, émetteur Artisan et destinataire véritables, modèle de calcul partagé avec PDF.
- PDF : expo-print 15.0.8 + expo-sharing 14.0.8 + expo-file-system 19.0.24 compatibles SDK 54. HTML autonome échappé, A4, en-tête répété et lignes non coupées ; document en cache privé, bytes `%PDF-` et pages vérifiés avant partage. Export seulement après sauvegarde et identité renseignée. Aucune mutation du statut à l’ouverture/fermeture du partage. Aucune TVA, certification, numéro ou contact inventé.
- CRM : libellé d’édition distinct, annulation restaure les données sans écriture, refresh ne remplace plus une édition en cours, historique des devis daté.
- Agenda : pickers natifs 24 h par défaut, saisie manuelle explicite et repli sur erreur. L’heure entrée est interprétée en Africa/Casablanca, indépendamment du fuseau de l’appareil ; heures ambiguës/inexistantes refusées. Messages anciens effacés à la saisie, limites 7 jours et état vide propres à la période.
- Finance : dates réelles, arrondis en centimes, intégrité serveur client/devis/intervention/source, y compris changements ultérieurs d’une association déjà référencée. Sélection d’un autre client efface l’intervention incompatible ; fermeture ne crée rien.
- Profil : données absentes annoncées comme indisponibles, conseil RAFI fondé sur les champs manquants, compteur de présentation dans le champ mesuré, confirmation avant retrait d’une zone.
- Dock Artisan : Opportunités / RAFI / Agenda / Disponibilité. Cette dernière pointe sur la route existante `/artisan-workspace`, même backend canonique. Labels adaptables et cibles conservées. Seul le hash du fichier Dock protégé a été révisé avec justification de l’autorisation produit ; aucune neutralisation des autres invariants.
- RAFI MASTER, dérivés et icône 62 % conservés sans recréation. Client multi-demandes, transcription à confirmer, provenance et consentement photo, sécurité des prix et rôles conservés.

## Gates logiciels au candidat local

| Gate | Statut | Preuve et limite |
|---|---|---|
| A Auth/rôles/session | PASS logiciel ; LIVE AUTHENTICATED PROOF DEFERRED | Suites mobile/serveur ; aucun compte, reset ou nouvelle session Auth. Pas de login HTTP live revendiqué. |
| B Plusieurs demandes et brouillon | PASS logiciel | Tests de composants réels avec transport/stockage contrôlés, IDs et retries distincts, cold reload. |
| C Voix | PASS logiciel ; live DEFERRED | Tests existants : texte original, confirmation, ignorer, expiration session ; pas de transcription fournisseur live. |
| D Photo | PASS logiciel ; live DEFERRED | Tests existants de consentement, pertinence, provenance, retrait ; pas d’analyse fournisseur live. |
| E Devis | PASS logiciel | Nouveau parcours composant : 1 × 250, reprise après démontage, même ID, aperçu, sauvegarde, réouverture, édition, lien client. Tests PDF bytes/share simulés ; deux PDF réellement générés à partir du HTML applicatif, moteur WeasyPrint. |
| F CRM | PASS logiciel/STAGING | Annulation et refresh sans écriture ; base relue : 2 devis, 2 interventions, 1 mouvement lié. |
| G Agenda | PASS logiciel | 09/10/2026 à 14 h = 13:00 UTC en Casablanca, quatre fuseaux appareil ; picker et validation contrôlés. |
| H Finance | PASS logiciel/STAGING | 500/120 conservés ; fermeture sans écriture ; client incompatible rejeté au serveur ; RLS et owner testés. |
| I Profil | PASS logiciel | Multi-métiers/ville principale préservés par les contrats existants ; métriques non inventées. Rendu natif final DEFERRED. |
| J Disponibilité | PASS logiciel | Quatrième entrée canonique sur toutes les routes Artisan ; contrats backend inchangés. Persistance téléphone DEFERRED. |
| K RAFI | PASS logiciel | Décodage alpha des dérivés et shaders GLES exécutés hors navigateur, lifecycle/Reduce Motion testés ; fluidité téléphone DEFERRED. |
| L Menu/notifications | PASS logiciel | Routes et isolation testées ; réception réelle push DEFERRED, aucun envoi déclenché. |
| M Production | PASS | Main et cinq alias relus ; aucun appel de mutation Production. Configuration/env application inchangée et STAGING seulement. |
| N Contrôles locaux | PASS | 188 tests mobile, 212 serveur, tsc/lint, Doctor 18/18, export Android/Hermes, prébuild sans APK, diff-check. |
| N CI du SHA publié | À vérifier avant freeze | Ne pas lancer EAS tant que tous les workflows applicables du SHA exact ne sont pas verts. |
| O Build unique | NON LANCÉ à la rédaction de ce checkpoint | À renseigner dans la PR et le rapport final après freeze. Aucune relance autorisée. |

Les tests instrumentés clavier exécutent RafiScrollView + ArtisanField et les événements/mesures natives contrôlés sur un viewport 360×640, en modes redimensionnement et recouvrement, pour sept catégories de champs. Ils ne reproduisent pas le moteur Samsung. TypeScript et lint n’ont aucune erreur. Les avertissements npm liés au proxy et la dépréciation react-test-renderer ne sont pas masqués.

## Documents et sécurité

`evidence/pdf/devis-250-mad.pdf` : 1 page, 250 MAD. `devis-multipage.pdf` : 10 pages, 50 lignes, sous-total 12.500 MAD, remise 50 MAD, total 12.450 MAD. Vérifiés : signature PDF, A4, accents, dates, montants, limites de chaque caractère et vues des pages 1, 5, 10. Modèle applicatif réel, rendu WeasyPrint 66 ; le rendu expo-print et la feuille de partage Android attendent le téléphone final.

Migration locale `20261008145315_pb1_1_business_link_integrity.sql`, application STAGING seule ; version distante dans staging-evidence.json. SECURITY INVOKER, search_path fixé, ACL antérieures préservées, RLS activée sur les quatre tables. Garde initiale MD5 contre dérive de fonction. Tests PGlite sur la migration et le rollback réels ; transaction STAGING sous rôle authenticated/contexte d’une session existante du compte synthétique, intégralement ROLLBACK. Cette preuve DB n’est pas un login Auth HTTP. Empreintes des quatre collections PB1 identiques avant/après. Comptes, sessions et rôles utilisateur inchangés.

Advisors sécurité : aucun nouveau constat, comparaison hors timestamp d’observation. Les 36 INFO et 166 WARN préexistants restent hors correction PB1.1 (détails et liens de remédiation dans staging-evidence.json), sans prétendre certifier toute la sécurité historique du projet.

Aucun serveur API changé ni redéployé ; API STAGING existante `dpl_BPZNJpPVt5sC2dP1w4xiN5W3e5u7`. Vercel refuse explicitement les déploiements Git de W6 dans vercel.ts. Aucune Preview Web. Les exports locaux/CI sont des artefacts de compilation non hébergés.

## Risques résiduels et rollback

- Validation Samsung A/B obligatoire : IME, caret, geste retour, Android print/share, police agrandie, couleurs sans filtre, fluidité et reprise après arrêt forcé.
- PDF partagé reste temporairement dans le cache privé après partage ; Android peut l’évincer. Aucun PDF public ni envoi automatique. L’annulation du partage ne fournit pas une preuve de remise au client.
- Le nouveau garde serveur refuse une réaffectation client/source qui casserait un historique lié ; il ne détache ni ne supprime les données. Aucune nouvelle suppression introduite.
- Brouillon local lié à l’owner, au contexte et à la version du devis ; logout explicite purge les brouillons. Révocation garde les brouillons sur l’appareil pour récupération par le même owner après authentification. Aucune nouvelle autorité d’accès.
- Rollback code par revert des seuls commits PB1.1, jamais reset/force-push/main. Conserver les données, travaux et assets précédents. Réinstaller l’APK antérieur seulement selon les contraintes Android de version/signature ; ne pas promettre un downgrade sans perte de données. Aucun second build dans ce mandat.
- Rollback STAGING fourni dans rollback-business-link-integrity.sql ; restore de fonction/triggers antérieurs, pas de suppression de données, pas d’ACL/RLS modifiée. Son exécution réouvrirait l’ancien défaut d’association ; ne l’exécuter que si nécessaire dans le cadre autorisé.

## Checklist de recertification des deux Samsung

1. Installer 0.3.2(11), vérifier ma.fixeo.app/STAGING, icône ~62 %, couleurs filtre désactivé, RAFI animé/fallback/Reduce Motion et retour premier plan.
2. Client : connexion, deux demandes séparées, nouvelle demande sans écraser brouillon, reprise après arrêt ; voix TV ignorée sans remplacer le texte ; photo hors sujet/retirée conserve la description.
3. Clavier Samsung : titre, désignation, quantité/prix, dernier champ, Notes client, adresse, note finance, notes Agenda, bio et compteur ; petits écrans et texte agrandi, fermeture/retour sans perte ni saut.
4. Devis témoin : 1 × 250, aperçu, brouillon/reprise/édition sans doublon, CRM lié ; export PDF, ouvrir pages/accents/A4 ; annuler partage laisse le statut Brouillon. Ne pas réellement envoyer pendant le test.
5. CRM : modifier temporairement les notes puis annuler ; vérifier les 2 devis/2 interventions/1 encaissement PB1 intacts.
6. Agenda : client présélectionné, 09/10/2026 14:00, Planifiée, filtre 7 jours et fiche CRM, aucun ancien message ; relire après redémarrage.
7. Finance : 500/120 MAD, fermer saisie sans écriture, changement de client efface le job incompatible, montants invalides rejetés.
8. Profil : Électricité + Plomberie, Fès conservée lors d’ajout de zone, confirmation retrait, présentation/counter, métriques honnêtes. Dock Disponibilité ouvre et persiste le seul état canonique.
9. Menu, retours, notifications et permissions/refus ; réception push réelle seulement via procédure de test autorisée distincte, aucun dispatch réel.

AUCUN MERGE / PRODUCTION INCHANGÉE / PR DRAFT. Le verdict final, le SHA gelé, les résultats CI et le seul build seront attestés dans le rapport de livraison et la PR sans modifier le code après freeze.
