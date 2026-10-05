# W6 — Entry, Auth et Trust — certification staging

Date : 5 octobre 2026. Base : `7256eeda9898639debe7c5a4e574a463d6fb2234`.
Branche : `feat/fixeo-mobile-w6-entry-auth-trust`, cible PR : `feat/fixeo-mobile-m4-terrain`.
Seul backend autorisé : `fixeo-diagnostic-staging` (`kqyhusnbybsukbcaoqtu`).

**Verdict actuel : W6 NOT REACHED.** Le code et les tests locaux ne constituent pas une certification de recovery réel. Aucun merge, aucune Production, aucun build physique, aucun W7.

## Acquis réels et nettoyage

| Contrôle staging | Client | Artisan |
| --- | --- | --- |
| Compte existant, email reçu et confirmé | PASS | PASS |
| Rôle `public.users` et profil `public.profiles` canoniques | PASS, client | PASS, artisan |
| Profil métier `public.artisans` | Sans objet | À finaliser depuis une nouvelle session authentifiée |
| Ancienne redirection de confirmation | FAIL, retour localhost | FAIL, retour localhost |
| Session de confirmation exposée | Révoquée | Révoquée |
| Nouveau login / logout réel après correction | Non certifié | Non certifié |
| Recovery email, nouveau mot de passe et reconnexion | DEFERRED — RATE LIMIT EXTERNAL | Non certifié |
| Alternance de comptes réelle | Non certifiée | Non certifiée |

Les deux seules identités sont `contact+w6-client@fixeo.ma` et `contact+w6-artisan@fixeo.ma`. Aucun compte n’a été recréé. Les mots de passe temporaires initiaux n’ont pas été conservés ; de nouvelles sessions réelles nécessitent le recovery autorisé. Aucun ancien JWT n’a été utilisé.

Deux lignes `auth.sessions` correspondant exactement aux deux couples UUID/email W6 ont été supprimées, avec cascade des refresh tokens liés. La relecture après transaction donne **0 session restante** pour les deux comptes. Aucun accès aux valeurs des tokens. Aucun INSERT/UPDATE dans `auth.users`. Les comptes restent uniquement comme fixtures staging de la certification en cours.

## Correction applicative

- Entry RAFI et formulaires Login, choix du rôle, Client, Artisan, demande de recovery et nouveau mot de passe.
- Bootstrap central : session vérifiée, lecture du rôle canonique, puis montage du seul univers autorisé via Expo Router Protected Routes. Les métadonnées de signup ne décident jamais de l’accès.
- Epoch de session : suppression immédiate de l’identité présentée au logout/révocation, rejet des réponses tardives, suppression des intents de notification privés. La permission ou capture terminée après démontage ne déclenche pas une nouvelle action.
- Profil Artisan créé uniquement par `finalize_artisan_signup_v1`, puis relu ; aucune insertion parallèle de users/profiles/artisans. Le profil démarre indisponible, sans badge vérifié.
- PKCE, callback HTTPS explicite `/auth-callback`, refus de localhost/null et des URL Production connues. Le script web retire le fragment/la query avant Expo et refuse les liens contenant des bearer tokens. Aucun token n’est transféré à un autre lien.
- Recovery reconnu par l’événement SDK issu du vérificateur PKCE. Pas par un rôle ou un type fourni par l’URL.
- Sur Web, la session est propre à l’onglet ; seul le vérificateur PKCE est partagé entre onglets du même origin pour ouvrir l’email. Sur natif, stockage SecureStore. Le retour navigateur peut transmettre le code à `fixeo://auth-callback`, jamais un access/refresh token.
- Aucune demande de permission à l’Entry. Microphone/caméra expliqués au moment de leur utilisation, annulation, refus et accès aux réglages. La photo est capturée explicitement ; aucune lecture globale de bibliothèque photo. Localisation foreground/manuelle et opt-in notifications conservés.

## Callback et configuration : audit limité, aucun réglage Auth modifié

Les emails réellement reçus comportaient `redirect_to=http://localhost:3000`. Les inscriptions de test n’avaient pas de `emailRedirectTo`. Le code web historique ne le fixe pas non plus ; son reset utilise son propre origin. Expo déclare le schéma `fixeo`. La Preview précédente ne servait pas un callback Expo approprié.

L’API publique confirme email activé et auto-confirmation désactivée. **Les valeurs exactes Site URL et Redirect URLs ne sont pas exposées par le connecteur disponible.** Le retour localhost est observé ; l’intégralité de l’allowlist n’est pas connue. Il ne faut pas affirmer qu’une URL y est déjà autorisée.

