# Bloc 1 — Certification Supabase staging authentifiée

## Périmètre et preuve

Condition F traitée sur `kqyhusnbybsukbcaoqtu` (`fixeo-diagnostic-staging`, organisation FIXEO, eu-west-1). Ce projet existait vide : 0 utilisateur Auth, 0 ligne métier dans les 49 tables initiales, 0 média. Le projet de restauration `avzawlissxfdjgxfeaxu` n’a pas été utilisé. Production `ztwtbgoqanqzvwiibtuh` n’a reçu aucune mutation.

Le schéma nécessaire a été aligné à partir des définitions canoniques, sans copie de lignes : 32 tables manquantes, 4 colonnes, 75 fonctions manquantes, 4 fonctions à aligner et 4 contraintes. Les 206 définitions de fonctions de référence ont été comparées. Aucun utilisateur réel, secret métier, média, webhook/worker de contact ou paiement réel n’est importé. Le script d’alignement dédié au staging a le SHA256 `a12ecd48ad2ed99b24a510587d43136dcb0a32d6914bfb80f3e3e0ea2a64ebf2` ; il n’appartient pas au plan d’application Production.

Les quatre migrations autorisées ont été appliquées dans l’ordre, avec leurs SHA256 inchangés. Le préflight normalise désormais les ACL effectives (NULL/default et ordre équivalents), tout en refusant les changements de privilèges, de propriétaire ou de définition. Le gate Claims supplémentaire `20260929002702_control_os_b1_claims_gate.sql` ferme un bypass démontré durant la recette. Le manifeste exact est `SHA256SUMS`.

## Isolation Preview

Les variables suivantes sont limitées à **Preview, branche `feat/control-os-bloc1-contract`** : `SUPABASE_URL`, clé publique Supabase, `FIXEO_STAGING_PROJECT_REF`. Le garde backend reste actif ; aucune suppression du refus `CONTROL_BACKEND_UNAVAILABLE`.

