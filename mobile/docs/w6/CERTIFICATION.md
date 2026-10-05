# W6 — Entry, Auth et Trust — certification staging

Date : 5 octobre 2026. Base : `7256eeda9898639debe7c5a4e574a463d6fb2234`.
Branche : `feat/fixeo-mobile-w6-entry-auth-trust`, cible PR : `feat/fixeo-mobile-m4-terrain`.
Seul backend autorisé : `fixeo-diagnostic-staging` (`kqyhusnbybsukbcaoqtu`).

**Verdict actuel : W6 NOT REACHED.** Le code et les tests locaux ne constituent pas une certification de recovery réel. Aucun merge, aucune Production, aucun build physique, aucun W7.

## Phase 2B — activation canonique autorisée, candidat avant Auth réel

GO utilisateur du 5 octobre 2026, checkpoint `bd3863d1d8cbe7a6fe99cfc15e6196d650a5c5b2`.
La clôture Phase 2A ci-dessous reste acquise **WITH MANUAL DASHBOARD EVIDENCE** :
aucune prétention de relecture indépendante du Dashboard Supabase.
Le commit documentaire `d1bc1dd9960dab0ac6175f2530c010715b2a6233`, auparavant
sans déplacement de branche pour respecter le STOP builds, est intégré avec ce candidat.

- `assertCallbackUrl()` accepte seulement la chaîne exacte
  `https://w6-auth-staging.fixeo.ma/auth-callback`. Aucune normalisation permissive.
- L'export fixe cette URL et `EXPO_PUBLIC_AUTH_CALLBACK_APPROVED=true` seulement
  après le double garde `VERCEL_ENV=preview` et branche W6 exacte.
  Aucune variable Vercel globale ni configuration Production modifiée.
- Les anciens paragraphes de cet historique décrivant `VERCEL_BRANCH_URL` et le
  flag absent décrivent les étapes antérieures, remplacées par ce GO Phase 2B.
- Configuration Supabase, DNS, projet relais, domaine et certificat gelés.
  `fixeo-clean` conserve `ssoProtection.enabled=true` et
  `deploymentType=all_except_custom_domains` (relecture API avant publication).

Préflight local : TypeScript PASS ; contrats mobile **113/113** ; serveur
**201/201** ; Client C4 **14/14** ; Expo Doctor 1.20.4 **18/18** ; Gate A PASS ;
`git diff --check` PASS. Le premier lancement serveur manquait des dépendances
de test locales ; réinstallation par `npm ci` depuis le lockfile existant,
puis relance complète PASS, sans changement de dépendance versionnée.

Les nouveaux contrats prouvent l'allowlist exacte, les rejets Production/www,
autres domaines/sous-domaines/paths, localhost/IP privées, credentials, HTTP,
query/hash, ancienne Preview et les refus signup/recovery avant réseau lorsque
le flag n'est pas approuvé. L'export refuse Production, une autre branche et
un environnement absent. Les résultats contractuels ne valent pas Auth réel.

À ce checkpoint : **0 recovery Phase 2B**, aucun signup, aucune nouvelle session,
aucun JWT réutilisé. CI, artefact Preview, puis Client réel (une seule tentative)
restent à certifier. Artisan ne sera demandé qu'après PASS Client.
**NATIVE PHYSICAL DEEP LINK = DEFERRED TO PHYSICAL BUILD CERTIFICATION.**

### Correction complémentaire du routage W6, avant tout email

Le candidat `4009152bbf5185a47cd380aab59b329c4bca73ff` a obtenu les cinq
workflows GitHub SUCCESS et un déploiement Vercel READY
`dpl_8KNyu6PHqzi6BPH9THZjhNDSnwjq`, mais `/entry` répondait 404 dans la
session Vercel autorisée. Le Dashboard Resources montre les 25 fichiers sous
`/mobile/`, tandis que la route fallback W6 ciblait `/index.html` inexistant.
READY n'a donc pas été présenté comme une certification fonctionnelle.

