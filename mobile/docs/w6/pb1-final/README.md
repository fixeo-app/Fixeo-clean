# PB1 Physical Correction — RAFI Living Material V2

Checkpoint logiciel du 6 octobre 2026. **Pas de FINAL SOFTWARE FREEZE. Aucun nouveau build Android lancé.** La preuve Vision STAGING authentifiée reste bloquante ; elle ne peut pas être remplacée par les tests avec fournisseur simulé. Le mandat autorise la poursuite jusqu'au build unique une fois tous les gates satisfaits.

Branche unique : `feat/fixeo-mobile-w6-entry-auth-trust`. PR #150 ouverte, Draft et non mergée. Référence physique précédente : `87753e493503c01122486d79dd88a7bce3eb2de7`, APK `4dc8e095-fbd5-434c-990b-6ec4dcd66bb6`, version 0.3.0 (5). Le candidat prépare 0.3.0 (6), package `ma.fixeo.app`, profil `w6-physical-certification`, environnement EAS `preview`, données et API STAGING.

## Corrections et preuves

| Écart physique | Cause et correction | Fichiers principaux / preuve |
| --- | --- | --- |
| RAFI paraissait statique | Remplacement du PNG animé par un renderer GLES de relief et de lumière, partagé entre les formats. La référence artistique ne sert pas de texture. | `ui/RafiLivingMaterial.tsx`, `rafiMaterialShader.ts`, `rafiMaterialMotion.ts`, `RafiOrb.tsx` ; exécution réelle du shader et tests d'horloge. |
| Centrage | Cadre fixe et alignement central commun ; les déformations restent internes au cadre. | `ui/RafiOrb.tsx` ; contrats de géométrie. Rendu sur téléphone à recertifier. |
| Icône F | Nouvelle matière obsidienne/champagne sans texte, fond transparent, foreground adaptatif 1024². Rayon opaque 297,74 px, inférieur à la zone sûre 312,89 px. | `assets/rafi/rafi-launcher-v2.png`, `app.json`. |
| Photo non affichée | Composant partagé avec URI sélectionnée réelle, agrandissement, reprise, remplacement, suppression, précision et continuation sans photo. Photo visible durant analyse et en lecture seule sur STOP sécurité. | `components/RafiPhotoPreview.tsx`, `app/index.tsx`, `app/artisan-workspace/rafi.tsx` ; tests React du composant. |
| Photo générique | La politique Vision classait les scènes sans panne de service comme non informatives. Politique descriptive activée uniquement sur les deux chemins Mobile ; les objets visibles sont distincts d'un défaut identifiable. | Backend publié `23a3923ef60b01ea0e4e735831dcdc60c5f9f362` ; `api/diagnostic/photo-grounding.js`, `providers/openai.js`, endpoints photo Mobile. Preuve réseau authentifiée encore requise. |
| Capture et transport | Normalisation JPEG/orientation, dimension maximale 1600 px, sans EXIF demandé, annulation et résultat tardif protégés. Transport photo borné à 60 s avec AbortController compatible RN/Hermes ; enveloppe Artisan 65 s. | `lib/rafiPhotoCapture.ts`, `lib/mobileDiagnostic.ts`, `components/ArtisanEditorial.tsx` ; tests capture, multipart, nettoyage des délais. |
| Confusion diagnostic | OBSERVÉ et DÉCLARÉ conservent leur provenance serveur ; déclaration vide explicitée. HYPOTHÈSE et INCERTITUDE visibles. Une correction texte invalide l'analyse précédente. | `ClientDiagnostic.tsx`, les deux écrans RAFI ; provenance backend inchangée et testée. |
| Ville Fes | Un sélecteur canonique avec recherche indépendante de la sélection ; projection des anciennes graphies à la lecture, normalisation aux écritures autorisées. Aucun backfill des fixtures. | `CityField.tsx`, `clientLocation.ts`, lecteurs Client/Artisan/missions ; tests Fes/FES/Fès, immutabilité, noms RPC inchangés. |
| GPS lent | Permission existante réutilisée ; position native de moins de 60 s et précision <= 1500 m, attente cache bornée à 1 s, sinon acquisition Balanced. Délai global et invalidation des résultats tardifs préservés. | `clientLocation.ts`, `clientLocationNative.ts` ; cache, cache bloqué, timeout, cancellation, contexte préservé. |
| Disponibilité silencieuse | Mutation bornée à 10 s, refus explicite, puis lecture autoritaire bornée à 8 s. Confirmation locale uniquement après accord du backend et relecture. | `artisanWorkspace.ts`, écran disponibilité, messages ; succès/refus/mismatch testés. Le compte d'audit est incomplet (`onboarding_completed=false`) : le refus doit être visible, pas contourné. |
| Micro Artisan interrompu | Le rafraîchissement Auth au retour de permission démontait l'écran. Le contexte déjà autorisé reste monté pendant la revalidation ; l'échec efface les données. Le callback d'écoute peut changer sans démonter l'enregistreur. | `artisanProgressive.ts`, `useArtisanHome.ts`, `RafiInputRail.tsx` ; test React permission/retour/rerender/stop/background/unmount. |
| Copilote Artisan | Vocabulaire PB1 déterministe : agenda, clients et devis appartenant à l'artisan, préremplissage devis/agenda/finance, proposition disponibilité. Transcription puis proposition explicite ; écritures uniquement après confirmation. Commande inconnue/ambiguë expliquée. | `lib/artisanCopilot.ts`, écran RAFI, paramètres Agenda/Finance ; commandes du mandat testées, aucune SQL/route générée par modèle. |
| Consentement répété | Explication FIXEO acceptée une fois par installation et par usage. Permission Android relue séparément, redemandée seulement si nécessaire. | `permissionPrompt.ts`, capture/micro ; test d'acceptation entre rôles. |