La branche W6 prépare une Preview statique isolée : callback construit depuis le `VERCEL_BRANCH_URL` de cette branche, backend staging forcé, aucun serveur legacy ou identifiant privilégié. La build refuse un environnement Vercel Production.

**Envoi fail-closed :** `EXPO_PUBLIC_AUTH_CALLBACK_APPROVED` doit rester absent/false tant que la destination exacte n’a pas été contrôlée dans l’allowlist Supabase. Une URL non autorisée peut silencieusement revenir au Site URL ; fournir seulement `redirectTo` n’est donc pas suffisant.

Si l’URL exacte manque : STOP avec manifeste, puis GO explicite avant un ajout. Ne pas modifier Site URL, confirmation email, templates, SMTP, quotas ou limites.

## Vérifications exécutées

| Vérification | Résultat | Portée |
| --- | --- | --- |
| TypeScript | PASS | Application mobile entière |
| Contrats mobile | 111/111 PASS | Auth, isolation de présentation, W2/W3 et invariants W4/W5 |
| Contrats serveur | 201/201 PASS | Artisan, Intelligence, Diagnostic, Estimator, mission/evidence |
| Client OS C4 | 14/14 PASS | Non-régression du contrat web Client |
| Expo Doctor 1.20.4 | 18/18 PASS | Dépendances/configuration |
| Gate A | PASS | Typecheck et export web, aucun build physique |
| Runtime public Expo | PASS | Vrai export, aucune requête Supabase ni écran privé avant Auth |
| 320 px, texte web 200 %, clavier | PASS | Pas de débordement horizontal, focus email → mot de passe ; clavier simulé par viewport réduit |
| Contrat session dans Expo | PASS, simulation HTTP | Artisan → logout → Client → logout → Artisan ; rôle canonique malgré metadata contraire ; attente du rôle ; révocation au bootstrap |
| `git diff --check` | PASS | Source |

Les captures `runtime/entry-*`, `login-*`, `role-choice-*`, `signup-*`, `recovery-request-*`, `text-200-*`, `keyboard-*`, `callback-rejected-*` viennent des vrais écrans de l’export Expo. Les fichiers préfixés `simulated-` et `session-contract-runtime.json` sont des tests avec transport HTTP simulé : **ils ne certifient pas les sessions du backend staging**.

Mesure locale navigateur : Entry prête à environ 568 ms (inclut attente et capture, pas un percentile ni une mesure appareil). Dans le contrat HTTP simulé : login Client 292 ms, Artisan 214 ms, logout 445 ms. Les performances réseau staging, la résolution de rôle réelle et la transition post-recovery restent à mesurer avec les nouvelles sessions.

VoiceOver natif, clavier natif, dialogues OS et deep link sur appareil ne sont pas certifiés ; aucun build physique n’a été demandé/exécuté. Les contrôles structurels de labels, focus et cibles 48 px sont présents. Les moteurs métier, le proxy staging partagé et les contrats de mission ne sont pas modifiés.

## Reprise minimale pour la certification réelle

1. Vérifier en lecture seule Site URL/Redirect URLs staging et l’accessibilité anonyme du callback Preview exact.
2. Si nécessaire, présenter le manifeste d’ajout de cette seule URL, attendre GO ; autrement documenter la correspondance existante.
3. Activer l’envoi applicatif après cette preuve, avec les mêmes deux comptes.
4. Après renouvellement du quota, demander uniquement les recovery manquants. Vérifier réception réelle, code PKCE, changement de mot de passe, reconnexion, profil Artisan, retry/idempotence, account switch et révocation réelle. Garder tout secret uniquement en mémoire de la procédure.
5. Révoquer toutes les nouvelles sessions synthétiques, relire le compteur et documenter les fixtures retenues. PASS final seulement après ces preuves.

## Clôture de cette exécution : nouveau hard blocker confirmé

PR Draft : https://github.com/fixeo-app/Fixeo-clean/pull/150
Commit applicatif : `82e79558ca383fd8446687baaa99531de06899b9`.
CI de ce commit : **Mobile Gate A, Mobile Intelligence, Control, Client C4, Supply Engine = SUCCESS**. Vercel Preview = READY.

Callback effectivement déployé :
`https://fixeo-clean-git-feat-fixeo-mo-e1fd0b-elalaouibiz-3410s-projects.vercel.app/auth-callback`