Correction uniquement dans la branche conditionnelle W6 de `vercel.ts` : les
chemins Expo `/_expo/*`, `/assets/*`, `/auth-return.js` sont résolus vers leurs
fichiers `/mobile/*`, et le fallback vise `/mobile/index.html`. Aucun changement
Root Directory, protection, domaine ou réglage global Vercel. Un contrat
supplémentaire vérifie les cibles et l'égalité stricte avec la configuration
legacy sur MAIN et une branche tierce. Contrats mobile : **114/114 PASS**.
L'artefact corrigé et sa CI doivent encore être relus avant le premier recovery.

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

Ces étapes futures restent interdites pendant la Phase 1 et nécessitent le nouveau GO distinct.

1. Vérifier en lecture seule Site URL/Redirect URLs staging et l’accessibilité anonyme du callback Preview exact.
2. Si nécessaire, présenter le manifeste d’ajout de cette seule URL, attendre GO ; autrement documenter la correspondance existante.
3. Activer l’envoi applicatif après cette preuve, avec les mêmes deux comptes.
4. Après renouvellement du quota, demander uniquement les recovery manquants. Vérifier réception réelle, code PKCE, changement de mot de passe, reconnexion, profil Artisan, retry/idempotence, account switch et révocation réelle. Garder tout secret uniquement en mémoire de la procédure.
5. Révoquer toutes les nouvelles sessions synthétiques, relire le compteur et documenter les fixtures retenues. PASS final seulement après ces preuves.

## Historique — Preview W6 protégée, avant le relais distinct

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

**PASS W6 RELAY PHASE 1 — READY FOR SUPABASE ALLOWLIST REVIEW.**
Certification du 5 octobre 2026, 15:50–16:02 UTC : domaine canonique public,
DNS propagé sur Google et Cloudflare, HTTPS opérationnel, certificat Vercel
provisionné, routes et matrice sécurité PASS. Le blocage DNS précédent est résolu
par l'ajout manuel de l'utilisateur dans Clouder. Aucune écriture DNS par l'agent.
La Phase 1 est terminée ; aucun parcours Auth réel n'est certifié par ce verdict.
**STOP après Phase 1. Nouveau GO distinct requis avant toute action Supabase.**

### A–C. Projet, déploiement et source exacts

| Élément | État constaté |
| --- | --- |
| Projet Vercel | `fixeo-w6-auth-relay` |
| Project ID | `prj_EMFXZ4PVcdKhnJxqCCC5LOm4WPzs` |
| Équipe | `team_KoJ7znqtpla8FkrqAznod5PD` / `elalaouibiz-3410s-projects` |
| Déploiement canonique certifié Ready | `dpl_GuPRN2Tq79Zxf7Wo1rQtHdP8LumZ` |
| Environnement Vercel | **Preview**, staging uniquement ; durée de build 6 s |
| URL exacte | `https://fixeo-w6-auth-relay-c0blb6idu-elalaouibiz-3410s-projects.vercel.app` |
| Alias de branche | `fixeo-w6-auth-relay-git-feat-7093f2-elalaouibiz-3410s-projects.vercel.app` |
| Source | `fixeo-app/Fixeo-clean`, `feat/fixeo-mobile-w6-entry-auth-trust` |
| SHA déployé lors de la certification | `d006e9bffd604e3aef7c9d25856bd193c7ebb482` ; source du relais inchangée depuis `80600c8a96b8353cd61528d5d274684c23ea519d` |
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
Le premier Preview certifié `dpl_7SFfLZVduxcTd9WngJn6AfaWCXbx`
(`fixeo-w6-auth-relay-nxjn0mx6p-elalaouibiz-3410s-projects.vercel.app`)
a été suivi du Preview Git documentaire `dpl_GuPRN2Tq79Zxf7Wo1rQtHdP8LumZ`.
Le Dashboard confirme que ce dernier porte le domaine canonique et la branche W6.
Une publication documentaire ultérieure peut générer un nouveau Preview identique ;
les IDs ci-dessus identifient les déploiements effectivement observés à certification.

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

Avant : **NXDOMAIN**, aucun CNAME. Après ajout manuel annoncé par l'utilisateur :

