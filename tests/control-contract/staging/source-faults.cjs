'use strict';
// Generate staging-only reversible fault injection. Never a Production migration.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [ref,output]=process.argv.slice(2);assert.equal(ref,'kqyhusnbybsukbcaoqtu');
const sql=fs.readFileSync(path.join(__dirname,'../../../supabase/migrations/20260928212728_control_os_b1_projections.sql'),'utf8');
const original=sql.slice(sql.indexOf('CREATE FUNCTION public.control_summary_v1'),sql.indexOf('CREATE FUNCTION fixeo_private.control_action_type_v1'));
const helper=original.replace('public.control_summary_v1','fixeo_private.control_staging_summary_origin_v1');
const signature='public.control_summary_v1(p_source text,p_classification text DEFAULT \'all\') RETURNS jsonb';
const fault=`BEGIN;
${helper}
REVOKE ALL ON FUNCTION fixeo_private.control_staging_summary_origin_v1(text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION ${signature}
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_classification='internal' THEN
  IF p_source='artisans' THEN RAISE EXCEPTION 'SYNTHETIC_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_source='trust' THEN RAISE EXCEPTION 'SYNTHETIC_SOURCE_ERROR'; END IF;
  IF p_source='finance' THEN PERFORM pg_sleep(7); END IF;
 END IF;
 result:=fixeo_private.control_staging_summary_origin_v1(p_source,p_classification);
 IF p_classification='internal' AND p_source='requests' THEN result:=result||jsonb_build_object('as_of',now()-interval '2 minutes'); END IF;
 IF p_classification='internal' AND p_source='missions' THEN result:=result||jsonb_build_object('completeness','page'); END IF;
 RETURN result;
END $$;
COMMIT;`;
const restore='BEGIN;\n'+original.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')+'\nDROP FUNCTION fixeo_private.control_staging_summary_origin_v1(text,text);\nCOMMIT;';
fs.writeFileSync(output+'-inject.sql',fault);fs.writeFileSync(output+'-restore.sql',restore);
console.log(JSON.stringify({project_ref:ref,fault_scope:'classification=internal',restore_prepared:true}));
