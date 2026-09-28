/**
 * FIXEO Artisan OS Final Master — Blocks I → P transversal contracts.
 * Run: node data/pricing/ux/prototype/tests/artisan-os-v3-functional-tests.js
 */
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../../../../..');
const biz=fs.readFileSync(path.join(ROOT,'js/fixeo-artisan-business-os-v2.js'),'utf8');
const dash=fs.readFileSync(path.join(ROOT,'js/fixeo-artisan-dashboard-v2.js'),'utf8');
const bizCss=fs.readFileSync(path.join(ROOT,'css/fixeo-artisan-business-os-v2.css'),'utf8');
const finalCss=fs.readFileSync(path.join(ROOT,'css/fixeo-artisan-final-master-v1.css'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'dashboard-artisan-v2.html'),'utf8');
const migration=fs.readFileSync(path.join(ROOT,'supabase/migrations/20260928142000_artisan_os_account_security_block_i.sql'),'utf8');
let pass=0,fail=0;
function test(name,fn){try{fn();pass++;console.log('PASS',name)}catch(e){fail++;console.error('FAIL',name,'—',e.message)}}
function ok(v,m){if(!v)throw new Error(m||'assertion failed')}

test('business JS parses',()=>new Function(biz));
test('dashboard JS parses',()=>new Function(dash));
test('Final Master business runtime V4',()=>ok(biz.includes("VERSION='v4.0'")));
test('canonical personal business tables',()=>['artisan_business_clients','artisan_business_quotes','artisan_business_jobs','artisan_business_ledger'].forEach(x=>ok(biz.includes(x),x)));
test('personal source selectors',()=>{
  ok(biz.includes("function personalQuotes(){return state.quotes.filter(x=>x.source==='personal')}"));
  ok(biz.includes("function personalJobs(){return state.jobs.filter(x=>x.source==='personal')}"));
  ok(biz.includes("function personalLedger(){return state.ledger.filter(x=>x.source==='personal')}"));
});
test('no direct marketplace writes from personal OS',()=>{
  ok(!biz.includes(".from('service_requests')"));
  ok(!biz.includes(".from('missions')"));
  ok(!biz.includes(".from('quotes')"));
});

/* Block I — Account & Security */
test('account section exists',()=>{ok(html.includes('data-section="account"'));ok(html.includes('id="fxav2-sec-account"'));ok(dash.includes("_renderAccountSection()"))});
test('phone changes use governed RPC',()=>ok(dash.includes("rpc('update_my_artisan_contact_v1'")));
test('email change stays under Auth authority',()=>ok(dash.includes("auth.updateUser({email:next})")));
test('email public copy reconciles from Auth only',()=>ok(dash.includes("rpc('sync_my_account_email_v1')")));
test('password reauthenticates before update',()=>{ok(dash.includes("auth.signInWithPassword"));ok(dash.includes("auth.updateUser({password:next})"))});
test('account UI never mutates role directly',()=>{ok(!dash.includes(".from('users').update({role"));ok(!dash.includes(".from('profiles').update({role"))});
test('account migration locks RPC exposure',()=>{
  ok(migration.includes('revoke all on function public.update_my_artisan_contact_v1(text) from public, anon'));
  ok(migration.includes('revoke all on function public.sync_my_account_email_v1() from public, anon'));
  ok(migration.includes('where a.owner_user_id = v_uid'));
});

/* Blocks J/K — Shell & Desktop */
test('premium account header control exists',()=>ok(html.includes('id="fxaf-account-chip"')&&html.includes('data-section="account"')));
test('header identity bound to real artisan state',()=>ok(dash.includes("fxaf-account-chip-name")&&dash.includes("ap.availability")));
test('premium header styles',()=>ok(finalCss.includes('BLOCK J — PREMIUM HEADER & SHELL')&&finalCss.includes('.fxao-rafi-head,.fxav2-bell-btn')));
test('desktop scrollbar is optical not white',()=>ok(finalCss.includes('.fxa-sidebar::-webkit-scrollbar')&&finalCss.includes('scrollbar-color')));
test('desktop content width is bounded',()=>ok(finalCss.includes('max-width:1260px')));
test('desktop modals are centered and bounded',()=>ok(finalCss.includes('.fxa-modal-overlay>div')&&finalCss.includes('max-width:680px')));