| TYPE | NAME | FQDN | VALUE | TTL observé |
| --- | --- | --- | --- | --- |
| CNAME | `w6-auth-staging` | `w6-auth-staging.fixeo.ma` | `cname.vercel-dns.com` | 14400 s |

Google DNS et Cloudflare DNS renvoient tous deux ce CNAME, statut DNS 0.
Le premier contrôle avait un SERVFAIL transitoire sur une requête CNAME ;
la relecture réussit sur les deux résolveurs. Aucune modification d'autre record,
apex, www, MX, TXT ou serveur de noms par l'agent ; l'utilisateur confirme n'avoir
ajouté que ce CNAME.

Vercel affiche **DNS Change Recommended**, pas Invalid Configuration.
Il recommande `06244978d8b6e6ea.vercel-dns-016.com.` et indique explicitement
que la cible historique `cname.vercel-dns.com` continue de fonctionner.
La recommandation n'a entraîné aucune nouvelle écriture DNS.

URL canonique certifiée : **https://w6-auth-staging.fixeo.ma/auth-callback**.
HTTPS : PASS, sans exception de certificat ni écran intermédiaire navigateur.
Certificat Vercel `cert_DCGrkPkxezoMXGPRywyufWHZ`, nom exact
`w6-auth-staging.fixeo.ma`, renouvellement automatique,
expiration **2027-01-03 14:47:24 UTC** (lecture API Vercel).
HSTS reçu : `max-age=63072000`.
Le certificat vu par Python appartient au proxy TLS de l'environnement : il
n'est pas présenté comme le certificat d'origine. La preuve d'origine repose
sur la lecture Vercel, complétée par HTTPS et le navigateur sans interstitial.

### F–H. Routes et sécurité publiques

Requêtes HTTP réelles, sans cookies, Authorization, lien de partage ou bypass,
sur le **domaine canonique**, sans redirection vers une authentification :

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
| `/auth-callback/` | **404** |
| `/AUTH-CALLBACK` | **404** |

Aucun SPA fallback. Le fichier interne peut être renvoyé avec statut 404 sur son
nom direct ; son script refuse ce path et ne propose aucun transfert.
HEAD, POST et OPTIONS `/auth-callback` : **405**, `Allow: GET`, vérifiés à distance.
Le catch-all 404 est confirmé par contrat de build ; aucune règle filesystem
ou SPA fallback ne sert d'autre écran.

