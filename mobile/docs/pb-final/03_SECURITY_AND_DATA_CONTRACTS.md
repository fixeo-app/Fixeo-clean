# Sécurité et contrats — B8

SOFTWARE-TESTED : 205 tests Mobile, 212 tests serveur/DB isolée. Aucun nouvel appel fournisseur réel ; aucune nouvelle session Auth ; aucun compte, rôle, RLS/grant, RPC, Edge Function, donnée métier ou configuration Production modifié.

## Autorités et invariants

- Photo : consentement explicite d’analyse, conservation séparée ; remplacement/retrait invalide les dépendances ; un seul média selon contrat existant. Multi-photo requiert contrat v2 versionné, limites/quota, stockage owner, consentement par lot et tests d’invalidation ; DEFERRED.
- Voix : rationale/permission, traitement sur action ; transcription à vérifier, remplacer/compléter/ignorer/restaurer ; ville proposée et non déclarée comme fait. Une sélection explicite gagne. Réponses tardives ignorées après sortie/session.
- STOP : persistance et blocage de tout chemin de création/estimation ; aucun retour ne le lève localement.
- Estimation : prix/session/compatibilité côté serveur ; hint métier avec provenance ; consulter ne crée rien. Création uniquement confirmation explicite ; clé stable/payload figé sur double tap et timeout après commit.
- Métier : canonical actor et génération de session avant/après lecture ; owner explicite, tables sous RLS. CRM, devis, intervention et ledger restent liés au même propriétaire/client/source ; trigger PB1.1 préservé byte-for-byte.
- Devis : statut draft/source personal/owner/id/updated_at dans la même mutation. Conflit explicite et aucune fusion silencieuse. Réconciliation d’une réponse perdue seulement si contenu identique. Total en centimes MAD ; 1×250=250, 50 lignes contrôlées ; partager/annuler ne change pas le statut envoyé.
- Agenda : conversion Africa/Casablanca et dates civiles, picker 24h. Finance : montant/date validés et associations UI+serveur ; annuler sans écriture. Une intention avec UUID est durable avant mutation ; retry identique ne remet pas à zéro un statut ultérieur.
- Profil : état dirty par section, actualisation préservée ; version distante comparée avant RPC existant et choix explicite. Limite : la prélecture et le RPC ne constituent pas un CAS atomique ; pas de nouveau contrat backend improvisé. Aucun autre champ dirty n’est soumis.
- Sessions : navigation Auth permise après révocation ; données affichées purgées, requêtes tardives rejetées ; copies ordinaires devis purgées au logout. Une intention métier à résultat inconnu reste privée sous sa clé owner pour réconciliation au retour du même compte ; aucun auto-retry ni transfert intercompte.
- Notifications : rôle/type/ID et lecture propriétaire ; push inconnu vers alertes du bon rôle avec explication. Aucun push réel envoyé. Marquer lu n’affiche jamais succès après erreur.

## STAGING lu, non modifié

Projet kqyhusnbybsukbcaoqtu. Quatre tables artisan_business_* : RLS actif. Fonction artisan_business_validate_links : SECURITY INVOKER, search_path public,pg_temp, aucun grant anon ; MD5 4f56a9587cea155c0afc2604621a3257 identique à PB1.1. Migration distante 20261008150316 préexistante. Source 20261008145315_pb1_1_business_link_integrity.sql SHA256 0fc4e7fff09a465308dfb99374dcd98b3000158bcfdfd044ff570c8cf98743b6. Zéro réapplication.

Témoins PB1 : 1 client, 2 devis, 2 interventions, recettes 500 MAD et dépenses 120 MAD conservés à la lecture. Des hashes avec une requête jsonb explicite sont enregistrés pour comparaison pré/post build ; ne pas comparer des hashes historiques calculés par une méthode non documentée. Pas de données personnelles exportées dans les nouvelles preuves.

La preuve live HTTP/JWT et les fournisseurs externes restent DEFERRED. Les tests DB isolés ne sont pas un PASS authentifié live.

## Production et rollback

main et les cinq aliases historiques relus : main f8e59d5ad7294dd5493bf7b0219740248d2a8d64 ; tous pointent dpl_63jTTiFwLrBD3D4Tc3Gxi7KVNjvR. Cette preuve couvre Git et mapping des aliases observés, pas une inspection exhaustive de tous les systèmes externes. Zéro écriture Production par cette exécution. vercel.ts maintient deploymentEnabled=false pour la branche cible ; aucun changement serveur ni Vercel.

Rollback Mobile par nouveaux revert commits sur la branche, après nouveau mandat si nécessaire, jamais reset/force-push/main. Aucun rollback DB nécessaire : zéro mutation. L’APK historique reste disponible ; aucun effacement de données d’appareil n’est prescrit. Un second build demande un nouveau mandat.
