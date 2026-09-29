# Retour arrière Bloc 2

Ce document prépare le futur cutover ; il ne l'autorise pas. Production reste sur Bloc 1 pendant la certification du candidat.

1. Si le candidat n'est pas déployé en Production : abandonner sa Preview/branche si nécessaire. Aucun rollback Production à exécuter.
2. Après un futur GO et un déploiement Bloc 2 : redéployer le dernier arbre Bloc 1 certifié `529961f99136c750dad8803870b32e9602372c38`, vérifier READY, SHA et assets. Les autorités et données Bloc 1 restent compatibles.
3. Si la désactivation des lectures RAFI est nécessaire, retirer uniquement les trois grants ci-dessous dans une opération explicitement autorisée. Les erreurs de lecture doivent devenir UNAVAILABLE ; ne pas injecter des zéros de remplacement.

```sql
begin;
set local lock_timeout='5s';
revoke execute on function public.control_rafi_source_v1(text,text) from authenticated;
revoke execute on function public.control_rafi_dispatch_read_v1(uuid) from authenticated;
revoke execute on function public.control_rafi_network_list_v1(text,text,text,text,uuid,integer) from authenticated;
commit;
```

Ne pas retirer les grants Control Bloc 1, ne pas restaurer ses anciens raw writes et ne pas supprimer d'audit. Les décisions RAFI sont dérivées : aucune table de décisions, aucun backfill et aucune donnée métier à restaurer. Une reprise des trois grants nécessite une nouvelle revue des défauts constatés.

Le client garde en mémoire un ticket et sa clé d'idempotence après une réponse d'exécution incertaine. Une nouvelle confirmation avec les mêmes paramètres réutilise ces références ; un rechargement complet perd cet état local, mais le dossier garde la chronologie canonique à relire avant toute nouvelle action.