Headers effectivement reçus : `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.
CSP à empreintes, `connect-src 'none'`, `form-action 'none'`,
`base-uri 'none'`, `frame-ancestors 'none'`.
Le HTML déployé est identique octet pour octet à l'artefact testé :
SHA-256 `1212b8fb6793836db29e75dbd09d135332e571a14f2997f88d4a8be4365ab8e2`.

| Cas sur domaine canonique | Résultat |
| --- | --- |
| Code bien formé factice | URL nettoyée ; bouton Ouvrir FIXEO, code invisible |
| Code absent / malformé | Refus neutre, aucun bouton ni transfert |
| access_token / refresh_token / provider_token / provider_refresh_token | Refus en query et fragment, URL nettoyée, aucun bouton |
| redirect / redirectTo / next / returnUrl / callbackUrl | Refus sans transfert |
| Query inattendue / type inattendu | Refus sans transfert |
| Code dupliqué / mélange code-erreur | Refus sans transfert |
| Erreurs expired / invalid / denied / unknown | Écran neutre, URL nettoyée, bouton ; description brute invisible |
| Mapping exact et destination fixe du deep link | Contrats PASS : uniquement code ou erreur interne, un seul transfert sur action |
| Nettoyage avant rendu, hashchange/popstate | Contrats PASS ; tests locaux Chromium antérieurs PASS |
| Échange PKCE réel / session / deep link physique | Non exécutés ; hors Phase 1 / aucun build physique |

**17/17 contrats rejoués PASS**, **24/24 cas navigateur réel sur domaine
canonique PASS**, **14/14 contrôles HTTP anonymes PASS** (11 GET + 3 méthodes).
Les 12 cas Chromium locaux et 10 contrôles vercel.app antérieurs restent des
preuves complémentaires. Les tests n'utilisent que des marqueurs synthétiques,
aucun code Auth ou bearer token réel.
Le mapping exact des erreurs et la destination deep link sont prouvés par les
contrats du script ; les tests du navigateur distant vérifient nettoyage,
absence d'affichage sensible et présence/absence du bouton, sans lancer d'app.
Le HTML canonique téléchargé est identique à l'artefact local testé.

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

Nouvelle vérification HTTP anonyme de la Preview W6 à **16:00 UTC** :
`/entry` et `/auth-callback` → 302 vers Vercel SSO → 307 vers `/login`.
Les nouveaux commits W6 peuvent déclencher la Preview Git habituelle ;
cela ne déploie pas le relais dans fixeo-clean et ne change pas ses réglages.

### K. Rollback exact

Rollback Phase 1, non exécuté :

1. Détacher seulement `w6-auth-staging.fixeo.ma` du projet
   `prj_EMFXZ4PVcdKhnJxqCCC5LOm4WPzs`.
2. Supprimer seulement le CNAME créé manuellement dans Clouder :
   NAME `w6-auth-staging`, VALUE `cname.vercel-dns.com`.
3. Désactiver/supprimer uniquement `fixeo-w6-auth-relay` et ses déploiements.
4. Préserver fixeo-clean, ses domaines, root directory et protection.
5. Aucune action Supabase à annuler ; aucun retour localhost.

### L. PR, preuves et frontière Supabase

PR #150 reste **Draft**, ouverte, non mergée.
Preuves dans `relay-phase1/` :

- `infrastructure.json` : IDs, isolation, DNS réel et verdict Phase 1 ;
- `canonical-dns-tls.json` : premières observations et propagation finale ;
- `platform-final.json` : certificat Vercel et configuration fixeo-clean relue ;
- `canonical-public-http.json` : 14 statuts/headers anonymes, empreinte du HTML ;
- `canonical-browser.json` : 24 cas sur le vrai domaine canonique ;
- `canonical-valid.jpg`, `canonical-token-refused.jpg` : rendu réel sans secret ;
- `dashboard-dns-ready.jpg` : CNAME historique accepté, recommandation distincte ;
- `protected-preview.json` : redirections anonymes W6, query strings exclues ;
- `vercel-app-public.json`, `fallback-external-checks.json`,
  `live-vercel-browser.json`, anciennes captures Dashboard et preuves locales :
  historique conservé, y compris le NXDOMAIN antérieur résolu.

Aucun Analytics, pixel, stockage ou log applicatif de query string.
L'absence de logger applicatif ne certifie pas la politique de conservation
interne de Vercel ; aucune garantie absolue de non-journalisation d'infrastructure
n'est revendiquée.

**Zéro appel ou mutation Supabase, zéro email Auth envoyé pendant Phase 1.**
URL candidate seulement :
`https://w6-auth-staging.fixeo.ma/auth-callback`, sans wildcard.
Site URL, confirmation, templates, SMTP, quotas et rate limits inchangés.
`EXPO_PUBLIC_AUTH_CALLBACK_APPROVED` reste non activé ; W6 reste fail-closed.
Recovery : **DEFERRED — 429 over_email_send_rate_limit**, séparé de la certification du relais. Aucun nouvel essai Phase 1.

**Production impact = NONE.** MAIN inchangé. Aucun build physique, merge ou W7.
**PASS W6 RELAY PHASE 1 — READY FOR SUPABASE ALLOWLIST REVIEW.**

**STOP. Aucune action Supabase ni poursuite Auth avant nouveau GO distinct.**

## Clôture Phase 2A — preuve Dashboard manuelle acceptée

**PASS W6 PHASE 2A — SUPABASE CALLBACK ALLOWLIST CERTIFIED WITH MANUAL DASHBOARD EVIDENCE**

Décision explicite de l'utilisateur du 5 octobre 2026 à 16:47:50 UTC :
la preuve Dashboard avant/après vérifiée manuellement est acceptée pour clôturer
Phase 2A. La limitation de session du navigateur contrôlé n'est pas classée
comme une anomalie de configuration. Aucun nouvel accès/essai de connexion
Supabase n'a été effectué pour cette clôture.

