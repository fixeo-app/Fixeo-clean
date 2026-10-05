# W5 — Bio canonique et Home progressive : preuve finale

Candidat **PASS W5 — ARTISAN OS NORTH STAR READY FOR REVIEW**. Publication exclusivement dans la Draft PR #149 ; les six contrôles du SHA publié sont consignés dans sa description. Aucun merge ni build physique.

## Bio : application autorisée distincte

- Projet unique : `fixeo-diagnostic-staging / kqyhusnbybsukbcaoqtu`.
- Fichier : `supabase/migrations/20261005104459_mobile_w5_artisan_bio.sql`.
- SHA-256 : `52e0248623e9db010f157a848fd410dbee9728b0ffa94b820a4b9fd82dbc4913`.
- Historique MCP : **20261005105159**, `mobile_w5_artisan_bio`.
- Une création : `public.w5_update_my_artisan_bio_v1(text)`, SECURITY DEFINER, search_path vide, acteur W5 canonique, ownership id + auth.uid(), 4000 caractères maximum.
- EXECUTE : postgres, authenticated, service_role ; PUBLIC et anon : aucun. Aucune ACL de table/colonne élargie ; authenticated n’a toujours aucun UPDATE direct sur artisans.
- DROP=0 ; DELETE=0 ; TRUNCATE=0 ; UPDATE sans WHERE=0 ; DML métier exécuté à la définition=0. L’UPDATE de description reste exclusivement dans le corps RPC.
- **21 tables : effectifs et empreintes identiques à l’application.** Aucune session n’était ouverte à ce moment.
- V2 source inchangée, déjà enregistrée sous **20261005091927** ; aucune réapplication. Aucun rollback.

Le trigger `artisans_updated_at` et sa fonction sont inchangés. L’addendum autorise son écriture automatique de `updated_at`. Avant/après des tests, les 38 colonnes ont été comparées : seule la description et ce timestamp changent ; les 36 autres colonnes restent identiques. Les six autres profils Artisan sont intégralement inchangés. `update_my_artisan_activity_v1(text[],text[])` conserve son MD5 `043db6c4dfed6bcbbe2650c73807fdd3` et son ACL sans authenticated.

Preuves : `bio-application-proof.json`, `bio-live.json`, `bio-boundaries.json`, `bio-staging-closure.json`. L’advisor ajoute un constat informatif attendu pour la RPC SECURITY DEFINER volontairement exposée à authenticated ; son contrôle canonique est vérifié. Aucune correction d’ACL globale.

## Bio : tests réels et UI

Artisan actif, lecture exacte, limite 4000 caractères, dépassement 4001 → BIO_TOO_LONG, Client → ARTISAN_REQUIRED, JWT invalide → 401, session révoquée → SESSION_REVOKED, PATCH direct → 403, paramètre de cible étrangère → PGRST202. Les appels refusés ne modifient pas le profil. Les tests utilisent uniquement les deux comptes synthétiques W4 autorisés, avec nouveaux password grants ; aucun compte créé, ancien JWT/refresh réutilisé ou credential versionné.

L’éditeur charge la valeur serveur, verrouille les doubles appuis et affiche son succès uniquement après RPC puis relecture exacte. Un défaut de transport **simulé sur la relecture seulement**, après une vraie écriture staging, vérifie l’absence de faux succès. La sauvegarde suivante confirme la valeur. Description finale :

> Atelier W5 — plomberie à Rabat.
> Intervention soignée, explications claires et prix confirmé avant travaux.

Les preuves de loading/succès/non-confirmation sont dans `bio-runtime/`. Le rejeu final et le refus UI après révocation sont dans `progressive-runtime/`.

## Home : chemin critique et orchestration

Le shell W2, identité générique Artisan, présence RAFI, structure, Drawer et action locale vers l’agenda rendent immédiatement. Le nom réel arrive avec le profil ; aucune identité ni activité n’est inventée. Le contrôle **serveur** du rôle canonique et de la session reste obligatoire avant publication de données privées. Les RPC mission/offres vérifient aussi leurs propres guards ; les lectures de tables attendent l’acteur canonique et restent sous ownership/RLS.

Mission, opportunité puis prochaine intervention déterminent la priorité à mesure des réponses disponibles. Chaque source possède loading, ready, unavailable et retry manuel. Profil, trois prochains jobs, trois brouillons et mouvements du jour ne bloquent jamais l’écran. Aucun historique complet, CRM ou feed de notifications n’est lu par la Home.