## Moteur et limites de performance

Une sphère analytique porte un relief déformé par plusieurs fonctions désynchronisées ; ses normales sont recalculées et déplacent les reflets chauds. La respiration asymétrique a une période principale de 9,7 s, une amplitude principale de 1,1 % et une modulation secondaire. Le flux possède une phase indépendante, continue lors des transitions. Le toucher comprime localement le relief, déplace la matière autour du contact et relaxe en 2,6 s. Il n'y a pas de scale animé, de rotation mécanique, de visage ou de boucle d'émotions.

Le scheduler vit hors React : 30 images/s maximum en grand format, 24 en compact ; buffers de 256²/128² pixels maximum. Le scale constant du GLView ne fait que présenter ce framebuffer à la taille demandée. Focus, viewport et AppState suspendent l'horloge ; Reduce Motion immobilise le matériau. Cleanup RAF/GL et résultat tardif sont protégés. Le renderer statique historique reste un fallback d'échec GL uniquement.

`tests/pb1-shader-gate.py` compile et exécute les shaders réels dans EGL/GLES Mesa hors écran : 12 223 pixels intérieurs changent sous le seul flux avec alpha inchangé ; respiration : 1 711 pixels de contour déformés ; différence tactile locale 3,635 contre 0,056 distante ; retour à l'équilibre, version compacte et destruction du contexte PASS. Ces mesures sont numériques, sans Preview ni certification visuelle.

Dépendances justifiées : `expo-gl@16.0.10` pour le matériau GLES natif ; `expo-image-manipulator@14.0.8` pour normaliser la photo. Versions compatibles avec Expo SDK 54 d'après Expo Doctor. `react-test-renderer@19.1.0` est uniquement une dépendance de développement pour exécuter les composants. Chauffe, batterie, framerate perçu et qualité de matière restent à vérifier sur le téléphone final.

## Vision STAGING