### Provenance et état certifié

**USER-OBSERVED / MANUAL EVIDENCE** : captures Dashboard vérifiées par
l'utilisateur ; elles n'ont pas été relues par l'agent. Projet exact :
`fixeo-diagnostic-staging` / `kqyhusnbybsukbcaoqtu`.

| Réglage | Avant manuel | Après manuel | Provenance |
| --- | --- | --- | --- |
| Site URL | `http://localhost:3000` | `http://localhost:3000` | USER-OBSERVED / MANUAL EVIDENCE |
| Nombre de Redirect URLs | 0 | 1 | USER-OBSERVED / MANUAL EVIDENCE |
| Liste complète | Vide | `https://w6-auth-staging.fixeo.ma/auth-callback` | USER-OBSERVED / MANUAL EVIDENCE |
| Wildcard / autre URL | Aucun ajout | Aucun | USER-OBSERVED / MANUAL EVIDENCE |
| Autres réglages Auth | État initial | Inchangés selon la preuve utilisateur | USER-OBSERVED / MANUAL EVIDENCE |

L'URL exacte est donc certifiée présente **une seule fois sur la base de la
preuve manuelle acceptée**. Site URL reste localhost ; aucun remplacement
n'entre dans cette phase. Aucune lecture indépendante du Dashboard ni comparaison
automatique de l'intégralité des réglages Auth n'est revendiquée.

### Revalidations automatiques en lecture seule

Contrôles du 5 octobre 2026 à **16:50:45 UTC**, sans cookies, Authorization,
bypass, paramètres Auth ou émission d'email :

| Contrôle | Résultat observé par l'agent |
| --- | --- |
| HTTPS `https://w6-auth-staging.fixeo.ma/auth-callback` | **200**, sans redirection, validation TLS active |
| `/`, `/entry`, `/sign-in`, `/artisan`, `/client` | **404** chacun |
| `/random-test`, `/api/test`, `/callback.html`, `/auth-callback/`, `/AUTH-CALLBACK` | **404** chacun |
| Confidentialité | no-store / no-referrer / nosniff présents |
| Artefact relais | Empreinte identique à Phase 1 |
| Preview W6 `/entry` et `/auth-callback` | 302 Vercel SSO → 307 Vercel Login |
| fixeo-clean | SSO enabled=true / all_except_custom_domains, mêmes domaines et updatedAt |
| DNS Google + Cloudflare | CNAME `w6-auth-staging` → `cname.vercel-dns.com`, TTL 14400 s |

Empreinte SHA-256 du relais :
`1212b8fb6793836db29e75dbd09d135332e571a14f2997f88d4a8be4365ab8e2`.
fixeo-clean `updatedAt=1791206683553`, inchangé depuis Phase 1.

### Vérification des changements et publication sans build

Comparaison Git de `9f517aae2004ee7b6715742d1a5bca628b8941bb` à
`bd3863d1d8cbe7a6fe99cfc15e6196d650a5c5b2` : deux commits,
uniquement `mobile/docs/w6/`, **zéro changement fonctionnel**.
Le code applicatif et le relais n'ont pas été modifiés pendant Phase 2A.

Le journal Vercel filtré sur les deux projets depuis 16:13 UTC contient
quatre Previews Git et quatre affectations automatiques d'alias, associés aux
commits documentaires `d2591fe` et `bd3863d`. Aucun événement de modification
des réglages projet n'est renvoyé dans cet intervalle. Ces déploiements
automatiques sont explicitement documentés : « aucune activité Vercel » serait
inexact. Les protections, domaines et le contenu fonctionnel vérifiés sont
inchangés ; aucun réglage Vercel n'a été écrit par l'agent en Phase 2A.

