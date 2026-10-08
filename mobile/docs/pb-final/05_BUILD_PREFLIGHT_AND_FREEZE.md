# Préflight et protocole de gel — B8

Avant build, le dossier de livraison externe doit attester le SHA final exact, les cinq CI vertes, le clean tree et les gates ci-dessous. Ce document ne prétend pas contenir son propre hash Git. Après gel : aucune modification source, aucun commit supplémentaire ni retry build.

- EAS @fixeo-maroc/fixeo-mobile ; projet bb76a67f-4304-48a6-ad29-ca7382d28a7a ; package ma.fixeo.app.
- Maximum EAS observé avant gel : 0.3.2 (11), build 90e43558-8f4f-4bd3-a5f1-39663213bdfe, réussi. Nouveau 0.3.3 (12), version locale et autoIncrement=false.
- Profil w6-physical-certification : Android APK, distribution internal, environment preview, developmentClient=false, ubuntu-24.04-jdk-17-ndk-r27b ; aucune soumission.
- Variables explicites profil : APP_ENV staging, Supabase et API proxy kqyhusnbybsukbcaoqtu, EAS project exact, callback w6-auth-staging.fixeo.ma. Les valeurs publiques ne sont pas des secrets ; aucun secret n’est copié dans les preuves.
- Signature : credential JKS existant par défaut Build Credentials 0fvVolxP1v, selector e956aac0-644a-4d82-96b7-04110cea0d4d, upload 1 octobre. Aucune génération ni modification de credential.
- Quota B0 : Starter, 7 USD/45 utilisés, 38 restants. Relecture requise immédiatement avant le build. Aucune mise à niveau ni achat.
- Gates : Mobile 205, Server/DB 212, typecheck, lint, Expo Doctor 18/18, RAFI 217 frames/alpha, shader GLES, export Android Hermes, prebuild config/permissions. L’export JS et la génération de projet natif ne sont pas des builds APK.
- Cinq CI requis : Mobile Gate A, Mobile Intelligence, Client OS C4, Control contract, Supply Engine. Le Web export de l’ancienne CI est seulement un artefact, aucun serveur/Preview/déploiement Web n’est lancé.
- Aucune migration nouvelle ; RLS/grants/fixtures préservés ; main et aliases Production inchangés à la lecture. PR #150 doit rester OPEN/DRAFT/UNMERGED ; expected-SHA sur chaque publication.

Au plus un déclenchement EAS. Si le résultat est inconnu, vérifier le listing au lieu de relancer ; si échec, BLOCKED sans retry. Vérifier ID/SHA/version/env/signature/hash/taille de l’APK obtenu, puis livrer et STOP. Preuves physiques futures : DEFERRED.
