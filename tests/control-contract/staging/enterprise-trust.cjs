'use strict';
const c=require('./checks.cjs'),{assert,syntheticId:id}=c;
const success=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r;};
const dossier=async(type,target)=>c.ok(await c.control('dossier',{type,id:target}));
const tests=[];
tests.push(['Two tenants and site scope isolate accounts, sites, ERC, workforce and reporting',async()=>{
 const actors=['enterprise_owner','enterprise_operations','enterprise_viewer','enterprise_site_manager'];
 for(const actor of actors){
  for(const table of ['enterprise_sites','enterprise_request_context','enterprise_workforce_workers']){
   const rows=c.ok(await c.select(actor,table,'select=enterprise_id'));assert.ok(rows.length>0);assert.ok(rows.every(x=>x.enterprise_id===id(300)));
  }
  success(c.ok(await c.rpc(actor,'get_enterprise_operational_summary',{p_enterprise_id:id(300)})));
  c.denied(await c.rpc(actor,'get_enterprise_operational_summary',{p_enterprise_id:id(301)}));
 }
 const a=c.ok(await c.select('enterprise_site_manager','enterprise_sites','select=id'));assert.deepEqual(a.map(x=>x.id),[id(310)]);
 c.denied(await c.rpc('enterprise_site_manager','get_enterprise_operational_summary',{p_enterprise_id:id(300),p_site_id:id(312)}));
 for(const actor of ['enterprise_b_owner','enterprise_b_operations','enterprise_b_viewer']){
  const rows=c.ok(await c.select(actor,'enterprise_request_context','select=enterprise_id'));assert.ok(rows.length>0);assert.ok(rows.every(x=>x.enterprise_id===id(301)));
  c.denied(await c.rpc(actor,'get_enterprise_operational_summary',{p_enterprise_id:id(300)}));
 }
}]);
tests.push(['Global Admin supervises minimally without a tenant membership or dispatch delegation',async()=>{
 for(const n of [300,301])assert.equal((await dossier('enterprise',id(n))).summary.id,id(n));
 assert.equal(c.ok(await c.select('admin','enterprise_members','select=id&user_id=eq.'+c.uid('admin'))).length,0);
 c.denied(await c.rpc('admin','assign_enterprise_internal_worker_v1',{p_enterprise_id:id(300),p_request_id:id(171),p_worker_id:id(330)}));
 c.denied(await c.control('action/preview',{capability:'request.dispatch',target_id:id(171),payload:{reason:'Synthetic undelegated action',artisan_id:id(20)}}));
 for(const actor of ['enterprise_viewer','enterprise_site_manager','enterprise_b_owner'])c.denied(await c.rpc(actor,'assign_enterprise_internal_worker_v1',{p_enterprise_id:id(300),p_request_id:id(171),p_worker_id:id(330)}));
}]);
tests.push(['Internal versus external concurrent acceptance leaves one canonical winner',async()=>{
 const responses=await Promise.all([c.rpc('artisan','claim_mission',{p_mission_id:id(630)}),c.rpc('enterprise_operations','assign_enterprise_internal_worker_v1',{p_enterprise_id:id(300),p_request_id:id(170),p_worker_id:id(330)})]);
 assert.equal(responses.filter(x=>x.status===200&&x.data.ok).length,1,JSON.stringify(responses.map(x=>x.data)));
 const ms=c.ok(await c.select('admin','missions','select=id,status&request_id=eq.'+id(170))),ias=c.ok(await c.select('enterprise_owner','enterprise_internal_assignments','select=id,status&service_request_id=eq.'+id(170)));
 assert.equal(ms.filter(x=>x.status==='pending').length+ias.filter(x=>x.status==='assigned').length,1);
 const facts=c.ok(await c.rpc('enterprise_owner','enterprise_request_sla_facts_v1',{p_request_id:id(170)}));assert.equal(facts.internal_winners+facts.external_winners,1);assert.ok(facts.acceptance_at);
}]);
tests.push(['Enterprise internal lifecycle and SLA facts reuse the tenant authorities',async()=>{
 const made=success(c.ok(await c.rpc('enterprise_operations','create_enterprise_request_hybrid',{p_enterprise_id:id(300),p_site_id:id(310),p_service_category:'plomberie',p_description:'SYNTHETIC_INTERNAL_LIFECYCLE',p_urgency:'urgent'})));const rid=made.service_request_id;
 const args={p_enterprise_id:id(300),p_request_id:rid,p_worker_id:id(330)};success(c.ok(await c.rpc('enterprise_operations','assign_enterprise_internal_worker_v1',args)));
 const transition=(actor,status)=>c.rpc(actor,'set_enterprise_internal_assignment_status_v1',{p_enterprise_id:id(300),p_request_id:rid,p_status:status});
 c.denied(await transition('enterprise_viewer','in_progress'));c.denied(await transition('admin','in_progress'));c.denied(await transition('enterprise_b_owner','in_progress'));
 success(c.ok(await transition('workforce','in_progress')));success(c.ok(await transition('workforce','completed')));c.denied(await transition('workforce','validated'));success(c.ok(await transition('enterprise_owner','validated')));
 const facts=c.ok(await c.rpc('enterprise_owner','enterprise_request_sla_facts_v1',{p_request_id:rid}));assert.ok(facts.acceptance_at&&facts.execution_started_at&&facts.resolved_at);assert.equal(facts.internal_winners,1);assert.equal(facts.start_sla,'not_configured');assert.equal(facts.resolution_sla,'not_configured');
 assert.equal((await dossier('request',rid)).summary.status,'validated');c.denied(await c.rpc('enterprise_b_viewer','enterprise_request_sla_facts_v1',{p_request_id:rid}));
}]);
tests.push(['Enterprise producer preserves ERC, hybrid dispatch policy and SLA snapshots',async()=>{
 const args={p_enterprise_id:id(300),p_site_id:id(310),p_service_category:'plomberie',p_description:'SYNTHETIC_ENTERPRISE_HYBRID',p_urgency:'urgent'};
 c.denied(await c.rpc('enterprise_b_owner','create_enterprise_request_hybrid',args));c.denied(await c.rpc('enterprise_viewer','create_enterprise_request_hybrid',args));
 const made=success(c.ok(await c.rpc('enterprise_operations','create_enterprise_request_hybrid',args)));assert.ok(made.service_request_id);assert.ok(made.dispatch);
 const context=c.ok(await c.select('enterprise_owner','enterprise_request_context','select=enterprise_id,site_id,service_request_id&service_request_id=eq.'+made.service_request_id))[0];assert.equal(context.enterprise_id,id(300));assert.equal(context.site_id,id(310));
 const states=c.ok(await c.select('enterprise_owner','enterprise_hybrid_dispatch_state','select=mode,status&service_request_id=eq.'+made.service_request_id));assert.equal(states.length,1);assert.equal(states[0].mode,'hybrid');
 const f=c.ok(await c.rpc('enterprise_owner','enterprise_request_sla_facts_v1',{p_request_id:made.service_request_id}));assert.ok(f.acceptance_due_at);
}]);
tests.push(['Artisan multiactivity, availability and photo use owner RPCs; verification aligns legacy',async()=>{
 const divergent=(await dossier('artisan',id(24))).summary;assert.equal(divergent.verified,false);assert.equal(divergent.verification_conflict,true);
 const aligned=success(await c.command('artisan.verify',id(24)));assert.equal(aligned.verified.verified,true);assert.equal(aligned.verified.verification_conflict,false);
 success(c.ok(await c.rpc('artisan','update_my_artisan_activity_v1',{p_services:['plomberie','electricite'],p_cities:['Fès','Rabat']})));
 const a=(await dossier('artisan',id(20))).summary;assert.deepEqual(new Set(a.services),new Set(['plomberie','electricite']));assert.deepEqual(new Set(a.cities),new Set(['Fès','Rabat']));
 c.denied(await c.rpc('client','update_my_artisan_activity_v1',{p_services:['plomberie'],p_cities:['Fès']}));
 success(c.ok(await c.rpc('artisan','update_artisan_availability',{p_status:'unavailable'})));assert.equal((await dossier('artisan',id(20))).summary.availability,'unavailable');
 success(c.ok(await c.rpc('artisan','update_artisan_availability',{p_status:'available'})));
 const own=`${c.config.url}/storage/v1/object/public/artisan-media/profiles/${c.uid('artisan')}/avatar.jpg`;
 assert.equal(c.ok(await c.rpc('artisan','update_my_artisan_photo_v1',{p_photo_url:own})).photo_url,own);
 c.denied(await c.rpc('artisan_other','update_my_artisan_photo_v1',{p_photo_url:own}));c.denied(await c.rpc('admin','update_my_artisan_photo_v1',{p_photo_url:own}));
 c.denied(await c.request('/rest/v1/artisans?id=eq.'+id(20),{actor:'artisan',method:'PATCH',body:{full_name:'UNAUTHORIZED_GENERAL_UPDATE',verified:true}}));
}]);
tests.push(['Claims legacy resolution, rejection and existing owner protection',async()=>{
 success(await c.command('claim.reject',id(201)));assert.equal((await dossier('claim',id(201))).summary.status,'rejected');
 const blocked=await c.command('claim.approve',id(202));assert.equal(blocked.ok,false);assert.equal(blocked.code,'artisan_has_owner');
 const approved=success(await c.command('claim.approve',id(200)));assert.ok(approved.audit_id);assert.equal(approved.result.artisan_id,id(22));
 const owner=c.ok(await c.select('claimant_a','artisans','select=id,owner_user_id,verified,onboarding_completed&id=eq.'+id(22)))[0];assert.equal(owner.owner_user_id,c.uid('claimant_a'));assert.equal(owner.verified,false);assert.equal(owner.onboarding_completed,false);
}]);
tests.push(['Concurrent claims lock the profile and produce one approved owner',async()=>{
 const [a,b]=await Promise.all([c.preview('claim.approve',id(203)),c.preview('claim.approve',id(204),{},'admin_other')]);
 const results=(await Promise.all([c.execute(a),c.execute(b,'admin_other')])).map(x=>x.data);assert.equal(results.filter(x=>x.ok).length,1);
 const claims=c.ok(await c.select('admin','claim_requests','select=id,status&artisan_id=eq.'+id(23)));assert.equal(claims.filter(x=>x.status==='approved').length,1);assert.ok(claims.some(x=>x.status==='superseded_by_approval'));
 assert.equal((await dossier('artisan',id(23))).summary.has_owner,true);
}]);
c.run('enterprise-trust',tests);