/* Block L — Devis Studio */
test('quote line types complete',()=>['value="service"','value="supply"','value="labor"'].forEach(x=>ok(biz.includes(x),x)));
test('inline client creation in quote',()=>{ok(biz.includes('quote-inline-client'));ok(biz.includes('inline_client_name'));ok(biz.includes("from('artisan_business_clients').insert"))});
test('quote duplication',()=>ok(biz.includes('async function duplicateQuote')));
test('professional quote preview parties',()=>ok(biz.includes('fxbo-document-parties')&&biz.includes("ARTISAN")&&biz.includes("CLIENT")));
test('accepted personal quote uses governed RPC',()=>ok(biz.includes("rpc('artisan_business_accept_quote'")));

/* Block M — CRM & Agenda */
test('CRM client actions include quote and intervention',()=>{ok(biz.includes('data-biz="quote-for-client"'));ok(biz.includes('data-biz="job-for-client"'))});
test('CRM history exists',()=>ok(biz.includes('fxbo-history')));
test('Agenda is personal-only and grouped',()=>{
  ok(biz.includes('let rows=[...personalJobs()].sort'));
  ['Aujourd’hui','À venir','À planifier','Récemment terminées'].forEach(x=>ok(biz.includes(x),x));
});
test('completed job proposes income when absent',()=>ok(biz.includes("income-for-job")));

/* Block N — Finance */
test('Finance uses personal ledger only',()=>ok(biz.includes('return personalLedger().filter')));
test('Finance links client job quote',()=>{ok(biz.includes("client_id:f.get('client_id')"));ok(biz.includes("job_id:f.get('job_id')"));ok(biz.includes("quote_id:f.get('quote_id')"))});
test('Finance quick periods exist',()=>['Ce mois','Mois précédent'].forEach(x=>ok(biz.includes(x),x)));
test('Finance movement edit exists',()=>ok(biz.includes('ledger-edit')&&biz.includes("from('artisan_business_ledger').update(obj)")));
test('FIXEO revenue remains separate',()=>{ok(biz.includes('Revenus FIXEO'));ok(biz.includes('data-section="revenus"'))});

/* Block O — RAFI */
test('RAFI builds ordered real-state priority list',()=>ok(biz.includes('function businessPriorities()')));
test('RAFI caps secondary actions to two',()=>ok(biz.includes('list.slice(1,3)')));
test('RAFI has no fake score or price generator',()=>ok(!/Math\.random|mockPrice|fakeScore|syntheticPrice/i.test(biz)));

/* Mobile / Final */
test('safe areas retained',()=>ok(bizCss.includes('safe-area-inset-bottom')||finalCss.includes('safe-area-inset-bottom')));
test('sticky mobile form CTA retained',()=>ok(bizCss.includes('.fxbo-form>.fxa-btn[type="submit"]')));
test('mobile quote studio responsive',()=>ok(finalCss.includes('BLOCK L — DEVIS STUDIO FINAL')&&finalCss.includes('@media(max-width:520px)')));
test('final master CSS loaded',()=>ok(html.includes('fixeo-artisan-final-master-v1.css?v=artisan-final-p')));
test('dashboard final asset loaded',()=>ok(html.includes('fixeo-artisan-dashboard-v2.js?v=artisan-final-p')));
test('business final asset loaded',()=>ok(html.includes('fixeo-artisan-business-os-v2.js?v=artisan-business-os6')));

console.log('\nArtisan OS Final Master:',pass,'PASS /',fail,'FAIL');
if(fail)process.exit(1);
