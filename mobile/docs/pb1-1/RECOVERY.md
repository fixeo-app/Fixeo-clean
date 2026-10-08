# FIXEO PB1.1 — Recovery du 8 octobre 2026

Base vérifiée : PR #150 OPEN / DRAFT / UNMERGED, branche W6, SHA `8d5555ac0bbe1d61eece3c5fe23914c9562c2ff5`. Le SHA historique `3b373891` ne correspond pas au binaire testé. EAS confirme APK 0.3.1(10), build `712d2e3e-09a2-44e3-ab95-6fd9b08a3df2`.

Les worktrees précédents sont conservés intégralement ; leurs 43 fichiers récupérés correspondent aux empreintes du checkpoint précédent. Le travail courant possède un nouveau worktree détaché, et poursuivra la branche distante W6 via mise à jour non forcée après contrôle du parent. Aucun processus concurrent visible ; la précédente conversation a déclaré STOP. Cette observation ne constitue pas un verrou inter-conversations global.

EAS Starter : 7 $ / 45 $ de crédit consommés, une concurrence. Credentials existants à réutiliser. Aucun build déclenché. Configuration STAGING de `eas.json` vérifiée. Main et domaines de Production relus sans mutation.

## Audit initial

| Domaine | Classement | Constat |
|---|---|---|
| Clavier | À corriger, P1 physique utilisateur | Scroll partagé sans suivi explicite du champ actif |
| Client multi-demandes/voix/photo | Déjà corrigé à revalider | Contrats présents dans le SHA testé |
| Devis | À corriger | Aperçu basique ; aucun export PDF dans le module |
| CRM | À corriger | Libellé édition identique création ; annulation conserve le tampon local |
| Agenda | À corriger | Validation dupliquée persistante ; saisie dans fuseau appareil vs affichage Casablanca |
| Finance serveur | À corriger | Trigger owner présent, mais absence de contrôle client de l’intervention |
| Profil | À corriger | Métriques nulles affichées « En cours de calcul » sans preuve de calcul |
| Dock | À corriger | Trois entrées ; quatrième Disponibilité approuvée |
| RAFI / icône | Déjà présent à revalider | Assets canoniques et icône 62 % conservés |
| Physique final | Non démontré | Recertification des Samsung après APK final uniquement |

## Sécurité / rollback

STAGING uniquement `kqyhusnbybsukbcaoqtu`. Aucun reset/création de compte, aucun dispatch/envoi réel, aucune Preview Web, aucun merge. Pas de prix, statut, fiscalité ou métrique inventés. Les preuves utilisateur restent USER-OBSERVED. Les tests transactionnels se terminent par ROLLBACK. Les fixtures PB1 restent intactes.

Retour arrière : revert explicite des seuls commits PB1.1 ; aucun reset destructeur ni force-push. Rollback SQL de la fonction fourni avant migration. Build interdit si un gate logiciel reste rouge.
