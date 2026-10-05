# W8 release blocker — physical Diagnostic media purge

`W8_RELEASE_BLOCKER = PHYSICAL_DIAGNOSTIC_MEDIA_PURGE_CERTIFICATION`

Décision explicite W4.1B du 4 octobre 2026 : la purge physique sort de la certification **fonctionnelle** W4.1 et devient un gate obligatoire W8 — Accessibility / Performance / Privacy / Operations Hardening. Ce report n'autorise aucune purge et ne signifie pas que la rétention opérationnelle est certifiée.

## Gate de release impératif

La preuve de suppression physique doit être obtenue **avant toute activation Production, Store release ou Release Candidate finale**. Un PASS fonctionnel W4.1 n'autorise aucune de ces releases. L'accès expiré fermé ne constitue jamais une preuve de suppression physique.

## Primitive et doctrine conservées

La primitive `public.diagnostic_cleanup_v1(p_action text, p_payload jsonb)` existe sur le staging canonique `fixeo-diagnostic-staging` / `kqyhusnbybsukbcaoqtu`. Sa définition réelle et ses ACL sont archivées dans le [dossier W4.1A](../w4-1a/CERTIFICATION.md).

Elle fournit claim, leases de purge, sélection raw/clean, expiration, retries/backoff, finish et suppression des dossiers après tombstones. La rétention de 30 jours après clôture observée, `closed_seen_at`, les leases et le backoff restent inchangés. Ne pas reconstruire cette logique en W8.

## Pourquoi le test est reporté

Le staging est partagé et contient des dossiers historiques hors fixtures W4.1. L'audit a identifié le dossier `20000000-0000-4000-8000-000000000400`, sélectionné par le prédicat global de suppression des dossiers expirés dans `claim`. Le payload canonique ne propose aucun filtre de session. Une allowlist de paths dans le worker ne neutralise pas les autres effets SQL de ce claim.

Les cinq objets documentés W4.1 sont conservés ; aucune suppression W4.1A ou W4.1B n'est revendiquée. Quatre lignes étaient éligibles uniquement au nettoyage raw lors de l'audit W4.1A, alors que leurs objets raw étaient déjà absents : cette situation ne prouve aucune suppression des clean objects présents.

## Travail obligatoire W8

1. Établir un périmètre de fixtures isolé et prouver qu'aucun claim ne modifie de dossier ou média non autorisé.
2. Définir l'autorité de maintenance serveur minimale, séparée du transport Mobile et de la Vercel Intelligence Gateway. Le Client n'obtient jamais DELETE Diagnostic Storage, cleanup authority ou EXECUTE sur la primitive canonique.
3. Réutiliser la primitive canonique dans un worker borné, limité aux paths revendiqués et aux leases valides. Préférer une identité serveur restreinte avec RLS/délégation gardée si elle suffit. `service_role` reste interdit sans justification précise et GO distinct ; ses ACL actuelles ne démontrent pas sa nécessité.
4. Certifier manuellement : objet synthétique présent → éligibilité → claim → suppression **via Storage API** → absence réelle avec autorité de lecture encore valide → finish → tombstone/état DB cohérent. Ne jamais supprimer les seules métadonnées `storage.objects` en SQL pour simuler cette preuve.
5. Tester raw et clean, non-expiré préservé, lease faux/expiré, échec Storage puis retry, finish ok/error, double worker, SKIP LOCKED, objet déjà absent, path hors claim, cross-session et cohérence DB.
6. Qualifier ensuite le scheduler adapté et sa surveillance. Aucun scheduler permanent avant certification manuelle du worker. Séparer explicitement « worker fonctionnel » et « exécution planifiée ».
7. Documenter rotation/révocation de l'autorité serveur, rollback, preuves et état final avant de lever le gate de release.

## État W4.1B

Purge non exécutée. Aucun claim/finish, aucun DELETE Storage, aucune autorité de maintenance provisionnée, aucune modification de rétention, aucun scheduler activé. Le transport interactif W4.1 reste sans service_role.

**W8_RELEASE_BLOCKER reste OPEN. W8 n'est pas démarré par ce document.**