Les variables serveur héritées ont une valeur désactivée sur cette seule branche : `SUPABASE_SERVICE_ROLE_KEY`, `DISPATCH_WHATSAPP_WORKER_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `FIXEO_ESTIMATOR_SECRET`. Production conserve ses variables. Control fonctionne avec la clé publique staging et le JWT de l’opérateur ; aucune service_role n’est exposée au navigateur. Diagnostic public/LLM, médias, WhatsApp, campagnes et paiements externes restent désactivés sur cette Preview.

L’URL, le SHA, l’état READY et la dernière recette de la Preview sont figés dans le dossier de remise et la PR #52. Une Preview READY seule ne vaut jamais certification métier.

## Identités et fixtures

16 utilisateurs Supabase Auth réels, synthétiques, e-mails `*.synthetic@fixeo-staging.invalid`, mots de passe aléatoires stockés hors dépôt. Auth password grant, JWT réel, rôle DB et refresh testés pour chacun. Les rôles comprennent Admin, client, artisan, owner/operations/viewer sur deux tenants, site manager et workforce. L’approbation Claims peut promouvoir normalement certains demandeurs synthétiques en artisan ; ces promotions sont attendues.

Fixtures initiales : 841 demandes dont 800 de volume, `now`/`urgent`/normal/NULL, classes production/test/internal/NULL, devis et cycles historiques, missions proposées à validées, historique non prouvé, artisans revendiqués/non revendiqués et multiactivité, Claims, deux tenants et trois sites, workforce, affectations internes/hybrides/SLA, VAP/fournitures, reversements, données Business privées marquées et métadonnées Diagnostic. Les scénarios ajoutent leurs objets synthétiques via les autorités légitimes. Le mot « production » désigne ici une **classification de fixture staging**, jamais une donnée Production.

## Résultats et reprise aux checkpoints

Les fichiers `evidence/bloc1-staging-*.json` conservent les résultats bruts et les retests ciblés. Un FAIL ancien n’est pas transformé en PASS : son correctif et sa preuve de remplacement sont identifiés ci-dessous. Les suites ne sont pas rejouées intégralement sur des fixtures déjà consommées.

| Domaine | Résultat acquis | Preuve |
|---|---|---|
| Auth | 16 identités : login, vrai JWT, rôle canonique et refresh PASS | `bloc1-staging-auth.json` |
| Control / rôles / RLS | 17 cas initiaux PASS ; 13 refus/lectures retestés après correction SourceState | `read-security` et focused |
| Workflows | 11 cas effectifs PASS : SR, devis, mission, Human Authority, Finance/VAP | `workflows` et focused |
| Enterprise / Trust | 8 cas effectifs PASS ; deux tenants, sites, worker, SLA, gagnant hybride, Claims | `enterprise-trust` et focused |
| Sources dégradées | 3 cas PASS avec fautes réelles temporaires dans staging ; restauration ensuite | `source-faults` |
| Gouvernance / rollback | 5 phases PASS : retrait du rôle avec JWT existant, retour, pause/reprise ACL | `governance-*` |
| Fondations RAFI / récupération | 4 cas PASS : sources revenues, dossiers minimaux, proposition déterministe, résultat vérifié/audité | `final-readiness` |
| Claims gate complémentaire | Refus RPC legacy, writes/identités protégés, création own pending, rejet, concurrence/rejeu, checkpoint durable | `claims-gate*` |
| Diagnostic / guest serveur | Producteurs réels PostgreSQL sous service_role staging, idempotence et lien Diagnostic PASS ; refus JWT ordinaires PASS | `staging/diagnostic-producers.sql` et `final-readiness` |
| Régression locale après Claims | 49 PASS, 0 FAIL, 1 SKIP (service PostgreSQL natif absent localement) | `bloc1-local-final.log` |
| Build Diagnostic après Claims | 164 PASS, 0 FAIL, 0 SKIP | `diagnostic-build-final.log` |
| Concurrence PostgreSQL native | CI isolée PostgreSQL 17.6 ; double clic, settlement, acceptation, interne/externe, reversement, Claims | Workflow du SHA exact dans PR #52 |

### Échecs de recette expliqués et corrigés

- Le harness attendait HTTP 200 pour des refus métier intentionnels HTTP 409 : adaptation de l’assertion, quatre cas ciblés PASS.
- Le test SLA employait des noms de dates inexacts : `execution_started_at` et `resolved_at` canoniques vérifiés sur une nouvelle demande, PASS.
- Après multiactivité, le métier principal était électricité : Dispatch V1 refuse une cible plomberie dont plomberie n’est que secondaire. Le test confirme ce refus sans effet puis une cible canonique éligible. Le moteur Dispatch n’est pas remplacé.
- Les Claims legacy étaient directement exécutables par authenticated : bypass réel reproduit dans une transaction annulée, puis retrait des grants, adaptateur repository via Control et nouveaux tests.
- Le retest Claims réutilisait deux comptes déjà propriétaires : l’index unique l’a refusé. Les deux demandeurs libres du test ont ensuite produit un gagnant et un perdant ; l’assertion comptait à tort uniquement un claim supersédé alors que deux anciens claims de fixture l’étaient aussi. Le checkpoint a été relu, puis les tickets déjà exécutés rejoués avec leurs acteurs/clés exacts, sans nouvelle affectation. La preuve ciblée remplace cette assertion erronée.

## Corrections fonctionnelles

1. **Fraîcheur** : seuil versionné 60 s ; vieux snapshot = stale, provenance absente/future incohérente = unknown. Une valeur partial/forbidden/unavailable ne produit ni zéro ni recommandation admissible.
2. **Publication progressive** : six sources fermées chargées indépendamment ; une source lente ne bloque pas les autres cartes. Refresh simultanés mutualisés. Budget navigateur 15 s couvrant Auth puis source, budgets serveur 5 s par dépendance. Les latences observées en recette incluent Auth/réseau et ne sont pas un SLA de charge.
3. **RAFI fondations** : EvidenceRef, Signal, Recommendation, ActionProposal, DecisionResult ; navigation/action allowlist, abstention si périmé/inadmissible, texte métier traité comme donnée. Aucun LLM ni autorité nouvelle.
4. **Claims** : conservation intégrale des fonctions d’approbation/rejet/verrouillage ; seul Control les appelle après confirmation. Le repository échoue sans Control et attend résultat vérifié + audit avant rafraîchissement ; aucune écriture de note/table ou succès local anticipé. La page Admin legacy charge aussi cet adaptateur.

## Gates couverts

- Human Authority : preview/confirmation, expiration réelle à 5 minutes, mauvais acteur/cible/payload, état modifié, droits retirés, clés concurrentes/replay, verify et audit.
- Devis : prix/scope/version, revue FIXEO, invisibilité au client avant approbation, refus/expiration/legacy ; acceptation crée `pending`, jamais `validated`.
- Mission : cycle complet réel, validation client, offered/declined/expired/cancelled distincts ; un gagnant externe/interne.
- Finance : prix/commission/échéance/déclaration/confirmation/correction/annulation séparés ; concurrence sûre, VAP et fournitures conservés, historique non prouvé refusé.
- Enterprise : deux tenants, viewer/operations/owner et scope site ; Admin global ne reçoit aucun membership ni délégation sensible implicite.
- Confidentialité : Business privé et agrégats exclus ; médias/input Diagnostic/PII complète absents de Control et audit.
- Classification : défaut production sur nouvelles lignes, historique NULL, reclassement borné/réversible/audité, utilisateur ordinaire refusé.
- Métriques : agrégats serveur sur >700 demandes, pagination distincte du total, sémantiques états/urgence/validation/available/active et commission, NULL/UNKNOWN ≠ 0.

## Limites explicites — NOT RUN / non exposé

- Pas de login par saisie dans l’interface graphique de chaque OS ; la recette Auth réelle est HTTP Auth → PostgREST/RPC → API Preview. Les consommateurs JS sont testés en VM, l’HTTP des assets et de l’API est vérifié sur Preview.
- Pas d’E2E public photo/LLM Diagnostic, Storage média, WhatsApp, paiement ou campagne. Aucun besoin de connexion à ces services pour les projections minimales du Bloc 1. Les producteurs serveur Diagnostic sont testés dans le vrai PostgreSQL staging, pas via un secret serveur Vercel actif.
- Pas de test de charge massive, purge d’audit, restauration de sauvegarde Production ni migration Production. Le rollback testé est la pause/reprise opérationnelle sans perte de données.
- Dispatch V1 utilise le métier principal pour l’éligibilité ciblée ; projection multiactivité et soumission de devis utilisent les listes canoniques. Cette limitation existante est conservée pour le Bloc 4.
- 43 métriques définies ne sont pas encore exposées faute de prérequis ; elles restent indisponibles, jamais zéro. SLA démarrage/résolution sans politique canonique = `not_configured`.

## Application et rollback

Voir `CUTOVER.md` : les cinq migrations, ordre applicatif, hashes et contrôles post-déploiement sont préparés. La pause retire uniquement preview/execute ; lectures et producteurs Client/Artisan/Enterprise subsistent. Reprise après correction, sans réouvrir les accès Claims legacy. Aucun retour aux raw writes ou à l’acceptation créant validated. Audit, versions, reversements et historique sont conservés.

**La certification staging ne vaut pas autorisation Production. PR #52 reste DRAFT. Aucun merge, migration Production ni cutover sans GO explicite.**