**HARD BLOCKER — callback non accessible anonymement.** Les requêtes anonymes vers Entry et callback aboutissent à `vercel.com` (connexion Vercel), pas à l’application. Le connecteur Vercel confirme `ssoProtection.enabled=true`, `deploymentType=all_except_custom_domains`. Un statut READY ou HTTP 200 après redirection ne constitue pas une preuve d’accessibilité du callback.

Aucun lien de bypass n’a été créé. Aucune protection Vercel n’a été désactivée. Aucune configuration Auth Supabase n’a été modifiée. La clé publique staging a seulement été configurée pour **Preview + branche W6 exacte** ; aucune clé privilégiée.

Dernière relecture DB : pour chaque fixture, 1 user canonique, 1 profil, email confirmé, bon rôle ; **0 session restante**. Profil métier Artisan toujours absent. Ce constat est distinct des parcours simulés.

## Relais distinct — manifeste révisé et exécution Phase 1

Autorisation : DISTINCT RELAY GO, puis CREATION FALLBACK Dashboard / CLI,
5 octobre 2026. Le connecteur `create_git_project` n'a plus été utilisé.

**Verdict : STOP — W6 RELAY PHASE 1 NOT CERTIFIED.**
Le projet et son déploiement Preview public existent ; la matrice HTTP anonyme
sur `vercel.app` est PASS. Le domaine est attaché au seul relais.
**DNS bloqué par l'accès Clouder : connexion non acquise, message
« Email or Password Invalid ». Aucune écriture DNS.** Le sous-domaine reste
NXDOMAIN ; son TLS et sa certification canonique restent à réaliser.

### A–C. Projet, déploiement et source exacts

| Élément | État constaté |
| --- | --- |
| Projet Vercel | `fixeo-w6-auth-relay` |
| Project ID | `prj_EMFXZ4PVcdKhnJxqCCC5LOm4WPzs` |
| Équipe | `team_KoJ7znqtpla8FkrqAznod5PD` / `elalaouibiz-3410s-projects` |
| Déploiement Ready | `dpl_7SFfLZVduxcTd9WngJn6AfaWCXbx` |
| Environnement Vercel | **Preview**, staging uniquement ; durée de build 6 s |
| URL exacte | `https://fixeo-w6-auth-relay-nxjn0mx6p-elalaouibiz-3410s-projects.vercel.app` |
| Alias de branche | `fixeo-w6-auth-relay-git-feat-7093f2-elalaouibiz-3410s-projects.vercel.app` |
| Source | `fixeo-app/Fixeo-clean`, `feat/fixeo-mobile-w6-entry-auth-trust` |
| SHA déployé | `80600c8a96b8353cd61528d5d274684c23ea519d` |
| Root Directory | `staging/w6-auth-relay` ; inclusion des fichiers extérieurs **désactivée** |
| Build | Framework Other, Node 24, `node build.mjs`, install command vide |
| Variables | Zéro variable de projet et zéro variable partagée rattachée, vérifiés dans le Dashboard |
| Protection du relais | Vercel Authentication désactivée **sur ce nouveau projet uniquement**, conformément au GO public |
| Vercel Toolbar | Off en Preview et Production ; Analytics et Speed Insights non activés |

Le Dashboard a créé un projet vide avec le nom automatique `project-4i1cx`,
immédiatement renommé avant tout déploiement. Son alias automatique
`project-4i1cx.vercel.app` indique No Deployment ; aucun domaine métier existant
n'a été déplacé.

La première création, demandée via « Create Preview Deployment », a été
étiquetée Production par Vercel puis refusée **avant build** :
`dpl_8NNaRufYgjZX4UqfGhvJPEzycau4`, SHA `f31306e`,
propriété `directoryListing` non admise dans `vercel.json`.
Le commit `80600c8` retire seulement `directoryListing` et `public` du fichier
de configuration du relais. Le builder, les routes et le script Auth sont
inchangés. Le déploiement suivant est bien **Preview / Ready**.
Aucun artefact Production n'a été construit ou promu.

Fichiers exacts : `package.json`, `vercel.json`, `build.mjs`, `.gitignore`,
`src/callback.html`, `src/relay.js`, `test/relay.test.mjs`,
`test/routes.test.mjs`, `README.md`.
Zéro dépendance npm, fonction serveur, Expo, Client OS, Artisan OS, RAFI, SDK ou
clé Supabase, accès DB, API métier, donnée métier, stockage ou logger applicatif.
Sortie : `.vercel/output/config.json` et un document statique `callback.html`.
Les guards refusent Vercel Production, le project ID fixeo-clean et toute
branche différente de W6. Aucun fichier fonctionnel W6 existant n'a été changé.