Déploiement backend READY : `dpl_GvBr5g3LSnsmtSYvSibMorN4R7ns`, source `23a3923ef60b01ea0e4e735831dcdc60c5f9f362`. Backend existant W4, configuration STAGING conservée ; seul le correctif photo concerné diffère dans ses sources API. Contrat et endpoint APK inchangés : proxy Supabase `kqyhusnbybsukbcaoqtu`, route `/api/mobile-rafi-photo`. Le proxy conserve la protection Vercel côté serveur et exige un JWT utilisateur valide.

Les tests locaux exécutent la capture, le multipart, la sanitisation, l'empreinte des octets puis le payload `input_image`/`detail:high` réellement construit par l'adaptateur. Ils prouvent que la photo traverse cette frontière ; la réponse fournisseur y est simulée, donc ils ne certifient pas l'API live.

`tests/mobile-intelligence/pb1-vision-live.cjs` est prêt pour l'appel live avec une photographie publique existante du dépôt (`img/blog/guides-blog.webp`, bâtiments visibles sans défaut revendiqué). Il utilise exactement l'endpoint du profil APK, vérifie la session STAGING du compte photo existant, envoie un JPEG réel sans déclaration et sans persistance, puis exige : observation sourcée par média informatif, déclaration vide séparée, hypothèses uniquement inférées, incertitude explicite et absence du fallback générique. Sa sortie ne contient ni pixels, ni texte de réponse, ni jeton, ni secret. Aucun service_request n'est créé.

Exécution : fichier confidentiel JSON hors dépôt, mode 600, fourni par le titulaire de la session, contenant `access_token` frais ou les identifiants existants `email`/`password`. Puis `NODE_PATH=./api/node_modules PB1_AUTH_FILE=/chemin/prive.json PB1_VISION_REPORT=/chemin/preuve.json node tests/mobile-intelligence/pb1-vision-live.cjs`. Ne pas mettre de secret dans Git, les logs ou une ligne de commande. Aucune récupération/reset/recréation de compte n'est prévue. Résultat actuel : **BLOCKED / AUTH_FILE_REQUIRED**, zéro POST Vision live effectué.

## Contrôles et gouvernance

- Mobile : **146/146 PASS** ; Server : **204/204 PASS** ; TypeScript PASS ; Expo Doctor **18/18 PASS** ; shader GLES PASS ; export Android/Hermes PASS. `local-proof.json` conserve les mesures, l'empreinte du bundle et les limites exactes.
- Les contrats existants restent actifs. Les anciens hashes intégrals des modules explicitement autorisés à changer sont remplacés par des hashes du reste inchangé et des tests comportementaux ciblés ; les flows mutation, Auth et mission hors périmètre restent protégés.
- Fixtures relues sur le projet STAGING : Client, devis 2 × 250 = 500 draft, intervention planifiée, +500 et −120 conservés. Aucune mutation métier ou Auth réalisée par ce mandat.
- Main relu à `f8e59d5ad7294dd5493bf7b0219740248d2a8d64`. Production READY `dpl_63jTTiFwLrBD3D4Tc3Gxi7KVNjvR`, même SHA. `fixeo.ma` et `www.fixeo.ma` inchangés.
- Incident antérieur déclaré : création technique du backend STAGING avait déplacé l'alias racine technique Vercel ; restauration immédiate vers son déploiement initial, vérifiée et acceptée par l'utilisateur. La reprise n'effectue aucune autre mutation Vercel. `governance.json` répertorie les alias restaurés.
- La CI doit être verte sur le commit publié de ces fichiers. Les liens et conclusions après publication sont consignés dans PR #150. Aucun verdict FINAL FREEZE n'est prononcé tant que Vision live reste bloqué.
- Aucun build APK intermédiaire/final nouveau ; aucune Preview utilisateur, validation visuelle browser ou modification Main ; aucun merge. Le seul build final attend tous les gates. L'accès EAS existant est disponible, sans déclenchement de build.

**Statut : correctifs et preuves logiciels locaux prêts ; preuve authentifiée Vision requise avant gel et build. Aucune certification physique V2 revendiquée.**
