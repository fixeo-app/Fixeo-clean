# P0 — Intégrité mission.settle

Correctif distinct du candidat B34 initial `543d1f1ae01349a7a734900f3536f9bcc0f87197`. Autorisation ciblée du propriétaire le 29 septembre 2026. Aucun nettoyage, restauration ou modification des missions Production.

## Cause et périmètre

Le parent est une référence texte sans FK. Si la demande manque, `request_status` et `r.status` sont NULL. Le précédent `IF NOT (condition)` n'était pas vrai et ne levait pas le refus ; le preview puis le règlement pouvaient aboutir malgré l'absence du parent.

Parcours canonique inchangé : API `action/preview` → `control_action_preview_v1` ; confirmation → `control_action_execute_v1` → `admin_settle_mission_v1`. Ce dernier n'est exécutable que par postgres, via l'orchestrateur gardé Admin. Aucun autre appelant serveur trouvé dans les corps de fonctions au checkpoint. Les dépendances SQL dynamiques restent explicites dans ces corps.

Deux corps de fonction seulement sont remplacés :

- `admin_settle_mission_v1(uuid,numeric,numeric,text)` exige le parent réel, prend `FOR KEY SHARE`, lève `REQUEST_NOT_FOUND` avant toute branche idempotente/écriture si absent et utilise `IS NOT TRUE` pour l'éligibilité.
- `control_action_preview_v1(text,uuid,jsonb,uuid)` applique les mêmes conditions uniquement à la capacité `mission.settle`, avant l'insertion du preview.

Le verrou de clé empêche DELETE et les changements de clé du parent jusqu'à la fin de la transaction. L'autorité relit le parent même pour un ancien preview. L'orchestrateur conserve son audit d'échec et son cache idempotent ; aucune écriture métier partielle ne subsiste. Les règles tarifaires et les autres capacités restent inchangées.

Owner postgres, SECURITY DEFINER et search_path vide conservés. ACL exactes conservées : autorité `{postgres=X/postgres}` ; preview `{postgres=X/postgres,authenticated=X/postgres}`. Aucune table, policy, trigger ou permission modifiée.

## Migration gelée

`20260929142337_control_os_b34_settlement_integrity_guard.sql`

SHA256 : `18ca497b9667753d0864acfee1515dd7c8f108e02ed221655824a253f1de4a40`.

Transaction atomique, timeout de verrou 5 s / statement 30 s. Le préflight embarqué exige les définitions, owner, ACL et search_path de la baseline exacte avant remplacement. Un drift provoque `SETTLEMENT_BASELINE_MISMATCH`.

Empreintes PostgreSQL des corps corrigés et métadonnées, observées en staging :

| Fonction | md5(pg_get_functiondef) |
|---|---|
| admin_settle_mission_v1 | c65636d6c39bc43e91818dc10f9f00fd |
| control_action_preview_v1 | 453c0864ab7ef580f402ba4e9702728f |

## Validation ciblée

- `settlement-integrity.test.cjs` : migration bornée à deux corps, refus direct dans l'autorité, ancien preview, retry, absence d'écritures métier partielles, missions valides, ACL et dossiers orphelins.
- Suite authority + guard locale : 42 PASS / 0 FAIL / 0 SKIP ; les deux anciens FAIL passent.
- DB/rollback B34 avec le guard installé : 26 PASS / 0 FAIL / 0 SKIP.
- CI PostgreSQL natif : trois courses supplémentaires vérifient les refus concurrents et les deux ordres de verrouillage suppression/règlement. La concurrence de règlements valides reste couverte par le test existant.
- Staging : sessions synthétiques Auth existantes, fixtures explicitement temporaires ; refus anon/non-admin/direct RPC, refus API, ancien preview, règlement valide et idempotence. Preuve dans `evidence/p0-staging.json` ; nettoyage contrôlé ensuite, hors Production.

Les 19 missions Production restent en lecture seule. La reproduction de leurs catégories de statut utilise uniquement des identifiants locaux synthétiques. UNKNOWN, NOT_FOUND et l'absence de réparation automatique sont conservés. Aucun test ne dépend d'un LLM.

## Cutover et rollback

Ordre SQL validé : migration B34 additive inchangée, puis guard P0 ; postflight et comparaison des empreintes métier avant tout merge. Le rollback B34 conserve le guard, compatible avec le frontend de la baseline. Voir `ROLLBACK.md`.
