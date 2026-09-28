/**
 * FIXEO Artisan OS V3.1 — transversal functional contract tests.
 * Run: node data/pricing/ux/prototype/tests/artisan-os-v3-functional-tests.js
 */
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../../../../..');
const js=fs.readFileSync(path.join(ROOT,'js/fixeo-artisan-business-os-v2.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'css/fixeo-artisan-business-os-v2.css'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'dashboard-artisan-v2.html'),'utf8');
let pass=0,fail=0;
function test(name,fn){try{fn();pass++;console.log('PASS',name)}catch(e){fail++;console.error('FAIL',name,'—',e.message)}}
function ok(v,m){if(!v)throw new Error(m||'assertion failed')}

test('JS parses',()=>new Function(js));
test('V3.1 API exposed',()=>ok(js.includes("VERSION='v3.1'")));
test('canonical business tables',()=>['artisan_business_clients','artisan_business_quotes','artisan_business_jobs','artisan_business_ledger'].forEach(x=>ok(js.includes(x),x)));
test('personal quote source filter',()=>ok(js.includes("function personalQuotes(){return state.quotes.filter(x=>x.source==='personal')}")));
test('personal job source filter',()=>ok(js.includes("function personalJobs(){return state.jobs.filter(x=>x.source==='personal')}")));
test('personal ledger source filter',()=>ok(js.includes("function personalLedger(){return state.ledger.filter(x=>x.source==='personal')}")));
test('no recursive personal ledger selector',()=>ok(!js.includes('function personalLedger(){return personalLedger()')));
test('personal writes are explicit',()=>{ok(js.includes("obj.source='personal'"));ok(js.includes("source:'personal',title"));ok(js.includes("source:'personal',entry_type"))});
test('quote line types',()=>['value="service"','value="supply"','value="labor"'].forEach(x=>ok(js.includes(x),x)));
test('quote preview and draft',()=>{ok(js.includes('data-quote-total'));ok(js.includes("obj.status='draft'"))});
test('quote sharing',()=>ok(js.includes('navigator.share')));
test('accepted quote uses governed RPC',()=>ok(js.includes('artisan_business_accept_quote')));
test('CRM edit and history',()=>{ok(js.includes('function editClient(id)'));ok(js.includes('fxbo-history'))});
test('agenda is personal-only',()=>ok(js.includes('let rows=[...personalJobs()].sort')));
test('Ma journée reads marketplace state',()=>{ok(js.includes('v.myMissions'));ok(js.includes('v.dispatchOffers'))});
test('Finance uses personal ledger',()=>ok(js.includes('let ledgerRows=personalLedger(),inc=')));
test('Finance links client job quote',()=>{ok(js.includes("client_id:f.get('client_id')"));ok(js.includes("job_id:f.get('job_id')"));ok(js.includes("quote_id:f.get('quote_id')"))});
test('Finance date filters',()=>{ok(js.includes('fxbo-filter-from'));ok(js.includes('fxbo-filter-to'))});
test('FIXEO revenue remains distinct',()=>{ok(js.includes('Revenus FIXEO'));ok(js.includes('data-section="revenus"'))});
test('RAFI deterministic and no fake values',()=>{ok(js.includes('function businessPriority()'));ok(!/Math\.random|mockPrice|fakeScore/i.test(js))});
test('business section injection is idempotent',()=>ok(js.includes('if(old)return old')));
test('safe-area support',()=>ok(css.includes('safe-area-inset-bottom')));
test('responsive quote studio',()=>{ok(css.includes('.fxbo-line{'));ok(css.includes('@media(max-width:520px)'))});
test('asset cachebusters V4',()=>{ok(html.includes('fixeo-artisan-business-os-v2.css?v=artisan-business-os4'));ok(html.includes('fixeo-artisan-business-os-v2.js?v=artisan-business-os4'))});

console.log('\nArtisan OS V3.1:',pass,'PASS /',fail,'FAIL');
if(fail)process.exit(1);
