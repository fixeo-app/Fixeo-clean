# PB1 Correction + RAFI Living Sphere — checkpoint de revue

**PB1 : EN ATTENTE de matrice staging authentifiée, puis du seul build Android final.**
**RAFI : PASS RAFI LIVING SPHERE — READY FOR PHYSICAL REVIEW** pour les contrôles logiciels décrits ci-dessous uniquement. Aucun résultat navigateur ne certifie la fluidité, la chauffe, les permissions ou le rendu du téléphone Android PB1.

## A–B. Source et périmètre

Checkpoint initial vérifié sur GitHub : `48b54c2795d72bc26cb5927a344e21bdd938901e`.
Dépôt `fixeo-app/Fixeo-clean`, seule branche `feat/fixeo-mobile-w6-entry-auth-trust`, PR #150 ouverte, Draft, non mergée, base `feat/fixeo-mobile-m4-terrain`.
Le commit contenant ce dossier constitue le checkpoint de revue ; il ne vaut pas autorisation de lancer le build tant que la matrice réelle reste en attente. Le SHA publié est relevé séparément après la publication.

## C–D. Correctifs

- Shell : dock canonique sur les 5 pages principales Client et 11 Artisan ; sélection cohérente ; navigation sans empilement de racines ; masquage pendant les formulaires et le clavier, retour automatique. Drawers ivoire/noir/champagne, même grammaire et sphère existante.
- Villes : `CityField` et `CityZonesField` réutilisent `clientCities.generated.json`, issue du catalogue canonique existant. Catalogue complet, recherche sans accents et normalisation `Fes` → `Fès` aux frontières des écritures Client, demandes, onboarding et profil Artisan. La fixture CRM historique n'est pas réécrite.
- Permission/retour au premier plan : la revalidation Auth garde l'arbre de navigation et le brouillon montés derrière un voile bloquant. Le rôle, l'utilisateur et la session sont revérifiés. Révocation, changement d'identité et déconnexion invalident immédiatement l'accès ; le mode hors ligne reste verrouillé avec retry. Les notifications ne naviguent pas pendant cette vérification.
- RAFI Android : `AbortSignal.timeout()` n'existe pas dans le polyfill réellement installé par RN 0.81.5. Il levait une exception avant `fetch`, ensuite présentée comme une panne de connexion. `fetchMobileJson` utilise `AbortController`, couvre aussi une réponse dont le corps reste bloqué, nettoie son délai et conserve le retry. Le test charge le polyfill natif et l'estimateur réel. Le proxy staging existant a été relu, sans changement. Sa santé authentifiée de bout en bout reste à vérifier.
- Contrats RAFI : confirmation utilisateur préalable, provenances, payload de retry et clé d'idempotence inchangés. Aucun prix décidé par l'animation ou l'IA.
- Agenda : DatePicker et TimePicker Android natifs, avec saisie manuelle, masques, validation et timezone appareil conservés. Annulation sans modification ; fallback vers saisie manuelle.
- Finance : libellés métier, aucune exposition de `other`, client et intervention liée visibles. Aucun enum ni montant backend changé. La dépense indépendante reste sans client/intervention.
- Auth/Trust : bouton natif ouvrant l'application de messagerie après recovery, sans composer ni renvoyer d'email ; icône Android FIXEO ; barres système claires/texte sombre et `expo-system-ui`. Version Android préparée : `0.3.0 (5)`, package `ma.fixeo.app`.

La liste exhaustive des sources et preuves ajoutées/modifiées figure dans `changed-files.txt` et dans le diff du commit.

## RAFI LIVING SPHERE

Architecture : moteur existant `Animated`, driver natif, `transform` et `opacity` uniquement, un seul cycle par sphère. Aucun `setState` par frame, blur animé, WebGL, vidéo embarquée ou nouvelle dépendance RAFI.

`RAFI_STATE` expose IDLE, LISTENING, THINKING, SPEAKING, SUCCESS et ATTENTION. Les anciens états `working`, `understanding`, `matching` restent compatibles et partagent THINKING. Le cercle orbital a été supprimé : aucune roue ne tourne autour de la sphère. Les paramètres de mouvement sont centralisés dans `rafiOrbMotion` et les tokens.

- IDLE : respiration lente, déplacement inférieur à un pixel au format courant, reflet très discret.
- LISTENING : respiration raccourcie et lumière légèrement plus attentive, déclenchée par les commandes microphone réelles.
- THINKING : contraction minime et déplacement du reflet pendant transcription, analyse, estimation, confirmation et actions Artisan.
- SUCCESS : micro-éclat de 880 ms, puis retour à IDLE animé. Une même clé de succès ne rejoue pas à la reprise ou au polling.
- ATTENTION : respiration et halo réduits ; le texte et les actions portent l'erreur.
- SPEAKING : état déterministe disponible ; aucun faux déclenchement sur du texte. Il n'existe pas de lecture vocale produit à laquelle le connecter dans ce lot.

`RafiSignalContext` relie les actions Artisan (disponibilité, devis, planification, finance, CRM, profil) à la présence existante. Client utilise les résultats réels des requêtes et les événements de capture. Aucun signal visuel ne crée de demande ni n'autorise une action métier.

`RafiScrollView` mesure la visibilité pendant le défilement, au plus environ six fois/seconde, sans boucle de polling. Hors viewport, navigation non focalisée et application inactive : animation arrêtée. Les subscriptions et animations sont nettoyées. Les petits formats réduisent fortement l'amplitude ; Auth et drawer utilisent le mode discret. Reduce Motion supprime translation, échelle et reflet mobile, avec seulement une variation lumineuse minimale. Le toucher compresse légèrement et revient sans rebond excessif.

