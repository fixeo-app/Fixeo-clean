# ACL inventory — Enterprise / dispatch

Lecture Production : 2026-09-24T00:28:46.519224+00:00. **23 tables**, **86 policies**, **21 triggers**, **155 contraintes**. ACL brutes, effectives et définitions : [production-readonly.json](production-readonly.json), section `tables`.

S=SELECT, I=INSERT, U=UPDATE, D=DELETE ; T=TRUNCATE, R=REFERENCES, G=TRIGGER, M=MAINTAIN. `—` = aucun privilège effectif de table. Droits par colonne détaillés ensuite. Un grant CRUD de table ne contourne pas sa RLS ; TRUNCATE n’est pas filtré par RLS.

| Table public | RLS / FORCE | anon CRUD | authenticated CRUD | anon excessifs avant | authenticated excessifs avant | Après attendu (excessifs anon/auth) |
| --- | --- | --- | --- | --- | --- | --- |
| `artisan_profiles` | true / false | SIUD | SIUD | TRGM | TRGM | — / — |
| `artisans` | true / false | S | SID | M | M | — / — |
| `dispatch_execution_queue` | true / false | — | — | — | — | — / — |
| `dispatch_notification_outbox` | true / false | — | — | — | — | — / — |
| `enterprise_accounts` | true / false | — | S | — | M | — / — |
| `enterprise_audit_events` | true / false | — | S | — | M | — / — |
| `enterprise_invitations` | true / false | — | — | — | — | — / — |
| `enterprise_leads` | true / true | — | SIUD | — | — | — / — |
| `enterprise_member_sites` | true / false | — | S | — | — | — / — |
| `enterprise_members` | true / false | — | S | — | — | — / — |
| `enterprise_request_context` | true / false | — | S | — | — | — / — |
| `enterprise_request_sla` | true / false | — | S | — | — | — / — |
| `enterprise_sites` | true / false | — | S | — | — | — / — |
| `enterprise_sla_policies` | true / false | — | SIU | — | — | — / — |
| `estimator_context_redemptions` | true / true | — | S | — | — | — / — |
| `fixeo_pricing_offers_v1` | true / false | — | — | — | — | — / — |
| `missions` | true / false | S | S | TRGM | TRGM | — / — |
| `notifications` | true / false | SIUD | SIUD | TRGM | TRGM | — / — |
| `payments` | true / false | SIUD | SIUD | TRGM | TRGM | — / — |
| `profiles` | true / false | SIUD | SIUD | — | — | — / — |
| `quotes` | true / false | SIUD | SIUD | TRGM | TRGM | — / — |
| `service_requests` | true / false | SIUD | SIUD | TRGM | TRGM | — / — |
| `users` | true / false | SIUD | SIUD | — | — | — / — |

## 52 privilèges à retirer, neuf tables

| Tables | Rôles | Privilèges | Combinaisons |
| --- | --- | --- | --- |
| artisan_profiles, missions, notifications, payments, quotes, service_requests | anon, authenticated | TRUNCATE, REFERENCES, TRIGGER, MAINTAIN | 48 |
| artisans | anon, authenticated | MAINTAIN | 2 |
| enterprise_accounts, enterprise_audit_events | authenticated | MAINTAIN | 2 |

Droits `service_role`/`postgres` strictement identiques ; tous CRUD, grants par colonne, RLS et triggers conservés. Aucun grant nouveau. users/profiles : les 16 retraits P0 sont déjà effectifs.

Ces privilèges concernent l’administration/DDL/maintenance, pas les opérations CRUD/RPC du frontend. Aucun usage TRUNCATE/DDL/maintenance sur ces tables par anon/authenticated trouvé dans les consommateurs audités. Créer un nouveau trigger reste une opération propriétaire, distincte de son exécution lors d’un INSERT. S09/S10/S15 vérifient réellement les triggers après retrait de TRIGGER et EXECUTE, avec des rôles non privilégiés, sur PostgreSQL 17 local.

## ACL par colonne — conservation exacte

- `missions.request_id` : `authenticated=a/postgres`.
- `missions.client_profile_id` : `authenticated=a/postgres`.
- `missions.artisan_profile_id` : `authenticated=a/postgres`.
- `missions.agreed_price` : `authenticated=a/postgres`.
- `missions.status` : `authenticated=aw/postgres`.
- `enterprise_invitations.id` : `authenticated=r/postgres`.
- `enterprise_invitations.enterprise_id` : `authenticated=r/postgres`.
- `enterprise_invitations.email_normalized` : `authenticated=r/postgres`.
- `enterprise_invitations.role` : `authenticated=r/postgres`.
- `enterprise_invitations.invited_by` : `authenticated=r/postgres`.
- `enterprise_invitations.target_user_id` : `authenticated=r/postgres`.
- `enterprise_invitations.status` : `authenticated=r/postgres`.
- `enterprise_invitations.expires_at` : `authenticated=r/postgres`.
- `enterprise_invitations.accepted_at` : `authenticated=r/postgres`.
- `enterprise_invitations.accepted_by` : `authenticated=r/postgres`.
- `enterprise_invitations.revoked_at` : `authenticated=r/postgres`.
- `enterprise_invitations.revoked_by` : `authenticated=r/postgres`.
- `enterprise_invitations.created_at` : `authenticated=r/postgres`.
- `enterprise_invitations.updated_at` : `authenticated=r/postgres`.