### D–E. Domaine et DNS exacts

Le domaine `w6-auth-staging.fixeo.ma` est attaché **uniquement** au projet
`prj_EMFXZ4PVcdKhnJxqCCC5LOm4WPzs`, environnement Preview,
branche `feat/fixeo-mobile-w6-entry-auth-trust`.
Cette opération a été effectuée **après** le PASS HTTP anonyme de `vercel.app`.

Valeurs lues dans le Dashboard Vercel après attachement, consignées avant écriture :

| TYPE | NAME | VALUE |
| --- | --- | --- |
| CNAME | `w6-auth-staging` | `06244978d8b6e6ea.vercel-dns-016.com.` |

FQDN : `w6-auth-staging.fixeo.ma`. DNS externe, serveurs
`ns1.nameservers.ma` à `ns4.nameservers.ma`.
**Avant : NXDOMAIN. Après : NXDOMAIN. Écritures : 0.**
Le TTL n'a pas été fixé puisqu'aucun formulaire DNS n'a été soumis.
Aucun autre record, apex, www, MX, TXT ou serveur de noms n'a été modifié.

TLS `vercel.app` : HTTPS valide, validation de certificat active, HSTS présent.
TLS `w6-auth-staging.fixeo.ma` : **NON CERTIFIÉ**, DNS non provisionné.
Statut Vercel du domaine : Invalid Configuration.

### F–H. Routes et sécurité publiques

Requêtes HTTP réelles, sans cookies, Authorization, lien de partage ou bypass,
sur le déploiement exact ci-dessus :

| Route GET | Statut |
| --- | --- |
| `/auth-callback` | **200**, marqueur `X-Fixeo-Relay: w6-phase-1` |
| `/` | **404** |
| `/entry` | **404** |
| `/sign-in` | **404** |
| `/artisan` | **404** |
| `/client` | **404** |
| `/random-test` | **404** |
| `/api/test` | **404** |
| `/callback.html` | **404** |

Aucun SPA fallback. Le fichier interne peut être renvoyé avec statut 404 sur son
nom direct ; son script refuse ce path et ne propose aucun transfert.
Les méthodes autres que GET sur le callback sont prévues en 405 / Allow GET
et testées par contrat ; leur contrôle distant reste à compléter avec le domaine.

Headers effectivement reçus : `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.
CSP à empreintes, `connect-src 'none'`, `form-action 'none'`,
`base-uri 'none'`, `frame-ancestors 'none'`.
Le HTML déployé est identique octet pour octet à l'artefact testé :
SHA-256 `1212b8fb6793836db29e75dbd09d135332e571a14f2997f88d4a8be4365ab8e2`.

| Cas | Preuve actuelle |
| --- | --- |
| Code absent ou malformé | Contrats PASS ; navigateur réel vercel.app : URL nettoyée, refus neutre, aucun bouton |
| Quatre bearer tokens interdits | Contrats query/hash, noms encodés, casse et valeurs vides PASS ; cas réels sur vercel.app refusés |
| Redirect arbitraire / paramètre inconnu | Contrats PASS ; navigateur réel : refus sans transfert |
| Duplications / mélange code-erreur | Contrats PASS |
| Nettoyage avant rendu, hashchange/popstate | Contrats et Chromium local PASS |
| Erreurs filtrées | Mapping local PASS vers expired/invalid/denied/unknown ; aucune description brute |
| Code bien formé / erreur connue sur vercel.app | Refus attendu : origin non canonique, aucun transfert |
| Code / erreurs sur le domaine canonique | **À CERTIFIER après DNS/TLS** |
| Échange PKCE réel / session / deep link physique | Non exécutés ; hors Phase 1 / aucun build physique |

**17/17 contrats PASS**, **12/12 cas Chromium locaux PASS**,
**10/10 contrôles navigateur sur le vrai déploiement vercel.app PASS**
pour nettoyage et refus d'origin. Les tests locaux utilisent une réponse HTTP
interceptée sous l'origin canonique ; ils ne remplacent pas sa certification publique.
Les tests distants n'ont utilisé que des marqueurs factices, aucun token réel.

Contrat : le premier script retire query/hash avant parsing et rendu. Un échec
de nettoyage bloque tout rendu/transfert. La présence de access_token,
refresh_token, provider_token ou provider_refresh_token dans query ou fragment
interdit tout transfert, même d'une erreur. Aucun redirect fourni par l'utilisateur
n'est accepté. Destination unique : `fixeo://auth-callback`.
Seul un code bien formé ou une erreur interne filtrée peut être transmis,
après action sur « Ouvrir FIXEO », au maximum une fois.

