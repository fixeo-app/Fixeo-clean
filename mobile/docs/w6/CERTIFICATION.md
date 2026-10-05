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

Autorisation : DISTINCT RELAY GO, Phase 1 uniquement, 5 octobre 2026.
Le manifeste précédent est remplacé par celui-ci. **Aucun rattachement du domaine
au projet fixeo-clean ni à son export Expo n'est autorisé.**

**Verdict Phase 1 : STOP — W6 RELAY PHASE 1 NOT CERTIFIED.**
Le relais est préparé et testé localement. La création Vercel a échoué avant
création du projet ; aucun déploiement, domaine, DNS ou TLS n'est certifié.

### Manifeste effectif

| Élément | Contrat exact |
| --- | --- |
| Nouveau projet exclusivement dédié | `fixeo-w6-auth-relay`, distinct de `fixeo-clean` |
| Source | `staging/w6-auth-relay/` dans la branche W6 actuelle ; PR #150 reste Draft |
| Root Directory Vercel | `staging/w6-auth-relay` |
| Environnement | Preview/staging uniquement ; jamais Production |
| Build | Node 24, `node build.mjs`, sans installation ni dépendance npm |
| Tests | `node --test test/*.test.mjs` |
| Sortie | `.vercel/output/config.json` et un seul document `.vercel/output/static/callback.html` |
| Fonctionnement | Page autonome ; zéro fonction serveur, Expo, SDK Supabase, clé, base, API ou donnée métier |
| Domaine candidat | `w6-auth-staging.fixeo.ma`, sur le seul projet relais |
| Protection cible | Projet relais protégé ; seule exception de domaine exacte autorisée ; aucun changement fixeo-clean |
| Callback | `https://w6-auth-staging.fixeo.ma/auth-callback` |
| Route publique fonctionnelle | Uniquement `GET /auth-callback` |
| Autres routes | 404, notamment `/`, `/entry`, `/sign-in`, `/artisan`, `/client`, `/api/*`, `/random-test`, `/callback.html` ; aucun SPA fallback |
| Autres méthodes sur callback | 405, `Allow: GET` |
| Transfert | Seulement code PKCE vers `fixeo://auth-callback?code=...`, après action explicite sur Ouvrir FIXEO |
| Erreurs transférables | Seulement `expired`, `invalid`, `denied`, `unknown` ; aucune description brute |
| Privacy | no-store navigateur/CDN, no-referrer, nosniff, CSP par empreintes, zéro ressource externe, stockage ou logger applicatif |
| Guards de build | Refus Production, projet fixeo-clean et branche autre que W6 |

Fichiers du relais : `package.json`, `vercel.json`, `build.mjs`, `.gitignore`,
`src/callback.html`, `src/relay.js`, `test/relay.test.mjs`, `test/routes.test.mjs`,
`README.md`. Aucun fichier fonctionnel W6 existant n'est changé par cette phase.
Les déploiements Git du relais sont limités à la branche W6 ; aucune Production
ne peut produire l'artefact, grâce aux guards indépendants dans le builder.

Le premier script nettoie query/hash avant validation et rendu. Les changements
ultérieurs de fragment et l'historique sont aussi nettoyés. La présence dans query
ou fragment de `access_token`, `refresh_token`, `provider_token` ou
`provider_refresh_token` provoque un refus sans transfert, même d'un code d'erreur.
Les noms encodés/casse alternative, valeurs vides, duplications, redirections
arbitraires, paramètres inconnus et mélanges code/erreur sont refusés.
Si le nettoyage de l'URL échoue, aucun rendu ou transfert n'est effectué.

Le relais ne valide pas l'authenticité du code et ne crée aucune session.
Seule l'application qui conserve le vérificateur PKCE effectue l'échange canonique.
Un flux initié dans Web Preview n'est pas interchangeable avec un flux natif.
Le clic du bouton émet au maximum une destination fixe ; aucun token bearer
ni vérificateur n'est placé dans cette destination.

### Exécution constatée et preuves