Pour respecter **aucun build** dans cette clôture, le document et les preuves
sont publiés sous forme de commit documentaire référencé dans la description
PR #150, **sans déplacement de la branche**. Son HEAD reste `bd3863d`.
Aucune commande build, push de branche, déploiement, modification DNS/Vercel
ou requête Supabase n'est exécutée dans cette clôture.
L'absence de modification Auth supplémentaire repose sur la preuve manuelle
acceptée et le journal des opérations de l'agent, pas sur un audit global
indépendant des actions de tous les administrateurs.

Preuves de clôture : `phase2a/manual-dashboard-acceptance.json`,
`phase2a/closure-public-checks.json`, `phase2a/closure-change-audit.json`.
Les tentatives bloquées conservées ci-dessous sont **historiques** ; leurs
verdicts sont remplacés par cette clôture sous preuve manuelle acceptée.

### Rollback et frontière de Phase 2B

Rollback non exécuté : retirer seulement
`https://w6-auth-staging.fixeo.ma/auth-callback` de l'allowlist staging.
Conserver Site URL et tout autre réglage.

`EXPO_PUBLIC_AUTH_CALLBACK_APPROVED` n'est pas activé. Aucun signup, recovery,
email Auth, nouvelle session synthétique, JWT ou vrai code PKCE. Le recovery
reste **DEFERRED — 429 over_email_send_rate_limit**, sans nouvel essai.
PR #150 reste Draft, ouverte et non mergée. **Production impact = NONE.**
Aucun build physique, merge ou W7. Le PASS porte sur l'allowlist avec la provenance
ci-dessus ; les parcours Auth réels ne sont pas certifiés.

**STOP — Phase 2B nécessite un nouveau GO distinct.**

## Historique Phase 2A — préflight bloqué avant acceptation manuelle

GO explicite limité du 5 octobre 2026. Checkpoint d'entrée :
`9f517aae2004ee7b6715742d1a5bca628b8941bb`, PR #150 Draft, ouverte, non mergée.

**STOP — W6 PHASE 2A NOT CERTIFIED.**

Le connecteur confirme le projet exact `fixeo-diagnostic-staging`
(`kqyhusnbybsukbcaoqtu`), ACTIVE_HEALTHY. Il n'expose pas les réglages Auth.
L'ouverture du Dashboard Authentication > URL Configuration redirige vers
la connexion Supabase. Après le parcours de connexion sécurisé et la reprise
manuelle, une nouvelle navigation vers la page staging retourne encore à
Sign in (constat final 16:34 UTC). Aucun écran de configuration authentifié
n'a été observé ; aucune erreur de mot de passe ou restriction du compte
n'est inférée de ce seul constat.

| Champ | Avant | Après | Écriture par l'agent |
| --- | --- | --- | --- |
| Site URL | Non lisible | Non certifiée | Aucune |
| Redirect URLs complètes | Non lisibles | Non certifiées | Aucune |
| Présence/nombre de l'URL exacte | Inconnu | Inconnu | Aucune |
| Autres réglages Auth | Pas d'audit de leurs valeurs | Pas de comparaison globale possible | Aucune |

Les valeurs inconnues ne signifient ni une liste vide ni une absence du callback.
Aucune mutation n'a été tentée : le préflight exact avant écriture est obligatoire.
L'ancien localhost observé dans les emails n'est pas présenté comme une lecture
actuelle de Site URL. Aucun ajout, doublon, suppression ou remplacement d'URL.

Revalidation publique du relais à 16:15 UTC :
`https://w6-auth-staging.fixeo.ma/auth-callback` → **200**, aucune redirection,
aucun cookie/Authorization/code PKCE. Marqueur `w6-phase-1`,
headers no-store / no-referrer / nosniff, SHA-256 identique au relais Phase 1 :
`1212b8fb6793836db29e75dbd09d135332e571a14f2997f88d4a8be4365ab8e2`.
Aucune modification DNS ou Vercel ; la certification Phase 1 reste acquise.

Preuves : `phase2a/configuration-preflight.json`,
`phase2a/dashboard-login-blocked.jpg`, `phase2a/relay-public.json`.

