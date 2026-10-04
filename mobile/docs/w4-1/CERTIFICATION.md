# STOP — W4.1 INTELLIGENCE GATEWAY NOT CERTIFIED

État historique W4.1. Le GO limité W4.1A a depuis été reçu ; consulter le [rapport d'activation W4.1A](../w4-1a/CERTIFICATION.md) pour le nouvel audit, les blocages techniques et le verdict actuel.

Livraison staging du 4 octobre 2026. PR draft [#148](https://github.com/fixeo-app/Fixeo-clean/pull/148), cible `feat/fixeo-mobile-w4-client-os-wow`. Aucun merge. Aucune modification de MAIN, Production ou Development. Aucun build physique, aucune extension W5.

## Résultat

L'architecture sans service-role fonctionne avec de vrais JWT sur le staging canonique. Le serveur W4.1 est déployé en Preview, les trois migrations sont appliquées, les sept variables autorisées sont créées dans leur seul scope et Vault contient la clé dédiée. Le gate SQL est **désactivé à la livraison** et les trois sessions de test sont révoquées. Le parcours direct existant n'a pas été modifié.

Deux conditions empêchent le PASS d'intégration :

1. **Proxy partagé Mobile non basculé.** `mobile-rafi-preview-proxy` reste en version 2, avec ses routes photo/transcription et son ancien Preview. L'URL publique utilisée par Mobile reste inchangée. Le transport Estimator a été testé directement sur le Preview protégé ; cela ne prouve pas le parcours via le proxy partagé. La source candidate est fournie sans secret. Ses paramètres serveur `FIXEO_MOBILE_PREVIEW_ORIGIN` et `FIXEO_MOBILE_PREVIEW_BYPASS` nécessitent un inventaire précis et une autorisation de configuration Supabase distincte : leur existence sous ces noms n'est pas certifiée. Le GO limité aux sept variables Vercel et au matériel d'attestation Vault n'a pas été étendu à ces écritures.
2. **Purge physique des médias non certifiée.** Les politiques d'expiration ferment l'accès, mais ne suppriment pas les objets. Le staging n'a ni pg_cron, ni pg_net, ni table cron.job. Le mécanisme canonique de maintenance exige une autorité Storage hors du flux JWT Client ; la route legacy correspondante est volontairement absente du Preview W4.1. Aucun service-role ni credential supplémentaire n'a été utilisé pour contourner ce point. Une autorité de maintenance minimale et sa preuve de suppression restent à définir/revoir avant activation.

Ces blocages ne rendent pas service_role indispensable à la confirmation interactive. Ils empêchent de certifier le déploiement Mobile complet et la rétention opérationnelle. Ne pas remplacer ce verdict par PASS sur la seule base de la CI.

## Preuves

| Périmètre | Résultat | Preuve |
| --- | --- | --- |
| Régressions serveur / SQL local | 191 tests réussis, dont SQL réel PGlite avec extension HMAC de test ; pgcrypto réel utilisé sur staging | `server-regression.log`, workflow Mobile Intelligence Contracts |
| Contrats Mobile | 85 réussis ; aucun moteur de calcul financier importé dans les nouveaux transports | `mobile-contracts.log` |
| Typecheck / export web | Réussis, sans build physique | `mobile-gate-a.log` |
| Expo Doctor | 18/18 | `expo-doctor.log` |
| CI distante | Cinq workflows réussis sur dc6c673427fd388fefe7cc9820791321bfa13201 | `ci.json` |
| Preview HTTP → staging | 22 contrôles réussis : anon/JWT invalide/rôle, Client, cross-user, tampering, expiry, confirmation concurrente, retry, conflit, ownership, demande directe, attestation | `preview-live.json` |
| Contextes tarifaires / STOP sur Preview | 4 contrôles supplémentaires réussis : contexte altéré, cross-user, ville différente, vrai STOP sans levée locale | `preview-negative-live.json` |
| Diagnostic → staging / Storage réels | 8 contrôles réussis, fournisseur simulé : provenance, références valide/expirée/altérée/cross-user, quote atomique, vrai STOP, chemin Storage arbitraire refusé | `staging-diagnostic-live.json` |
| OpenAI réel depuis Preview | Photo d'illustration de test, sortie canonique persistée, référence retournée ; run DB marqué provider_called=true | `preview-photo-live.json`, `STAGING.json` |
| Frontières SQL / Storage réelles | 8 groupes réussis : portée attestation, offre/replay/conflit, ownership, VAP atomique, read cross-user, overwrite, substitution hash refusée avant analyse | `staging-boundary-live.json` |
| Atomicité après écriture | Erreur SQL injectée après rattachement client : zéro request, redemption ou reçu partiel ; transaction de test rollbackée | `atomicity.json`, `tests/mobile-intelligence/staging-atomicity.sql` |
| ACL / Vault / RLS | Cinq wrappers authenticated uniquement ; anon et service_role refusés. Aucun accès Client aux deux nouvelles tables ou au Vault ; RLS active | `rpc-acl.json`, `STAGING.json` |
| Isolation Preview | Sept routes legacy testées, toutes 404 | `preview-isolation.json` |
| Révocation | JWT Client valide refusé après désactivation du gate | `kill-switch.json` |

Les tests HTTP complets portent sur le runtime du commit `2a0c69a6ea02a7d56c8cb7c0773d3827d404ed04`, déployé dans `dpl_HxS8Zr38FYk4oEuUjF7C1BsnSEGn`. Le commit `dc6c673427fd388fefe7cc9820791321bfa13201` corrige les consommateurs du fichier de configuration legacy et ajoute les tests de frontière ; il conserve les sources du gateway à l'identique. Les derniers commits de livraison ajoutent les preuves et le candidat de proxy non déployé. Le SHA final est fourni dans la PR et le compte rendu de livraison.

La suite de tests autorise au plus deux retries explicites sur indisponibilité réseau Auth/dépendance et les comptabilise ; elle ne masque pas les refus fonctionnels. Aucun retry réseau automatique de mutation n'est ajouté au transport de production. Les premières itérations ont révélé une erreur de priorité d'opérateurs JSON SQL et des références CI au précédent nom de configuration ; elles ont été corrigées puis revérifiées.

Le dispatch JWT a été invoqué sur une request confirmée : réponse canonique `no_candidate` dans ce staging sans artisan éligible. Aucun matching avec artisan réel ni envoi externe n'est revendiqué. Les deux échecs de l'ancien test Enterprise RAFI observés lors d'un contrôle supplémentaire concernent un RPC de réconciliation et un libellé UI non modifiés par W4.1 ; ils ne sont pas inclus dans les 191 tests serveur annoncés.

## État conservé et rollback

Trois comptes de test synthétiques, six requests, cinq sessions Diagnostic et cinq objets Storage de test sont conservés pour la review ; leurs identifiants figurent dans `staging-fixtures.json`. Aucun média utilisateur réel n'a été utilisé. Les sessions Auth ont été révoquées et le gate est fermé. Les objets ne sont pas présentés comme physiquement purgés.

Arrêt immédiat déjà appliqué : `mobile_intelligence_config_v1.enabled=false`, ce qui bloque RPC, attestations/replays et nouvelles policies Storage. `ROLLBACK.sql`, vérifié sur PGlite en conservant la request confirmée, propose ensuite le retrait des seules fonctions/policies W4.1, en conservant les données métier et reçus. Retirer les seules sept entrées Vercel identifiées dans `ENV_MANIFEST.md` et la seule clé Vault W4.1 si la review décide un abandon. Ne jamais supprimer directement les lignes storage.objects pour prétendre supprimer les fichiers.

Manifest final sans valeurs : `ENV_MANIFEST.md`. Migrations exactes et SHA256 : `MIGRATIONS.md`. Architecture, contrats RPC et policies : `ARCHITECTURE.md`. **Zéro mutation Production. Attente de review indépendante.**