| Contrôle | Résultat réel |
| --- | --- |
| Projet avant tentative | Absent, recherche Vercel exacte |
| Création via connecteur Vercel | ÉCHEC avant création : `Vercel API error 200: Response validation failed` lors de la recherche des projets liés au dépôt |
| Relecture après échec | Projet `fixeo-w6-auth-relay` toujours absent |
| Déploiement / alias / TLS | Non réalisés, aucun ID à déclarer |
| DNS avant | CNAME, A, AAAA : NXDOMAIN (résolveur DNS public) |
| DNS après | Inchangé, aucune écriture |
| DNS nécessaire | TYPE=CNAME, NAME=w6-auth-staging, VALUE=non disponible avant création du projet dédié ; aucune valeur inventée |
| Gestion DNS | Externe à Vercel ; nameservers `ns1.nameservers.ma` à `ns4.nameservers.ma` |
| Contrats locaux | **17/17 PASS** |
| Chromium local | **12/12 PASS**, zéro erreur applicative et zéro requête autre que le document |
| Captures locales | Rendu inspecté, messages neutres et aucune valeur Auth affichée |
| Public HTTPS anonyme du relais | NON CERTIFIÉ : domaine non provisionné |
| fixeo-clean après tentative | SSO enabled=true, deploymentType=all_except_custom_domains, passwordProtection.enabled=false, inchangés |
| Domaine relais sur fixeo-clean | Absent |
| Preview W6 anonyme | `/entry` et `/auth-callback` : 302 vers Vercel SSO, puis 307 vers `/login` ; protection conservée |

Preuves versionnées dans `relay-phase1/` :
- `infrastructure.json` : tentative, relecture et état DNS/protections, sans secrets ;
- `protected-preview.json` : requêtes anonymes réelles, hôtes/paths seulement, query strings exclues ;
- `local-browser.json` : matrice Chromium locale, explicitement sans certification publique ;
- `local-valid-shaped-code.png`, `local-access-query.png` : captures de l'artefact local.

La matrice Chromium utilise le vrai HTML construit et ses headers CSP, avec une
réponse HTTP interceptée localement : elle vérifie le navigateur, mais **ne prouve
ni DNS, ni certificat TLS, ni routage Vercel déployé**. Les seules entrées utilisées
sont des marqueurs factices ; aucune session Auth réelle et aucun deep link natif
n'ont été ouverts. Le handoff fixe et à usage unique est contrôlé dans les tests.
L'outil agent-browser a échoué au démarrage ; la vérification locale a été effectuée
avec Chromium/Playwright. Aucun navigateur connecté Vercel/DNS n'a été utilisé.

### Logs et limites explicites

Aucun log applicatif de query string, stockage, Analytics ou pixel.
Aucun Drain renvoyé par la lecture de l'équipe lors du manifeste.
L'absence de logs applicatifs ne certifie pas l'absence de conservation interne
par Vercel. Les journaux de plateforme peuvent inclure les query strings ; cette
limite demeure documentée, sans tentative de contourner une protection.

### Frontière Phase 2 — strictement interdite ici

**Zéro appel Supabase pendant Phase 1, zéro email Auth envoyé.** Aucune Redirect URL,
Site URL, confirmation, template, SMTP, quota ou rate limit modifié. L'URL candidate
est seulement documentée ; `EXPO_PUBLIC_AUTH_CALLBACK_APPROVED` n'est pas activé.
Le code W6 existant reste fail-closed. Recovery :
**DEFERRED — 429 over_email_send_rate_limit**, distinct du blocage d'hébergement.

### Reprise minimale et rollback

Le connecteur Vercel n'a pas créé le projet. Un accès opérationnel permettant la
création du projet dédié est nécessaire. Le repli vers un navigateur connecté
Vercel / gestionnaire DNS n'a pas été utilisé : il requiert l'autorisation de
repli prévue par les règles de l'outil navigateur après insuffisance du connecteur.

Après création/déploiement autorisés : relever la cible DNS exacte, publier
uniquement l'enregistrement nécessaire, certifier TLS et toutes les routes/méthodes
anonymement, recontrôler fixeo-clean, puis STOP avant toute revue Supabase.

Rollback Phase 1 autorisé : détacher uniquement le domaine du relais ; supprimer
uniquement le DNS ajouté pour ce sous-domaine ; désactiver/supprimer uniquement
`fixeo-w6-auth-relay` ; conserver fixeo-clean intact. À ce checkpoint aucun de ces
objets n'existe, donc aucune mutation distante Phase 1 n'est à annuler.
Aucune action Supabase à annuler. Ne jamais réintroduire localhost.

Production impact = NONE. MAIN inchangé. Aucun build physique, aucun merge,
aucun W7. **STOP — W6 RELAY PHASE 1 NOT CERTIFIED.**
