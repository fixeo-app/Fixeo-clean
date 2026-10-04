# ENV MANIFEST final — aucune valeur affichée

Projet Vercel : `fixeo-clean` (`prj_U909VA6lAGunWRVCoSQ37uEOcz5c`). Scope exact de chacune des sept créations : target **Preview**, gitBranch **feat/fixeo-mobile-w4-1-intelligence-gateway**, aucune autre branche, aucun custom environment. Supabase cible : staging canonique confirmé par l'utilisateur ; URL/ref et clé publique active vérifiées ensemble. Toutes les valeurs sont volontairement omises.

| KEY | Source actuelle | Environnement visé | Scope Vercel / branche | Existait dans ce scope ? | Action réalisée | Nécessité |
| --- | --- | --- | --- | --- | --- | --- |
| SUPABASE_URL | Projet Supabase staging canonique | Staging | Preview / W4.1 uniquement | Non → oui | Création branch-scoped | Empêche l'héritage de l'URL globale ; vérification exacte au runtime |
| FIXEO_STAGING_PROJECT_REF | Identité du projet staging confirmée | Staging | Preview / W4.1 uniquement | Non → oui | Création branch-scoped | Garde du projet et portée de l'attestation |
| SUPABASE_ANON_KEY | Clé publique active vérifiée par l'API Supabase | Staging | Preview / W4.1 uniquement | Non → oui | Création branch-scoped | apikey public ; autorisation assurée par le JWT Client |
| FIXEO_ESTIMATOR_SECRET | Nouveau secret généré exclusivement pour W4.1 | Staging serveur | Preview / W4.1 uniquement | Non → oui | Création sensitive branch-scoped | Scelle les sessions/contextes et références opaques ; jamais Mobile |
| FIXEO_DIAGNOSTIC_SECRET | Nouveau secret généré exclusivement pour W4.1 | Staging serveur | Preview / W4.1 uniquement | Non → oui | Création sensitive branch-scoped | Autorité Diagnostic et empreintes serveur |
| FIXEO_W41_ATTESTATION_SECRET | Nouveau secret W4.1, également provisionné dans Vault staging | Staging serveur/Vault | Preview / W4.1 uniquement | Non → oui | Création sensitive branch-scoped | MAC entre gateway et SQL ; jamais transmis au client |
| FIXEO_DIAGNOSTIC_MODEL | Modèle canonique fixé pour la branche | Staging serveur | Preview / W4.1 uniquement | Non → oui | Création branch-scoped | Reproductibilité du fournisseur Diagnostic |

Les variables globales `SUPABASE_URL` et `FIXEO_ESTIMATOR_SECRET` existaient déjà pour Preview/Production : elles restent identiques. Les nouvelles entrées remplacent seulement leur héritage dans W4.1, afin d'éviter toute ambiguïté de projet ou de secret. Les variables Diagnostic existantes en Production et les entrées B1/B2 restent intactes. Aucun ancien secret B1/B2 n'est utilisé.

| KEY hors créations | État / action |
| --- | --- |
| OPENAI_API_KEY | Accès Preview existant réutilisé, aucune modification ; appel réel confirmé sur le Preview |
| VERCEL_AUTOMATION_BYPASS_SECRET | Aucune modification, aucune copie vers Mobile ou Git |
| FIXEO_DIAGNOSTIC_ORIGIN | Dérivée exclusivement de VERCEL_URL réel après garde Preview/W4.1 ; aucune variable créée, aucun fallback Production |
| SUPABASE_SERVICE_ROLE_KEY | Interdite au transport W4.1, absente du manifest nécessaire ; globale existante inchangée et exclue du runtime. Les anciennes routes ne sont pas construites sur W4.1 |
| EXPO_PUBLIC_* | Aucun secret ni nouvelle écriture ; URL publique existante non basculée vers un proxy non certifié |

## Identifiants des seules entrées créées

| KEY | ID Vercel |
| --- | --- |
| SUPABASE_URL | 95PAUD9kEvGHYFd2 |
| FIXEO_STAGING_PROJECT_REF | 4hfNmOy5EFBOTOGZ |
| SUPABASE_ANON_KEY | 1dyqsYItaT6iRQHM |
| FIXEO_ESTIMATOR_SECRET | 2pK3pNQBklMnLClz |
| FIXEO_DIAGNOSTIC_SECRET | EcLwpC8pUscNvH6V |
| FIXEO_W41_ATTESTATION_SECRET | xoFywiYVAZvtMDh0 |
| FIXEO_DIAGNOSTIC_MODEL | NUU8KVazHzOuljn3 |

Vault : entrée dédiée `fixeo_w41_attestation_v1`, key ID logique `w41-v1`, staging seulement. Révocation immédiate par `mobile_intelligence_config_v1.enabled=false` : appliquée et vérifiée à la livraison. Le matériel reste serveur/Vault ; aucune valeur dans ce document.

Comparaison des métadonnées avant/après : les 41 entrées préexistantes restent inchangées (ID, key, target, gitBranch, updatedAt). Sept créations seulement. **Zéro mutation Production ; zéro mutation Development ; zéro modification globale.**
