# FIXEO Control OS — Blocs 3 + 4

Reprise vérifiée le 29 septembre 2026 : MAIN / Production `56272c24f1f476498427c8176121174bde72c3f5`, PR #53 mergée, Vercel READY. Aucun candidat Blocs 3 + 4 antérieur retrouvé. Les Blocs 1 / 2 et le nettoyage contrôlé restent acquis.

## Architecture et périmètre

Le dossier est une projection des 13 familles canoniques existantes. Réservation et Finance restent respectivement des parcours demande/offre tarifaire et mission/reversement. Aucun dossier miroir, aucune nouvelle table métier, aucune modification des policies, triggers ou RPC métier existants.

- Identité via `control_row_v1`, champs de provenance, ID adressable dans `admin.html?view=operations&dossier=request:<UUID>`.
- Relations FK / références canoniques paginées ; aucun rapprochement par nom/téléphone.
- Timeline paginée : timestamps canoniques distingués des audits, acteur/corrélation conservés. Les anciennes images de lignes et les payloads privés ne sont jamais exposés.
- Sections indépendantes et erreurs explicites ; fermeture clavier, focus, historique navigateur et lien partageable.
- Recherche unifiée et paginée sur les 13 types, accessible depuis Control Tower, avec recherche exacte par ID.
- Operations : demandes Client/invité/Enterprise, offres, exécuteur, affectations et missions ; filtres ville, métier, âge, urgence, SLA, origine, mode, exécuteur et classification.
- RAFI conserve son moteur déterministe. Ses décisions ouvrent ce dossier partagé ; son contexte Operations conserve ville/métier/tenant/site/classification.

## Actions gouvernées

Les commandes B1 existantes restent inchangées. L’orchestration hybride utilise le stockage privé d’aperçus et l’audit déjà canoniques, puis appelle uniquement :

- `assign_enterprise_internal_worker_v1` ;
- `retry_enterprise_hybrid_dispatch_v1`.

Admin global **et** membership Enterprise actif de dispatch sont requis. Aucune délégation globale nouvelle. Le preview vérifie la politique, la disponibilité, le métier, le site et la capacité. Confirmation explicite, aperçu de cinq minutes, fingerprint, verrou demande/technicien, clé d’idempotence liée à l’acteur, résultat relu et audit durable. Une réponse réseau incertaine réutilise la même clé. Le mode `internal_only` reste gouverné par le moteur canonique. Les doubles appels et la compétition interne/externe sont testés sur PostgreSQL natif en CI.

## Migration

`20260929131128_control_os_b34_dossier_operations.sql`

SHA256 : `16a9b55af114d35e7891bbb9a071504eeef2254dcaa34c0de9a526c3b28e0342`

11 fonctions additives : quatre helpers privés, cinq lecteurs publics STABLE et deux orchestrateurs explicites. Les sept fonctions publiques requièrent Admin ; EXECUTE uniquement authenticated, avec contrôles métier/tenant supplémentaires pour les commandes. Owner postgres, search_path vide. SECURITY DEFINER est limité à ces projections minimales sur les sources privées déjà autorisées au Control OS et à l’orchestration gardée.

Le linter signale les sept fonctions publiques exécutables par authenticated : exposition RPC intentionnelle, refus anon/non-admin réels testés. Aucun autre nouveau warning du périmètre.

## Preuves avant cutover

- `evidence/staging.json` : dix groupes PASS avec Auth réel et RPC staging, sans création de fixtures ni mutation métier.
- `evidence/local-tests.json` : tests ciblés, non-régression et build.
- CI de la PR : suite complète avec PostgreSQL 17, trois nouvelles courses hybrides et recette Chromium desktop/mobile isolée ; gate obligatoire avant merge.
- Le renderer navigateur de CI utilise exclusivement des fixtures locales explicites. Il ne remplace pas une session Admin Production authentifiée.

Les captures/rapports de données Production restent privés ; aucun identifiant métier, snapshot de ligne ou credential Production n’est versionné dans ce dossier.

## Limites explicites

- Aucun Admin sans membership Enterprise approprié ne reçoit une action tenant. La lecture globale reste minimale.
- Workforce : 50 techniciens maximum dans le preview, pagination des dossiers/relations disponible ; l’état PARTIAL et le nombre observé sont explicites si la fenêtre est dépassée. Aucun total de couverture globale déduit.
- Les audits antérieurs non enregistrés ne sont pas reconstitués artificiellement. Les timestamps affichés gardent leur nature de faits de source.
- Dispatch : états de file et preuves `sent_at` séparés ; aucune promesse de livraison ou d’acceptation à partir d’une proposition.
- Aucun SLA non configuré n’est inventé. Aucun média diagnostic brut ni donnée personnelle Artisan Business exposé.

Prochain bloc du Blueprint après certification : **Bloc 5 — People / Enterprise / Trust / Finance Command**, premier sous-bloc **5.1 People / Enterprise** (registres et contexte minimal, réutilisation des dossiers existants).
