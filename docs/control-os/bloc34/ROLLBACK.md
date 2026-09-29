# Rollback Blocs 3 + 4

Baseline applicative : `56272c24f1f476498427c8176121174bde72c3f5`.

En cas de nécessité de rollback Production : STOP du mandat et signalement précis, conformément aux conditions utilisateur. Ne pas restaurer la sauvegarde automatiquement.

1. Revenir à l’arbre applicatif de la baseline par le workflow Git canonique, puis attendre et vérifier Vercel READY.
2. Les fonctions additives peuvent rester en place pendant ce retour : elles ne changent aucune autorité/policy et l’ancien frontend ne les appelle pas.
3. Si leur retrait est nécessaire, exécuter `rollback.sql`, après confirmation que l’application B34 n’est plus servie. Le script retire exclusivement les onze fonctions additives ; sans CASCADE, sans données métier supprimées.
4. Conserver les aperçus et audits existants. Une affectation/relance réelle éventuellement effectuée par un opérateur reste un événement métier légitime et n’est pas annulée par un rollback applicatif.

La sauvegarde manuelle Supabase PHYSICAL du 29/09/2026 00:11:57 UTC a été fournie dans la conversation, avec Restore disponible attesté. Aucune restauration n’est exécutée. Les comparaisons avant/après cutover doivent prouver que seuls les objets attendus ont été ajoutés et que les données métier sont inchangées pendant la migration.

## Guard P0 mission.settle

Le rollback applicatif et `rollback.sql` conservent le guard P0 : ses signatures sont compatibles avec la baseline B1/B2 et il n'ajoute aucune table. Le test DB/rollback B34 est exécuté avec ce guard déjà installé et vérifie qu'il reste intact après retrait des onze fonctions B34.

Ne pas restaurer les anciens corps de `admin_settle_mission_v1` et `control_action_preview_v1` : cela réintroduirait le règlement d'une mission sans demande. Si le guard nécessite une correction, suspendre le cutover et préparer un correctif ciblé, sans retirer le refus d'une demande absente. Aucun rollback ne modifie les missions historiques ni ne recrée leurs demandes.