Le fichier MASTER et `RafiCoreMaterial.tsx` sont inchangés octet pour octet, contrôlés par SHA-256. Une erreur du moteur garde la sphère statique ; le fallback matériel existant reste disponible. Les empreintes historiques remplacées pour les fichiers de mouvement sont conservées avec justification dans `tests/fixtures/w4-invariants.json`, sans réécriture silencieuse des références.

## E. Points volontairement différés

- Aucun redesign de RAFI MASTER, nouvelle voix/TTS, mesure audio haute fréquence, haptic additionnel ou hasard permanent.
- Expéditeur email « Supabase Auth » : configuration SMTP non vérifiée dans cette exécution ; aucune modification supposée du fournisseur. Nécessite l'accès Auth et une preuve d'email réel.
- Recovery/PKCE réel et callback Android : contrats locaux PASS ; nouvelle certification connectée et physique en attente. Aucun nouveau mot de passe ni compte créé.
- Capture des DatePicker/TimePicker natifs et des barres système : pas d'émulateur/device disponible. Les captures web de saisie manuelle ne sont pas présentées comme des captures natives.
- Performance Android 60 FPS, chauffe et confort du mouvement : à vérifier physiquement, pas déduits des vidéos web.

## F–G. Tests et résultats

| Gate | Résultat / portée |
| --- | --- |
| TypeScript | PASS, export final complet |
| Contrats mobile | 127/127 PASS, dont polyfill Android, timeout, Auth foreground/offline/logout, villes, idempotence, même brouillon, CRM, Agenda/timezones, income/expense et moteur RAFI |
| Export web W6 | PASS via le packaging réel qui injecte le nettoyage du callback |
| Export Android Hermes | PASS, bundle staging ; aucun APK construit |
| Expo Doctor | 18/18 PASS |
| Prébuild Android jetable | 17/17 assertions PASS ; package/version, permissions, callback, clavier, barres, icône et dépendances natives |
| Shell | 8 configurations 320/390 px × Client/Artisan × Reduce Motion normal/réduit, plus grand texte : PASS |
| Interface Expo réelle + HTTP synthétique | 18 parcours PASS ; dock sur toutes les pages, villes, brouillon/foreground, retry identique, confirmation, disponibilité et notifications vides |
| Auth simulée | Alternance Artisan/Client/Artisan, rôle canonique prioritaire sur metadata, délai de résolution et révocation : PASS |
| Public Auth | 320 px, texte 200 %, clavier, routes privées fermées et callback legacy nettoyé : PASS |
| RAFI vivant | Six états, retour IDLE, toucher, navigation, background, viewport, compact, Reduce Motion, cleanup, fallback d'animation et commandes micro : PASS |
| Staging DB | Lecture seule des fixtures : PASS, données PB1 intactes |
| Matrice produit staging authentifiée | EN ATTENTE : aucune session FIXEO disponible dans la Preview |
| Certification physique Android | NON EXÉCUTÉE |

Les tests HTTP simulés ne contactent pas le backend. Le snapshot staging est uniquement une lecture DB ; il ne remplace pas les tests Auth/RLS et les parcours connectés. Les erreurs de harnais intermédiaires (export brut sans script callback, ancien libellé de menu, événements tactiles artificiels incomplets) ont été corrigées ; seuls les résultats finaux sont utilisés.

## H. Dépendances et données

Aucune migration, aucune mutation Supabase. Fixtures conservées : devis DEV-2026-0001, quantité 2 × 250 = 500 MAD, draft, sent_at/sent_via null ; intervention 2026-10-06T10:30Z = 11:30 Africa/Casablanca ; +500 lié au client/intervention ; −120 indépendant. Voir `staging-fixtures.json`.

Trois modules natifs compatibles Expo SDK 54 ont été ajoutés : datetimepicker 8.4.4, expo-system-ui 6.0.9, expo-intent-launcher 13.0.8. Ils servent aux exigences Agenda et Trust. **Aucune dépendance ajoutée pour RAFI.**

## I. Preuves

`before/` reprend l'export PB1 du checkpoint initial ; `after/` reprend l'export corrigé avec HTTP synthétique, viewport 390 × 844, timezone Africa/Casablanca. Comparer drawer-client, drawer-artisan, client-history, client-alerts, client-account, artisan-agenda, artisan-finance, city-client, geolocation-fallback, rafi-retry et finance-linkage. `after/city-suggestions.png` montre la liste filtrée ; `after/foreground-revalidation.png` montre le verrou temporaire.

`shell/` contient la matrice étroite/grand texte. `auth/` contient les contrôles Auth. `rafi-living/` contient les captures et six vidéos MP4 (idle, listening, thinking, success, attention, speaking). Vidéos à **10 images/seconde pour démonstration**, sans valeur de benchmark 60 FPS. Les cadres Client et Artisan finaux sont `after/client-rafi.png` et `after/artisan-rafi.png`.

## J–M. Build et suite

Nouveau build ID : **aucun**. Lien APK corrigé : **aucun**. Builds Android lancés : **0**.
Après authentification sécurisée des fixtures existantes, terminer la matrice staging et les points Auth ouverts ; vérifier à nouveau le SHA/CI/PR, l'accès Expo, les credentials existants et le quota. Lancer alors une seule compilation Android du SHA final, profil `w6-physical-certification`, environnement EAS `preview`, backend staging exclusivement. Ne pas recréer de credentials ni activer d'automatisation.

La re-certification manuelle doit couvrir les deux OS, permissions et contexte, RAFI IDLE/tap/LISTENING/THINKING/SUCCESS/RETRY, DatePicker/TimePicker, barres/clavier, fluidité et chauffe. Aucun PASS physique n'est revendiqué.

**MAIN UNTOUCHED — PRODUCTION UNTOUCHED — PR #150 DRAFT — NO MERGE.**