`missions` ne donne pas INSERT/UPDATE au niveau table à authenticated, mais donne INSERT(request_id, client_profile_id, artisan_profile_id, agreed_price, status) et UPDATE(status). Ces grants sont utilisés et testés. Un audit limité à has_table_privilege aurait manqué ces écritures.

`enterprise_invitations` expose des colonnes sélectionnées, **pas token_hash**. Aucun GRANT SELECT global ne doit les remplacer.

## CRUD : preuves et décisions

| Surface | Consommateurs / RLS observés | Décision S0 |
| --- | --- | --- |
| service_requests INSERT | Frontend historique `js/fixeo-supabase-core.js:453`, API create/urgent/estimator, SQL create_enterprise_request et Diagnostic ; anon INSERT WITH CHECK true ; client INSERT personnel | Préserver. Le trigger INSERT crée déjà la queue V2. Restreindre le canal invité demande une décision métier distincte. |
| service_requests UPDATE | Client personnel, Artisan lié, Admin canonique ; anciennes couches tracking/commission/sync | Préserver. Revoir séparément `artisan_assign_new_requests` (new → assigned) et les fallbacks téléphone. |
| missions INSERT/UPDATE | `js/fixeo-supabase-core.js:699` fallback de création de mission ; Artisan propriétaire par RLS ; UPDATE(status) | Préserver les grants par colonne. Aucun ajout de privilège. |
| notifications INSERT/UPDATE | `js/fixeo-notification-engine.js:112` ; `js/fixeo-notification-center-v1.js:228` et dashboards pour read=true | Préserver. INSERT authenticated WITH CHECK true constitue une surface de notifications falsifiables à revoir distinctement. |
| quotes INSERT/UPDATE | `js/fixeo-supabase-core.js:638/644/733/737` ; `js/fixeo-dashboard-v2.js:920` | Préserver le cycle de devis existant. |
| artisans UPDATE | Profil/availability frontend, public read ; Admin INSERT/DELETE par is_admin | Préserver. Étudier séparément les champs modifiables par le propriétaire. |
| artisan_profiles CRUD | Lectures publiques, insert/update personnel ou Admin, delete Admin | Préserver authenticated. Les CRUD anon sans policy autorisante sont des grants dormants, retrait différé. |
| payments CRUD | RLS INSERT/UPDATE/DELETE Admin ; SELECT parties liées/Admin. Aucun appel frontend direct prouvé dans la recherche actuelle | Retrait CRUD non proposé : preuve d’absence de consommateur insuffisante. Le code de paiement API ne prouve pas à lui seul un usage de cette table. |
| enterprise_accounts | SELECT authenticated membres/Admin ; pas de CRUD générique frontend accordé hors SELECT | Conserver SELECT, retirer seulement MAINTAIN. |
| enterprise_audit_events | SELECT authenticated selon RLS ; écritures via helper privilégié | Conserver SELECT, retirer seulement MAINTAIN. |
| enterprise_members / sites / member_sites / invitations / request_context / request_sla | Lectures RLS/colonnes ; opérations métier via RPC/helpers actuels | Aucun retrait CRUD proposé. Le shell Phase 2B lit users/members/accounts. |
| enterprise_sla_policies | INSERT/UPDATE manager et Admin par RLS, SELECT membres/sites | Préserver les grants existants ; aucune migration générale vers « tout RPC » dans S0. |
| enterprise_leads | API/formulaires historiques et RLS Admin canonique | Préserver. |
| dispatch_execution_queue / dispatch_notification_outbox | Aucun droit navigateur ; triggers/RPC/worker et API Diagnostic/urgent via service_role | Déjà privilégiées : aucun REVOKE supplémentaire. |

Les DELETE/UPDATE accordés à anon mais bloqués par RLS sont signalés dans la matrice. Ils ne sont pas retirés sur une simple absence de résultat de recherche. Un audit de consommation CRUD complet doit précéder une réduction ultérieure.

## Défauts et risques résiduels

Les default ACL de `postgres` et `supabase_admin` dans `public` donnent encore aux rôles anon/authenticated des droits larges sur les futures tables/fonctions. Le patch ne modifie pas ALTER DEFAULT PRIVILEGES : ce changement affecterait tous les futurs objets et doit être séparément revu. Toute migration B1 devra déclarer explicitement ses ACL et ses policies dans la même transaction.

Aucun CREATE effectif pour anon/authenticated sur public ou fixeo_private. Trois fonctions dispatch encore `search_path=public` sont uniquement privilégiées : action_preview, expire_contacted, fallback_router. Leurs références métier observées sont qualifiées ; aucun ALTER FUNCTION S0. Un durcissement général du search_path reste distinct.
