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

### Manifeste en attente de GO — aucune action ci-dessous appliquée

| Périmètre | Action précise / condition |
| --- | --- |
| Hébergement W6 uniquement | Fournir une URL HTTPS publique stable pour ce callback. Ne pas désactiver la protection globale du projet existant. Option à valider : domaine dédié `w6-auth-staging.fixeo.ma`, lié uniquement à la branche W6 ; vérifier DNS, TLS et accès anonyme avant tout email. |
| Application W6 | Après validation du domaine, fixer explicitement le callback `https://w6-auth-staging.fixeo.ma/auth-callback` et son contrôle d’origin. La version actuelle reste liée à l’alias Preview ci-dessus. Aucun changement natif/Production. |
| Supabase staging `kqyhusnbybsukbcaoqtu` | Lire Site URL et Redirect URLs dans le dashboard ou recevoir leur export expurgé. Le connecteur Supabase n’expose pas ces champs. |
| Redirect URLs staging, seulement si nécessaire | Après contrôle d’accessibilité et GO distinct, ajouter **la seule URL exacte** `https://w6-auth-staging.fixeo.ma/auth-callback` si ce domaine est retenu et si elle est absente. Aucun wildcard. Ne pas supprimer d’URL existante. |
| Paramètres inchangés | Site URL, confirmation email, limites, SMTP, templates et toute Production. |
| Application, après preuve de l’allowlist | Autoriser les envois W6, rejouer seulement les recovery manquants avec les mêmes comptes après renouvellement du quota ; ne pas recréer de compte. |
| Rollback | Retirer uniquement le nouveau domaine/ajout d’allowlist W6 s’ils ont été créés ; désactiver l’envoi applicatif. Aucun changement aux protections globales. |

Le domaine dédié est une proposition précise, pas une URL déjà provisionnée ni une preuve DNS. Si une autre URL publique est choisie, mettre à jour ce manifeste avant l’ajout Supabase.

**STOP — W6 ENTRY AUTH TRUST NORTH STAR NOT REACHED.** Le nouveau hard blocker est l’hébergement du callback ; le recovery réel reste non certifié. Toute autorisation de reprise doit préserver la séparation staging/Production et la validation réelle du canal email.