Les lectures indépendantes démarrent en parallèle et publient séparément. Les appels en cours sont partagés entre Home et RAFI **uniquement dans la même session Auth**, puis oubliés : aucune donnée conservée comme autorité. Le JWT local sert exclusivement de clé de concurrence en mémoire, jamais de preuve de rôle/session active. Les retries SDK automatiques sont désactivés pour les lectures de tables Home ; la reprise relance seulement le module concerné et un contrôle canonique frais. Aucun polling.

**30 secondes = délai ultime par lecture uniquement.** Les actions restent bornées à 20 secondes. L’ancienne attente globale de toutes les données a été supprimée. RAFI ouvre son rail dès confirmation d’autorité et enrichit son contexte progressivement.

## Mesures renderer staging

Temps depuis la navigation interne vers Home, session fraîche déjà établie ; ce ne sont pas des mesures de démarrage à froid Auth ni une promesse de SLA. Réponses métier staging réelles. Délais et 503 ci-dessous injectés dans le transport du renderer, sans altérer le serveur.

| Scénario | Shell | Drawer utilisable | Autorité / RAFI | Action mission | Fin des modules / erreur isolée |
| --- | ---: | ---: | ---: | ---: | ---: |
| Staging normal | 0.030 s | 0.111 s | 6.505 s | 6.507 s | 13.725 s |
| CRM configuré +25 s (non lu) | 0.031 s | 0.098 s | 0.317 s | 6.652 s | 6.663 s |
| Finances +15 s | 0.026 s | 0.086 s | 0.305 s | 7.139 s | 21.968 s |
| Notifications +25 s (non lues) | 0.030 s | 0.090 s | 0.312 s | 8.645 s | 8.648 s |
| Finances 503 | 0.027 s | 0.088 s | 0.317 s | 6.645 s | 6.700 s |

Les scénarios CRM et notifications constatent **zéro requête** vers ces sources ; leur délai ne peut donc entrer dans le chemin Home. Chaque autre endpoint est appelé une seule fois par ouverture. Le 503 finances est reçu une seule fois et la reprise ne touche que finances + autorité. La mission reste disponible pendant le chargement et la panne du module secondaire.

RAFI dédié : saisie disponible en **355 ms** pendant que finances attend encore. Navigation réelle par Drawer Home → RAFI en **180 ms**, avant la fin des lectures Home.

## Rejeu et contrôles

- Profile Bio (valeur persistée exacte), Home, Opportunités, Missions, mission terminée, Evidence privée chargée, Agenda, CRM/fiche client, Devis Studio/aperçu, Finances, Notifications, RAFI voix et photo réels.
- 320 px, texte réellement agrandi à 200 % + fontScale 2, Reduced Motion, Drawer, CTA mission accessible, Bio défilable, clavier natif adapté et dock masqué. Aucune écriture du devis utilisé pour l’aperçu.
- 105 contrats Mobile ; 201 contrats serveur/SQL/Intelligence/Diagnostic/Estimator ; 14 Client C4 ; typecheck et export web Gate A ; Expo Doctor 18/18 ; diff-check.
- `runtime/` conserve le cycle métier W5 initial (acceptation, mission, preuves, CRM, devis et ledger). Le rejeu final réutilise ces fixtures, sans recréer le cycle ni multiplier les lignes.

Le renderer utilise les vrais TSX, Auth et services HTTP staging. Routeur, stockage local et matériel caméra/micro/clavier sont adaptés. Le transfert natif retire Origin/Referer. Cela ne certifie ni navigateur public ni appareil physique. Les timings reflètent la variabilité staging : l’autorité peut elle-même prendre plusieurs secondes, tandis que le shell et la navigation restent utilisables. Aucun guard n’a été retiré pour accélérer l’écran.

## Clôture

`bio-final-revocation.json` et `bio-staging-closure.json` confirment **zéro session synthétique active** et 21 comptes Auth, sans création. Bio, accès, missions, offres, wrapper et Evidence refusent après révocation. La valeur Bio refusée par UI n’est pas persistée. Les password grants ont normalement actualisé les métadonnées de connexion Auth des identités réutilisées ; cet effet de test est distinct de l’application sans DML. Les fixtures sont conservées/documentées ; aucune donnée historique supprimée, aucun réglage Auth global, autre migration, rollback, Production, merge, build physique ou W6.
