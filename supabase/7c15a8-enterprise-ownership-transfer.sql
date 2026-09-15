-- FIXEO 7C.15A.8 — FINAL Q12/Q15/Q16/Q17 RECHECK
-- 100% READ-ONLY.
-- Tests PostgreSQL-normalized function text without depending on spaces around "=".

WITH rpc AS (
  SELECT pg_catalog.pg_get_functiondef(p.oid) AS def
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='transfer_enterprise_ownership'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)
      ='p_enterprise_id uuid, p_target_member_id uuid'
),
n AS (
  SELECT
    def,
    pg_catalog.regexp_replace(
      pg_catalog.lower(def),
      '[[:space:]]+',
      ' ',
      'g'
    ) AS ndef,
    -- Compact copy used only for equality-sensitive predicates/assignments.
    pg_catalog.regexp_replace(
      pg_catalog.lower(def),
      '[[:space:]]',
      '',
      'g'
    ) AS compact
  FROM rpc
),
p AS (
  SELECT
    def, ndef, compact,
    pg_catalog.strpos(compact, 'em.enterprise_id=p_enterprise_id') AS ent_pos,
    pg_catalog.strpos(compact, 'em.id=p_target_member_id') AS target_pos,
    pg_catalog.strpos(compact, 'setrole=''owner''') AS owner_pos_compact,
    pg_catalog.strpos(compact, 'setrole=''admin''') AS admin_pos_compact,
    pg_catalog.strpos(ndef, 'update public.enterprise_members') AS first_update_pos
  FROM n
),
checks AS (
  SELECT 'F01'::text check_id,
         'RPC found exactly once'::text check_name,
         (SELECT pg_catalog.count(*)=1 FROM rpc) pass,
         pg_catalog.jsonb_build_object(
           'function_count',(SELECT pg_catalog.count(*) FROM rpc)
         ) detail

  UNION ALL
  SELECT 'F02',
         'Q12 target scoped to same enterprise',
         COALESCE((SELECT ent_pos>0 AND target_pos>ent_pos FROM p),false),
         COALESCE((
           SELECT pg_catalog.jsonb_build_object(
             'enterprise_predicate_position',ent_pos,
             'target_predicate_position',target_pos
           ) FROM p
         ),'{}'::jsonb)

  UNION ALL
  SELECT 'F03',
         'Q15 target promoted to owner',
         COALESCE((SELECT owner_pos_compact>0 FROM p),false),
         COALESCE((
           SELECT pg_catalog.jsonb_build_object(
             'owner_assignment_position',owner_pos_compact
           ) FROM p
         ),'{}'::jsonb)

  UNION ALL
  SELECT 'F04',
         'Q16 previous owner demoted to admin',
         COALESCE((SELECT admin_pos_compact>0 FROM p),false),
         COALESCE((
           SELECT pg_catalog.jsonb_build_object(
             'admin_assignment_position',admin_pos_compact
           ) FROM p
         ),'{}'::jsonb)

  UNION ALL
  SELECT 'F05',
         'Q17 promotion occurs before demotion',
         COALESCE((
           SELECT owner_pos_compact>0
              AND admin_pos_compact>0
              AND owner_pos_compact<admin_pos_compact
           FROM p
         ),false),
         COALESCE((
           SELECT pg_catalog.jsonb_build_object(
             'owner_position',owner_pos_compact,
             'admin_position',admin_pos_compact
           ) FROM p
         ),'{}'::jsonb)

  UNION ALL
  SELECT 'F06',
         'installed mutation fragment',
         true,
         COALESCE((
           SELECT pg_catalog.jsonb_build_object(
             'fragment',
             pg_catalog.substr(
               ndef,
               CASE
                 WHEN first_update_pos>120 THEN first_update_pos-120
                 ELSE 1
               END,
               1100
             )
           )
           FROM p
         ),'{}'::jsonb)
)
SELECT check_id,check_name,pass,detail
FROM checks
ORDER BY check_id;