Reprise autorisée une fois l'accès Dashboard disponible : relever Site URL
et l'intégralité de l'allowlist, ajouter seulement
`https://w6-auth-staging.fixeo.ma/auth-callback` si absent, puis relire et comparer.
Pas de wildcard ; conserver toutes les URLs, y compris localhost.
Le GO Phase 2A existant reste limité à cette opération.

Rollback : aucune écriture à annuler à ce checkpoint. Si l'ajout est effectué
lors de la reprise, retirer uniquement cette URL exacte de l'allowlist staging.

Aucun changement de confirmation email, Secure email change, SMTP, templates,
providers, CAPTCHA, JWT, sessions, rate limits, OTP, politique de mot de passe
ou Auth hooks. Cette affirmation porte sur les opérations de l'agent, pas sur
une comparaison de valeurs qui n'a pas été possible.
`EXPO_PUBLIC_AUTH_CALLBACK_APPROVED` reste non activé par cette exécution.
Aucun signup, recovery, email Auth, nouvelle session synthétique, JWT ou vrai
code PKCE utilisé. Recovery toujours **DEFERRED — 429 over_email_send_rate_limit**,
sans nouvel essai ni modification des limites.

Documentation seulement. PR #150 reste Draft, ouverte, non mergée.
**Production impact = NONE.** MAIN inchangé ; aucun build physique, merge ou W7.
**STOP — W6 PHASE 2A NOT CERTIFIED : accès Dashboard non acquis.**

### Reprise après ajout manuel — 5 octobre 2026, 16:41 UTC

L'utilisateur confirme avoir effectué lui-même l'ajout autorisé sur
`fixeo-diagnostic-staging` / `kqyhusnbybsukbcaoqtu`. Cette reprise est
**lecture et documentation uniquement**, sans autorisation d'écriture Supabase.

| Configuration | Avant déclaré par l'utilisateur | Après déclaré par l'utilisateur | Relecture indépendante |
| --- | --- | --- | --- |
| Site URL | `http://localhost:3000` | `http://localhost:3000` | Non accessible |
| Redirect URLs | Aucune (0) | Une URL (1) | Non accessible |
| URL exacte | Absente | `https://w6-auth-staging.fixeo.ma/auth-callback` | Non accessible |
| Autres réglages Auth | État initial | Inchangés selon l'utilisateur | Pas de comparaison indépendante possible |

L'ajout rapporté est strictement additif, sans wildcard ni autre URL.
Ce tableau est une attestation utilisateur, pas une capture ou lecture du Dashboard.

Le contrôle reprend l'onglet Supabase existant : Sign in. Aucun autre onglet
Supabase connecté n'est disponible dans le navigateur de contrôle. La navigation
par l'accueil Supabase puis son lien Dashboard retourne également à Sign in.
Aucune connexion supplémentaire n'a été initiée, aucune configuration écrite.
L'absence d'accès dans ce navigateur ne contredit pas l'ajout manuel confirmé.

Relais revalidé à **16:42:53 UTC** : HTTPS **200**, URL finale identique, accès
anonyme sans cookies, Authorization, paramètre ou redirection. Marqueur
`X-Fixeo-Relay: w6-phase-1`, no-store / no-referrer / nosniff ; HTML identique
à la Phase 1. Preuve : `phase2a/relay-public-manual-followup.json`.
État déclaré et limite de vérification : `phase2a/manual-configuration-report.json`.

**STOP — W6 PHASE 2A NOT CERTIFIED.** L'ajout manuel est consigné ;
la relecture obligatoire du Dashboard, l'occurrence unique et la comparaison
indépendante de Site URL restent à constater. Aucun PASS de relecture n'est
revendiqué à partir de la seule confirmation textuelle.

Rollback théorique après l'ajout manuel, non exécuté : retirer uniquement
`https://w6-auth-staging.fixeo.ma/auth-callback` de l'allowlist staging,
sans toucher à Site URL ni à tout autre réglage.

Aucun changement Supabase/Vercel/DNS par cette reprise, aucun email/recovery,
aucune session synthétique/JWT/vrai PKCE, aucune activation applicative.
PR #150 Draft, ouverte et non mergée ; documentation uniquement.
**Production impact = NONE. Aucun build physique, merge ou W7.**
