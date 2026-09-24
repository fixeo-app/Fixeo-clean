# Function inventory — Production read-only

Baseline main/Production : `cb55e54cafb3792ed561b21b0da6bc104599d2e7`. Catalogue capturé le 2026-09-24T00:27:14.805844+00:00.

Périmètre exhaustif de noms : `public` + `proname ILIKE '%dispatch%'` + `prokind='f'`, soit **29 fonctions**, y compris les préfixes accept/get/admin/trigger/enqueue. Aucun nouvel objet dans le patch.

Définitions intégrales exactes et MD5 : [production-readonly.json](production-readonly.json), `functions.functions`. Les ACL directes détaillent grantor/grantee/grantable. Ci-dessous : **EXECUTE effectif**, héritage/PUBLIC inclus. PUBLIC est évalué avec `aclexplode`, les rôles réels avec `has_function_privilege`. Aucun parent accordé à anon/authenticated/service_role.

## Matrice de décision

| Fonction (signature exacte) | PUBLIC | anon | authenticated | service_role | postgres | Statut cible |
| --- | --- | --- | --- | --- | --- | --- |
| `public.accept_my_dispatch_offer_v1(uuid)` | false | false | true | true | true | AUTHENTICATED ONLY |
| `public.admin_targeted_dispatch_v1(uuid,uuid)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.auto_dispatch_service_request_v1()` | true → false | true → false | true → false | true | true | TRIGGER INTERNAL |
| `public.dispatch_accept_winner_v1(uuid,uuid)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_action_preview_v1(uuid)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_advance_v1(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_batch_preview_v1(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_candidate_pool_v1(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_claim_notification_v1(text)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_enqueue_notifications_v1(uuid,text)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_execute_v1(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_execution_plan_v1(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_expire_contacted_v1(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_fallback_router_v1(uuid)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_finalize_notification_v1(uuid,text,text,text)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_notification_worker_next_v1(text)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_notification_worker_peek_v1(text)` | true → false | true → false | true → false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_preview_recruitment_v1(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_preview_v1(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_preview_v2(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_preview_v21(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_queue_transition_v1(uuid,uuid,text)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_release_next_batch_v1(uuid)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_request_v1(uuid)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.dispatch_request_v1_backup_20260821(uuid)` | false | true → false | true → false | true | true | OBSOLETE / REMOVE LATER |
| `public.dispatch_retry_failed_notification_v1(uuid,integer)` | false | false | false | true | true | SERVICE_ROLE ONLY |
| `public.enqueue_dispatch_notification_from_mission_v1()` | true → false | true → false | true → false | true | true | TRIGGER INTERNAL |
| `public.get_my_dispatch_offers_v1()` | false | false | true | true | true | AUTHENTICATED ONLY |
| `public.trigger_dispatch_v2_on_service_request()` | true → false | true → false | true → false | true | true | TRIGGER INTERNAL |

**KEEP PUBLIC : aucune fonction dispatch.** « AUTHENTICATED ONLY » décrit l’accès navigateur ; service_role/postgres restent autorisés. Le backup est dépréciable mais non supprimé ; il devient effectivement privilégié uniquement. Les trois fonctions trigger gardent propriétaire/service_role pour administration ; leur exécution par un trigger existant ne nécessite pas EXECUTE pour le navigateur.

## Détails par fonction

### `public.accept_my_dispatch_offer_v1(uuid)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `jsonb` |
| Définition MD5 | `fb687ccb39f93e52b1868b6845d381a6` |
| Usage / décision | Navigateur Artisan : acceptation de sa propre offre ; auth.uid() → artisans.owner_user_id. Verrouille demande et offre, insère mission pending, assigne demande, annule les concurrents. |
| Appelants applicatifs / attachement | js/fixeo-artisan-dashboard-v2.js:1556 |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Écrit missions, service_requests et dispatch_execution_queue ; lit les identifiants et statuts liés. |
| Callable navigateur souhaité | OUI, session Artisan personnelle |
| Statut | AUTHENTICATED ONLY |

### `public.admin_targeted_dispatch_v1(uuid,uuid)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `jsonb` |
| Définition MD5 | `3997ba68de5e98391c379e43f1a97a0d` |
| Usage / décision | Ciblage Admin via API protégée ; le contrôle public.users.role est effectué par le handler. Aucun EXECUTE anon/authenticated actuel. |
| Appelants applicatifs / attachement | api/admin-targeted-dispatch-fn/index.js:198 ; js/fixeo-dispatch-engine.js utilise /api/admin/requests/assign |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | `dispatch_request_v1(uuid)` |
| Lecture/écriture sensible | Lit demandes/artisans/missions ; écrit ciblage et statuts, appelle dispatch_request_v1. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.auto_dispatch_service_request_v1()`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `trigger` |
| Définition MD5 | `2d3dd0b1ecd3082ae3b504fdf4f7fb9a` |
| Usage / décision | Ancien chemin V1 non attaché actuellement. Candidat à dépréciation séparée ; aucune suppression S0. |
| Appelants applicatifs / attachement | Aucun trigger attaché, aucun appel applicatif trouvé. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | `dispatch_request_v1(uuid)` |
| Lecture/écriture sensible | Délègue une écriture de mission à dispatch_request_v1 pour NEW.status=new. |
| Callable navigateur souhaité | NON |
| Statut | TRIGGER INTERNAL |

### `public.dispatch_accept_winner_v1(uuid,uuid)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(request_id uuid, winner_artisan_id uuid, winner_status text, cancelled_others integer)` |
| Définition MD5 | `c1ac3cf4ecd9023812b9024da6fb6ab0` |
| Usage / décision | Transition interne de gagnant dans la queue ; aucun navigateur nécessaire. |
| Appelants applicatifs / attachement | Aucun appelant externe explicite trouvé dans le repo audité. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lit/verrouille et modifie dispatch_execution_queue ; annule les autres candidats. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_action_preview_v1(uuid)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `sql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=public"]` |
| Return type | `TABLE(request_id uuid, raw_request_category text, resolved_request_category text, request_city text, candidate_count bigint, dispatch_state text, recommended_action text)` |
| Définition MD5 | `819a359ef633355e6566ea2694b11a40` |
| Usage / décision | Prévisualisation des actions/fallback ; ne modifie rien dans son corps. |
| Appelants applicatifs / attachement | Appelants externes non trouvés. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | `dispatch_fallback_router_v1(uuid)` |
| Lecture/écriture sensible | Lit la demande, le comptage des candidats et le routage via dispatch_fallback_router_v1. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_advance_v1(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(request_id uuid, expired_count integer, active_count integer, released_batch integer, released_count integer, advance_state text)` |
| Définition MD5 | `8d0e8339dcc5fa64444e0486a1a02094` |
| Usage / décision | Avancement interne des vagues ; pas un endpoint navigateur. |
| Appelants applicatifs / attachement | Appelants externes non trouvés. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | `dispatch_expire_contacted_v1(uuid,integer)`, `dispatch_release_next_batch_v1(uuid)` |
| Lecture/écriture sensible | Lit/verrouille la queue ; écrit indirectement via expiration et libération de lot. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_batch_preview_v1(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `sql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(request_id uuid, match_rank integer, batch_number integer, position_in_batch integer, batch_action text, artisan_id uuid, artisan_name text, contact_phone text, artisan_category text, artisan_city text, work_zone text, service_score integer, geography_score integer, profile_score integer, final_score integer, has_photo boolean, is_public boolean, claimed boolean, claim_status text)` |
| Définition MD5 | `45556629acb56322781037bcaf28f615` |
| Usage / décision | Calcule les lots depuis le pool de candidats. |
| Appelants applicatifs / attachement | Appelants SQL listés ci-dessous. |
| Appelants SQL explicites trouvés | `dispatch_execution_plan_v1(uuid,integer)`, `dispatch_release_next_batch_v1(uuid)` |
| Fonctions appelées explicitement | `dispatch_candidate_pool_v1(uuid,integer)` |
| Lecture/écriture sensible | Lecture de candidats avec noms, téléphones, localisation et scores. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_candidate_pool_v1(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `sql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(request_id uuid, match_rank integer, artisan_id uuid, artisan_name text, contact_phone text, artisan_category text, artisan_city text, work_zone text, service_score integer, geography_score integer, profile_score integer, final_score integer, has_photo boolean, is_public boolean, claimed boolean, claim_status text)` |
| Définition MD5 | `4f8651df3f4e4c708bddc6f48abc29df` |
| Usage / décision | Enveloppe le ranking V2.1 pour le moteur interne. |
| Appelants applicatifs / attachement | Appelants SQL listés ci-dessous. |
| Appelants SQL explicites trouvés | `dispatch_batch_preview_v1(uuid,integer)` |
| Fonctions appelées explicitement | `dispatch_preview_v21(uuid,integer)` |
| Lecture/écriture sensible | Lecture de candidats, contacts et scores. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_claim_notification_v1(text)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(notification_id uuid, request_id uuid, artisan_id uuid, channel text, notification_type text, notification_status text, attempt_count integer, claimed_at timestamp with time zone)` |
| Définition MD5 | `cc3eb9945719211bb9419b83f7adbc0a` |
| Usage / décision | Claim interne de notification ; réservation avec SKIP LOCKED. |
| Appelants applicatifs / attachement | Appelants externes non trouvés ; ne pas déduire obsolescence. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lit et écrit dispatch_notification_outbox, statut/compteur/horodatages. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_enqueue_notifications_v1(uuid,text)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(request_id uuid, artisan_id uuid, notification_id uuid, notification_status text)` |
| Définition MD5 | `67a1555ebc687268e4fdf831cbf95350` |
| Usage / décision | Prépare l’outbox à partir de la queue. |
| Appelants applicatifs / attachement | Appelants externes non trouvés. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lit la queue et insère dispatch_notification_outbox. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_execute_v1(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(request_id uuid, artisan_id uuid, match_rank integer, execution_priority integer, execution_status text)` |
| Définition MD5 | `45caaf10a9b0b5656a5a77faad4ab2f5` |
| Usage / décision | Entrée canonique V2 : crée les opportunités QUEUED pour SEND_NOW. |
| Appelants applicatifs / attachement | api/urgent-request-fn/index.js:149 ; trigger service_requests |
| Appelants SQL explicites trouvés | `trigger_dispatch_v2_on_service_request()` |
| Fonctions appelées explicitement | `dispatch_execution_plan_v1(uuid,integer)` |
| Lecture/écriture sensible | Lit le plan/candidats ; insère dispatch_execution_queue, retourne les opportunités. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_execution_plan_v1(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `sql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(request_id uuid, match_rank integer, batch_number integer, position_in_batch integer, batch_action text, execution_action text, execution_priority integer, artisan_id uuid, artisan_name text, contact_phone text, artisan_category text, artisan_city text, work_zone text, final_score integer)` |
| Définition MD5 | `b7f257ffd0dfe6d4d4f8f3e204928497` |
| Usage / décision | Plan interne SEND_NOW/HOLD. |
| Appelants applicatifs / attachement | Appelé par dispatch_execute_v1. |
| Appelants SQL explicites trouvés | `dispatch_execute_v1(uuid,integer)` |
| Fonctions appelées explicitement | `dispatch_batch_preview_v1(uuid,integer)` |
| Lecture/écriture sensible | Lecture des lots, noms, téléphones et scores. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_expire_contacted_v1(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=public"]` |
| Return type | `TABLE(request_id uuid, artisan_id uuid, previous_status text, execution_status text, updated_at timestamp with time zone)` |
| Définition MD5 | `dd765802f9f3ac7720565e9a9535660f` |
| Usage / décision | Expiration interne des contacts après timeout. |
| Appelants applicatifs / attachement | Appelé par dispatch_advance_v1. |
| Appelants SQL explicites trouvés | `dispatch_advance_v1(uuid,integer)` |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Écrit dispatch_execution_queue. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_fallback_router_v1(uuid)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `sql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=public"]` |
| Return type | `TABLE(request_id uuid, raw_request_category text, resolved_request_category text, request_city text, candidate_count bigint, dispatch_state text)` |
| Définition MD5 | `c3f773283af640eb229f8c8e5867f142` |
| Usage / décision | État de fallback et comptage de candidats. |
| Appelants applicatifs / attachement | Appelé par dispatch_action_preview_v1. |
| Appelants SQL explicites trouvés | `dispatch_action_preview_v1(uuid)` |
| Fonctions appelées explicitement | `dispatch_preview_v21(uuid,integer)`, `resolve_service_category_v1(text,text)` |
| Lecture/écriture sensible | Lit service_requests et le preview V2.1 ; pas de DML. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_finalize_notification_v1(uuid,text,text,text)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(notification_id uuid, request_id uuid, artisan_id uuid, previous_status text, notification_status text, attempt_count integer, provider_message_id text, last_error text, sent_at timestamp with time zone, updated_at timestamp with time zone)` |
| Définition MD5 | `386779f1ef68faa3bf4d4bdde1edae76` |
| Usage / décision | Finalisation interne d’une notification après envoi/échec. |
| Appelants applicatifs / attachement | Appelants externes non trouvés. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lit/verrouille et écrit outbox ; provider_message_id et last_error potentiellement sensibles. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_notification_worker_next_v1(text)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(notification_id uuid, request_id uuid, artisan_id uuid, contact_phone text, notification_type text, channel text, notification_status text, attempt_count integer, claimed_at timestamp with time zone)` |
| Définition MD5 | `d4bec3cffe34e4e8b1a81d7820f00bea` |
| Usage / décision | Worker de claim avec contact ; ne pas confondre avec peek utilisé par le handler déployé. |
| Appelants applicatifs / attachement | Aucun appel actif trouvé ; le texte d’erreur du handler mentionne encore NEXT mais sa requête utilise PEEK. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lit artisans/contact_phone et écrit outbox avec SKIP LOCKED. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_notification_worker_peek_v1(text)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(notification_id uuid, request_id uuid, artisan_id uuid, contact_phone text, notification_type text, channel text, notification_status text, attempt_count integer, claimed_at timestamp with time zone)` |
| Définition MD5 | `63e20362d42a57f6add5201a76886c95` |
| Usage / décision | Worker de lecture. Aucun filtrage utilisateur/tenant ; privilèges actuels trop ouverts. Révoquer PUBLIC/anon/authenticated. |
| Appelants applicatifs / attachement | api/dispatch-whatsapp-worker-fn/index.js:50 ; route /api/dispatch-whatsapp-worker |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Retourne la première notification PENDING éligible (attempt_count<3), dont contact_phone=coalesce(phone_public,phone). Aucun UPDATE/claim. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_preview_recruitment_v1(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `sql` |
| SECURITY DEFINER | `false` |
| Volatility | `s` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(match_rank bigint, artisan_id uuid, artisan_name text, contact_phone text, source text, city text, service_category text, work_zone text, availability text, claimed boolean, claim_status text, review_count integer, rating numeric, service_score integer, city_score integer, trust_score integer, activity_score integer, total_score integer)` |
| Définition MD5 | `3c2464b99be80f7cd22e56d902baa32e` |
| Usage / décision | Ancienne prévisualisation recrutement ; conserver restrictive, usage externe non exclu. |
| Appelants applicatifs / attachement | Aucun appelant externe explicite trouvé. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lecture demandes/artisans/missions ; téléphone, identité, source, scores. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_preview_v1(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `sql` |
| SECURITY DEFINER | `false` |
| Volatility | `s` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(match_rank bigint, artisan_id uuid, city text, service_category text, work_zone text, availability text, claimed boolean, claim_status text, onboarding_completed boolean, has_owner boolean, review_count integer, rating numeric, service_score integer, city_score integer, trust_score integer, activity_score integer, total_score integer)` |
| Définition MD5 | `5ece8745cdc44a6e7c86eb4a249a970f` |
| Usage / décision | Prévisualisation V1 ; conserver jusqu’à décision de dépréciation distincte. |
| Appelants applicatifs / attachement | Aucun appelant externe explicite trouvé. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lecture demandes/artisans/missions et indicateurs d’éligibilité ; pas de téléphone dans le type de retour. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_preview_v2(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `sql` |
| SECURITY DEFINER | `false` |
| Volatility | `s` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(match_rank bigint, artisan_id uuid, artisan_name text, contact_phone text, source text, request_category text, request_city text, request_urgency text, artisan_city text, artisan_category text, work_zone text, service_score integer, geography_score integer, profile_score integer, final_score integer, has_photo boolean, is_public boolean, claimed boolean, claim_status text)` |
| Définition MD5 | `cca5b26bd6e478e7b2259645a853dc60` |
| Usage / décision | Prévisualisation V2 ; conserver restrictive. |
| Appelants applicatifs / attachement | Aucun appelant externe explicite trouvé. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lecture candidats avec contact_phone, identité et scoring. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_preview_v21(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `sql` |
| SECURITY DEFINER | `false` |
| Volatility | `s` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(match_rank bigint, artisan_id uuid, artisan_name text, contact_phone text, source text, raw_request_category text, resolved_request_category text, request_city text, request_urgency text, artisan_city text, artisan_category text, work_zone text, service_score integer, geography_score integer, profile_score integer, final_score integer, has_photo boolean, is_public boolean, claimed boolean, claim_status text)` |
| Définition MD5 | `b12c652c927630eb6829de094455b086` |
| Usage / décision | Prévisualisation actuellement utilisée dans le plan V2. |
| Appelants applicatifs / attachement | Appelants SQL listés ci-dessous. |
| Appelants SQL explicites trouvés | `dispatch_candidate_pool_v1(uuid,integer)`, `dispatch_fallback_router_v1(uuid)` |
| Fonctions appelées explicitement | `resolve_service_category_v1(text,text)` |
| Lecture/écriture sensible | Lecture demandes/artisans/missions avec contact_phone ; utilise resolve_service_category_v1. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_queue_transition_v1(uuid,uuid,text)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(request_id uuid, artisan_id uuid, previous_status text, execution_status text, updated_at timestamp with time zone)` |
| Définition MD5 | `01d86f5c39155c5fd88083e23fe84362` |
| Usage / décision | Transitions internes de la queue. |
| Appelants applicatifs / attachement | Appelants externes non trouvés. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Verrouille et écrit dispatch_execution_queue. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_release_next_batch_v1(uuid)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(request_id uuid, released_batch integer, released_count integer)` |
| Définition MD5 | `682e92b17c98f159070b8bccef56b913` |
| Usage / décision | Libération interne du prochain lot. |
| Appelants applicatifs / attachement | Appelé par dispatch_advance_v1. |
| Appelants SQL explicites trouvés | `dispatch_advance_v1(uuid,integer)` |
| Fonctions appelées explicitement | `dispatch_batch_preview_v1(uuid,integer)` |
| Lecture/écriture sensible | Lit/verrouille la queue et les candidats ; insère de nouvelles opportunités. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_request_v1(uuid)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `jsonb` |
| Définition MD5 | `6f15023717f280dda578bb63b75a3108` |
| Usage / décision | Entrée canonique V1 ; conserve ciblage, règles métier et idempotence actuels. |
| Appelants applicatifs / attachement | api/create-request-fn/index.js:274 ; api/estimator-v1/index.js:1535 ; admin_targeted_dispatch_v1 ; auto trigger non attaché |
| Appelants SQL explicites trouvés | `admin_targeted_dispatch_v1(uuid,uuid)`, `auto_dispatch_service_request_v1()` |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lit/verrouille service_requests ; lit artisans/missions ; insère une mission offered, donc déclenche l’outbox. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.dispatch_request_v1_backup_20260821(uuid)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `jsonb` |
| Définition MD5 | `917581213d136778441154feb4e2eb37` |
| Usage / décision | Copie historique nommée backup_20260821, distincte de l’entrée canonique actuelle. Révoquer anon/authenticated ; conserver service_role/postgres, aucun DROP. |
| Appelants applicatifs / attachement | Aucune référence dans le code applicatif/configuration suivi, aucune fonction appelante trouvée, aucun trigger attaché. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | SECURITY DEFINER sans auth.uid()/membership : peut verrouiller une demande et insérer une mission offered, puis outbox par trigger. |
| Callable navigateur souhaité | NON |
| Statut | OBSOLETE / REMOVE LATER |

### `public.dispatch_retry_failed_notification_v1(uuid,integer)`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `TABLE(notification_id uuid, request_id uuid, artisan_id uuid, previous_status text, notification_status text, attempt_count integer, retry_allowed boolean, updated_at timestamp with time zone)` |
| Définition MD5 | `d75f6fd9b4391bf955bba4cb2e64e7ec` |
| Usage / décision | Reprise interne d’une notification en échec. |
| Appelants applicatifs / attachement | Appelants externes non trouvés. |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lit/verrouille et écrit outbox, contrôle le nombre d’essais. |
| Callable navigateur souhaité | NON |
| Statut | SERVICE_ROLE ONLY |

### `public.enqueue_dispatch_notification_from_mission_v1()`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `trigger` |
| Définition MD5 | `a4198a4a9f75c85c5157acc635017a4e` |
| Usage / décision | Fonction du trigger missions ; aucun appel navigateur requis. |
| Appelants applicatifs / attachement | trg_enqueue_dispatch_notification_v1 AFTER INSERT ON missions (enabled O) |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Pour une mission offered : INSERT dans dispatch_notification_outbox, ON CONFLICT DO NOTHING. |
| Callable navigateur souhaité | NON |
| Statut | TRIGGER INTERNAL |

```sql
CREATE TRIGGER trg_enqueue_dispatch_notification_v1 AFTER INSERT ON missions FOR EACH ROW EXECUTE FUNCTION enqueue_dispatch_notification_from_mission_v1();
```

### `public.get_my_dispatch_offers_v1()`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `jsonb` |
| Définition MD5 | `d44c3300bcf9aed5d76d74c334a932ec` |
| Usage / décision | Lecture navigateur Artisan bornée à auth.uid() → artisan propriétaire. Maximum 50 offres, statuts QUEUED/CONTACTED et demande new. |
| Appelants applicatifs / attachement | js/fixeo-artisan-dashboard-v2.js:284 |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | Aucune fonction public/fixeo_private trouvée |
| Lecture/écriture sensible | Lit artisans, queue et service_requests ; résultat volontairement sans contact_phone/description/tracking/commission. |
| Callable navigateur souhaité | OUI, session Artisan personnelle |
| Statut | AUTHENTICATED ONLY |

### `public.trigger_dispatch_v2_on_service_request()`

| Propriété | Valeur exacte / constat |
| --- | --- |
| Owner | `postgres` |
| Language | `plpgsql` |
| SECURITY DEFINER | `true` |
| Volatility | `v` |
| proconfig / search_path | `["search_path=\"\""]` |
| Return type | `trigger` |
| Définition MD5 | `f75d349234426ae0235da3143c610c78` |
| Usage / décision | Fonction réellement attachée à service_requests ; délègue au dispatcher V2. |
| Appelants applicatifs / attachement | trg_dispatch_v2_on_service_request AFTER INSERT ON service_requests (enabled O) |
| Appelants SQL explicites trouvés | Aucun dans les corps audités |
| Fonctions appelées explicitement | `dispatch_execute_v1(uuid,integer)` |
| Lecture/écriture sensible | Pour NEW.status=new : appelle dispatch_execute_v1(NEW.id,3), donc écrit la queue. |
| Callable navigateur souhaité | NON |
| Statut | TRIGGER INTERNAL |

```sql
CREATE TRIGGER trg_dispatch_v2_on_service_request AFTER INSERT ON service_requests FOR EACH ROW EXECUTE FUNCTION trigger_dispatch_v2_on_service_request();
```

## Limites de la preuve des appelants

Les liens PL/pgSQL/SQL stockés comme texte ne sont pas tous matérialisés par `pg_depend`. Le graphe combine dépendances catalogue, lecture des corps (134 fonctions public/fixeo_private), triggers et recherches dans le repo à la baseline. Les statistiques de fonctions ne donnent pas d’historique exploitable. Les appels dynamiques, systèmes externes non connectés et interventions SQL manuelles ne peuvent pas être exclus. Aucune fonction sans appelant visible n’est supprimée.

Le nom du backup et sa différence avec la fonction canonique établissent une copie historique. PostgreSQL ne fournit pas ici de date de création : **2026-08-21 est la date portée par le nom, pas une date de création prouvée**. L’absence de consommateur concerne le périmètre audité. Les flux privilégiés restent autorisés.