Le relais ne valide pas l'authenticité du code et ne crée aucune session.
L'application d'origine conserve son vérificateur PKCE, effectue l'échange puis
la résolution canonique du rôle avant tout accès Client OS / Artisan OS.
Un flux initié en Web Preview n'est pas interchangeable avec un flux natif.

### I–J. fixeo-clean inchangé

Relecture après création, déploiement et attachement du domaine :
`prj_U909VA6lAGunWRVCoSQ37uEOcz5c`,
`ssoProtection.enabled=true`,
`deploymentType=all_except_custom_domains`.
Même `updatedAt=1791206683553`, mêmes protections et domaines qu'avant.
Le domaine relais n'apparaît pas dans ses domaines.
Aucun réglage de root directory, protection ou domaine de fixeo-clean n'a été écrit.

Nouvelle vérification HTTP anonyme de la Preview W6 à 15:10 UTC :
`/entry` et `/auth-callback` → 302 vers Vercel SSO → 307 vers `/login`.
Les nouveaux commits W6 peuvent déclencher la Preview Git habituelle ;
cela ne déploie pas le relais dans fixeo-clean et ne change pas ses réglages.

### K. Rollback exact et reprise

Rollback Phase 1, non exécuté :
1. Détacher seulement `w6-auth-staging.fixeo.ma` du projet
   `prj_EMFXZ4PVcdKhnJxqCCC5LOm4WPzs`.
2. Supprimer seulement le CNAME `w6-auth-staging` pointant vers
   `06244978d8b6e6ea.vercel-dns-016.com.` **s'il a été créé**.
   À ce checkpoint, aucun DNS à supprimer.
3. Désactiver/supprimer uniquement `fixeo-w6-auth-relay` et ses déploiements.
4. Préserver fixeo-clean, ses domaines et sa protection.
5. Aucune action Supabase à annuler ; aucun retour localhost.

Reprise Phase 1 : obtenir l'accès au gestionnaire DNS, ajouter seulement
l'enregistrement ci-dessus après relecture de son absence, attendre TLS,
rejouer la matrice complète sur le domaine canonique puis revalider fixeo-clean.
Aucun nouveau GO n'est nécessaire pour ces actions Phase 1 déjà autorisées,
mais le blocage de connexion doit être résolu.

### L. PR, preuves et frontière Supabase

PR #150 reste **Draft**, ouverte, non mergée.
Preuves dans `relay-phase1/` :
- `infrastructure.json` : IDs, isolation, réglages et blocage courant ;
- `vercel-app-public.json` : statuts et headers des requêtes anonymes ;
- `fallback-external-checks.json` : NXDOMAIN et empreinte du HTML distant ;
- `live-vercel-browser.json` : nettoyage/refus sur le déploiement réel ;
- `protected-preview.json` : redirections anonymes W6, query strings exclues ;
- `dashboard-preview-ready.jpg`, `dashboard-relay-public.jpg`,
  `dashboard-dns-required.jpg` : captures du Dashboard ;
- `local-browser.json` et captures locales : preuves locales antérieures.

Historique : le connecteur de création avait échoué avant ce fallback
(validation de réponse). Le nouveau blocage est **l'accès DNS**, distinct de
ce blocage d'outil résolu et du quota email.

Aucun Analytics, pixel, stockage ou log applicatif de query string.
L'absence de logger applicatif ne certifie pas la politique de conservation
interne de Vercel ; aucune garantie absolue de non-journalisation d'infrastructure
n'est revendiquée.

**Zéro appel ou mutation Supabase, zéro email Auth envoyé pendant Phase 1.**
URL candidate seulement :
`https://w6-auth-staging.fixeo.ma/auth-callback`, sans wildcard.
Site URL, confirmation, templates, SMTP, quotas et rate limits inchangés.
`EXPO_PUBLIC_AUTH_CALLBACK_APPROVED` reste non activé ; W6 reste fail-closed.
Recovery : **DEFERRED — 429 over_email_send_rate_limit**, séparé du DNS.

**Production impact = NONE.** MAIN inchangé. Aucun build physique, merge ou W7.
**STOP — W6 RELAY PHASE 1 NOT CERTIFIED.**
