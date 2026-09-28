# Candidat Bloc 1 — application et retour arrière

**Ce document prépare des opérations Production. Il n’autorise aucune exécution.** Une autorisation finale distincte doit désigner le SHA candidat, les hashes SQL et le périmètre approuvé. Aucun merge ni migration Production n’a eu lieu pendant la préparation.

## Préconditions du GO

1. CI du SHA exact verte, Preview du même SHA READY, tests et limites relus. Une recette Supabase authentifiée en backend isolé reste nécessaire si elle n’a pas été démontrée dans le rapport final ; ne pas convertir une absence d’accès en PASS.
2. Relire HEAD main et SHA réellement servi ; baseline attendue `04528ab40523e9077a89f0381fed639540d0d111`. Toute évolution nécessite un diff ciblé et un candidat réconcilié ; aucune réinitialisation de main.
3. Exécuter `01-preflight-readonly.sql` sur le projet Production explicitement identifié. Comparer ACL/policies retournées à `baseline-fingerprints.json`. Aucun écart de définition/grant ne peut être écrasé silencusement.
4. Vérifier l’existence d’une sauvegarde restaurable et son point de restauration via l’administration habituelle. Aucune nouvelle copie de données n’est créée par le Bloc 1. Ne jamais employer le projet de restauration `avzawlissxfdjgxfeaxu` comme environnement de test.
5. Valider une courte fenêtre contrôlée de changement. Les anciens onglets Client/Artisan/Admin doivent recharger les nouveaux producteurs après le durcissement ; les écritures directes anciennes seront refusées. Ne pas restaurer leurs grants pour masquer un cache ancien.
6. Vérifier les signatures SHA256 de tous les SQL et l’absence de migration concurrente. Connexion TLS et rôle de migration approprié ; ne pas copier de secrets dans le rapport/PR.

## Ordre exact proposé, après autorisation seulement

| Ordre | Opération | Attendu / arrêt |
|---|---|---|
| 1 | Figer le candidat et la fenêtre ; conserver main/Production inchangés jusqu’au GO | Pas de merge automatique ni de job db-push dans la CI |
| 2 | Préflight lecture seule, comparison catalogue et backup | Arrêt immédiat si dérive ; aucun SQL write avant réussite |
| 3 | `20260928212710_control_os_b1_foundation.sql` | Champs additifs, journal, previews, reversements, dates ; pas de reclassification historique |
| 4 | `20260928212721_control_os_b1_authorities.sql` | Devis/Mission/Finance/producer Client/photo ; preserve Pricing et signatures réutilisées |
| 5 | `20260928212728_control_os_b1_projections.sql` | Lectures allowlist et action preview/execute ; membres tenant inchangés |
| 6 | `20260928212736_control_os_b1_acl_cutover.sql` | Retrait table/column grants, vues invoker, policies devis/claims, winner, SLA, verified/classification |
| 7 | Déployer le SHA applicatif approuvé sur Production par la procédure Vercel normale | Le merge main qui déclenche Production exige le GO explicite ; refresh des sessions anciennes |
| 8 | `02-postflight-readonly.sql`, contrôles HTTP/RPC de lecture avec comptes autorisés | Guards, ACL, vues, résumé/dossier, fraîcheur ; zéro création de fixture en Production |
| 9 | Vérifier une action métier réelle uniquement si son opérateur l’a effectivement demandée et confirmée | Relire résultat et audit ; ne pas créer une mission/règlement/claim artificiel pour « tester » |
| 10 | Lever la fenêtre et surveiller erreurs par source | Contrôles contractuels, aucun message/campagne automatique |

Chaque fichier SQL utilise BEGIN/COMMIT, lock_timeout 5 s et statement_timeout 30 s. Un fichier en erreur est annulé ; ne pas poursuivre automatiquement avec les suivants. Les quatre fichiers ne forment pas une transaction distribuée avec Vercel : risque de courte indisponibilité des anciennes sessions explicitement assumé dans la fenêtre. Ne pas déclarer un déploiement sans interruption. Un orchestrateur d’application peut exécuter les quatre contenus dans une transaction unique après retrait **mécanique** de leurs BEGIN/COMMIT et enregistrement correct de l’historique ; ce mode doit être certifié séparément, il n’est pas le plan par défaut livré.

Ne pas utiliser un `supabase db push` aveugle de toutes les migrations historiques : le Blueprint constate déjà des divergences de noms entre repository et registre live. Appliquer uniquement ces quatre versions, dans l’ordre, par l’outil de migration autorisé qui enregistre leur exécution. Si une phase a été appliquée, vérifier son contenu exact avant reprise ; aucun `IF NOT EXISTS` général pour cacher une exécution partielle.

## Post-déploiement

- main, SHA Vercel Production, READY et alias doivent correspondre au candidat approuvé.
- Anonymous : Control 401/405, aucune donnée Claims ; non-admin : projections/actions refusées.
- Admin : résumé exact avec scope/classification/fraîcheur ; sources manquantes inconnues, pas zéro ; coût d’une source ne bloque pas les autres.
- Devis : soumission nouvelle non visible au client avant revue ; aucune nouvelle mission validated par acceptation ; anciennes accepted consultables, anomalie historique visible.
- Client/Artisan : lecture et producteurs RPC ; rôle, prix et cycle ne sont pas modifiables par table-write navigateur ; photo propriétaire ciblée.
- Enterprise : tenant/site et guards restent applicables ; pas de membership Admin inséré ; SLA vue/facts concordants, dates manquantes inconnues.
- Finance : prix final ne change pas confirmed ; rapprochement uniquement sur preuve déclarée et version, audit corrélé ; VAP persisté inchangé.
- Confidentialité : aucune table Business, média brut, token, hash ou PII complète dans réponses Control, logs/audit.
- Examiner les erreurs de contraintes/grants/timeout ; ne jamais « corriger » en réouvrant les privilèges directs.

## Rollback

**Avant commit d’une migration en échec** : rollback transactionnel automatique. Conserver le précédent déploiement si aucune autorité n’a changé. Une phase Foundation réussie peut rester en place sans effacer l’historique.

**Après installation des autorités, avant toute action nouvelle** : pause contrôlée des commandes par `03-rollback-pause-actions.sql`, maintien des lectures et producteurs canoniques. Corriger le défaut puis re-certifier avant `04-resume-actions-after-review.sql`. Ne pas revenir à une version qui crée validated à l’acceptation ni à la vue Claims publique.

**Après des actions nouvelles** : même pause ; conserver audit, tickets, reversements, versions de devis et liens mission. Aucun DROP de table/colonne, DELETE, recalcul massif ou inverse automatique des transactions métier. Une correction Finance utilise `correct/cancel` après revue humaine ; une ownership/mission nécessite son autorité et mandat réel. Ne pas restaurer un snapshot global qui effacerait des opérations postérieures.

**Rollback applicatif** : un retour au SHA historique complet n’est pas sûr après retrait des writes directs. Conserver les adaptateurs producteurs Client/photo et les autorités sécurisées ; si seule l’UI pose problème, revenir à une UI compatible via un commit de correction et déploiement explicitement approuvé. Les endpoints de commande restent suspendus pendant l’incident. La branche candidate et le diff complet permettent de préparer ce commit, sans restaurer d’autorité parallèle.

La pause et la reprise SQL sont testées dans la fixture isolée. Une restauration de sauvegarde Production n’a pas été effectuée et n’est pas couverte par cette certification. La durée de rétention des previews/audit et leur archivage doivent être définis avant un volume durable ; aucun purge-job destructif n’est ajouté ici.
