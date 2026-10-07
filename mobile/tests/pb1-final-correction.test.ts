import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { understandArtisanCommand, summarizeToday } from '../lib/artisanCopilot';
import { createMasterPlayback, rafiMasterVariant } from '../ui/rafiMasterPlayback';
import { canonicalCity, citySuggestions, canonicalCities } from '../lib/clientLocation';
import { getScreenMetrics } from '../ui/screenMetrics';
import { pageLayout } from '../ui/pageLayout';

const now=new Date('2026-10-07T08:00:00Z');
const jobs:any[]=[{id:'j1',title:'Intervention',client_id:'c1',scheduled_at:'2026-10-07T10:30:00Z',status:'scheduled'},
 {id:'j2',title:'Demain',scheduled_at:'2026-10-08T10:30:00Z',status:'scheduled'},
 {id:'j3',title:'Annulée',scheduled_at:'2026-10-07T09:30:00Z',status:'cancelled'}];
const context:any={jobs,clients:[{id:'c1',full_name:'PB1 Client Test'}],now};
test('PB1 Arabic Darija, Arabizi, French and code switching share agenda/today with direct owned-data answers',()=>{
 for(const value of ['Qu’est-ce que j’ai aujourd’hui ?','شنو عندي اليوم ؟','Chno 3ndi lyoum ?','شنو عندي اليوم في agenda','Chnou andi lyouma ?']){
  const c=understandArtisanCommand(value,context);assert.equal(c.kind,'navigate');if(c.kind!=='navigate')throw Error();
  assert.equal(c.intent,'agenda/today');assert.equal(c.readOnly,true);assert.match(c.message,/PB1 Client Test/);assert.match(c.message,/11[:h]30/);
 }
 for(const value of ['حل ليا الاجندا ديال اليوم','حل ليا الأجندة ديال اليوم','7ell lia agenda dyal lyoum','Ouvre mon agenda']){
  const c=understandArtisanCommand(value,context);assert.equal(c.kind,'navigate');if(c.kind==='navigate'){assert.equal(c.intent,'agenda/today');assert.equal(c.readOnly,false);}
 }
 assert.match(understandArtisanCommand('شنو عندي اليوم',context).message,/عندك/);
 assert.match(understandArtisanCommand('Chno 3ndi lyoum',context).message,/3ndek/);
 for(const s of ['Ne m’ouvre pas mon agenda','ما تحل الاجندا','mat 7ell agenda'])assert.equal(understandArtisanCommand(s,context).kind,'unsupported');
 const planning=understandArtisanCommand('Planifie une intervention aujourd’hui',context);
 assert.equal(planning.kind,'navigate');if(planning.kind==='navigate'){assert.equal(planning.params?.new,'1');assert.equal(planning.readOnly,undefined);}
});
test('PB1 agenda distinguishes unavailable, zero and cancelled appointments and uses Morocco date boundary',()=>{
 assert.match(summarizeToday(null,[],'fr',now),/indisponible/);
 assert.match(summarizeToday([],[],'fr',now),/aucune intervention/);
 assert.match(summarizeToday(jobs,context.clients,'fr',now),/1 intervention/);
 assert.doesNotMatch(summarizeToday(jobs,context.clients,'fr',now),/Demain|Annulée/);
 const midnight:any=[{scheduled_at:'2026-10-06T23:30:00Z',status:'scheduled',title:'Nuit'}];
 assert.match(summarizeToday(midnight,[],'fr',now),/00h30/);
});
test('PB1 canonical registry has no duplicate and preserves supported cities with tolerant accents',()=>{
 const cities=citySuggestions('');assert.equal(new Set(cities.map(c=>c.value)).size,cities.length);
 for(const c of cities){assert.equal(c.value,c.label);assert.equal(canonicalCity(c.value),c.value);}
 for(const [input,expected] of [['Fes','Fès'],['Tetouan','Tétouan'],['Kenitra','Kénitra'],['Temara','Témara'],['Martil','Martil'],['مرتيل','Martil']])assert.equal(canonicalCity(input),expected);
 assert.deepEqual(canonicalCities(['Fes','Fès','Rabat']),['Fès','Rabat']);
 for(const c of ['Nador','Martil','Oujda','Safi','Khouribga','Taza','Ouarzazate','Mohammedia'])assert.ok(cities.some(x=>x.value===c));
});
test('PB1 certified source hash, all frames and temporal invariants are recorded for each native alpha derivative',()=>{
 const m=JSON.parse(readFileSync('assets/rafi/master-loop-v1/manifest.json','utf8'));
 assert.equal(createHash('sha256').update(readFileSync('docs/w6/pb1-final-correction/RAFI_MASTER_LOOP_V1.mp4')).digest('hex'),m.source_sha256);
 assert.equal(m.source_frames,217);assert.equal(m.source_fps,24);assert.equal(m.temporal_changes,false);assert.equal(m.loop_count,0);
 assert.equal(m.frame_delays_ms.length,217);assert.ok(Math.abs(m.runtime_duration_ms-217/24*1000)<1);
 assert.ok(m.qa.every((q:any)=>q.core_alpha_min===1 && q.edge_alpha_max===0));
 assert.deepEqual([44,76,96,192].map(rafiMasterVariant),['mini','medium','hero','hero']);
});
test('PB1 native loop pauses for background/viewport/Reduce Motion; late load and unmount cannot restart decoding',async()=>{
 for(let navigation=0;navigation<30;navigation++){
  let playing=false,errors=0,starts=0;
  const image={startAnimating:async()=>{playing=true;starts++;},stopAnimating:async()=>{playing=false;}};
  const p=createMasterPlayback(()=>errors++);p.attach(image);p.setActivity(true,false);await p.settled();assert.equal(playing,false);
  p.loaded();await p.settled();assert.equal(playing,true);
  p.setActivity(false,false);await p.settled();assert.equal(playing,false);
  p.loaded();await p.settled();assert.equal(playing,false);
  p.setActivity(true,true);await p.settled();assert.equal(playing,false);
  p.setActivity(true,false);await p.settled();assert.equal(playing,true);
  p.dispose();p.loaded();p.setActivity(true,false);await p.settled();assert.equal(playing,false);assert.equal(errors,0);assert.equal(starts,2);
 }
});
test('PB1 shared page rhythm and dock clearance fit small Android and enlarged content',()=>{
 assert.equal(pageLayout.intro.paddingTop,0);assert.ok(pageLayout.intro.gap<=8);assert.ok(pageLayout.content.gap<=16);
 for(const safe of [0,24,48])for(const height of [64,100,180]){
  const metrics=getScreenMetrics({top:24,bottom:safe,left:0,right:0},{floatingHeight:height});
  assert.equal(metrics.paddingBottom-metrics.floatingBottom-height,24);assert.ok(metrics.paddingBottom>=safe+height+24);
 }
});

test('PB1 informative finance and quote questions answer business data without proposing a write',()=>{
 const ledger:any[]=[{entry_type:'income',amount:500,occurred_on:'2026-10-07'}, {entry_type:'expense',amount:120,occurred_on:'2026-10-07'}, {entry_type:'income',amount:900,occurred_on:'2026-10-06'}];
 for(const text of ['Quel est mon solde aujourd’hui ?', 'Chno 3ndi f flous lyoum ?', 'شنو عندي فالحسابات اليوم ؟']){
  const c=understandArtisanCommand(text,{...context,ledger});assert.equal(c.kind,'navigate');
  if(c.kind==='navigate'){assert.equal(c.path,'/artisan-workspace/finance');assert.equal(c.readOnly,true);assert.equal(c.params,undefined);assert.match(c.message,/380/);assert.doesNotMatch(c.message,/1.?280/);}
 }
 const missing=understandArtisanCommand('Quel est mon solde ?',{});assert.match(missing.message,/indisponibles/);assert.doesNotMatch(missing.message,/0 MAD/);
 const quote:any={id:'quote1',quote_number:'DEV-001',title:'Robinet',client_id:'c1',status:'draft',total:500};
 const c=understandArtisanCommand('Quel est le montant du devis DEV-001 ?', {quotes:[quote],clients:context.clients});
 assert.equal(c.kind,'navigate');if(c.kind==='navigate'){assert.equal(c.readOnly,true);assert.equal(c.params?.id,'quote1');assert.match(c.message,/brouillon, 500 MAD/);}
 const writing=understandArtisanCommand('Ajoute un encaissement de 500 DH aujourd’hui',{ledger});assert.equal(writing.kind,'navigate');
 if(writing.kind==='navigate'){assert.equal(writing.readOnly,undefined);assert.equal(writing.params?.new,'1');}
});
test('PB1 agenda does not answer today for a different period or turn an availability question into a change',()=>{
 for(const text of ['Ouvre mon agenda demain','شنو عندي فالاجندا غدا','7ell agenda dyal ghdda']){
  const c=understandArtisanCommand(text,context);assert.equal(c.kind,'navigate');if(c.kind==='navigate')assert.notEqual(c.intent,'agenda/today');assert.doesNotMatch(c.message,/PB1 Client Test/);
 }
 assert.notEqual(understandArtisanCommand('Est-ce que je suis disponible ?',context).kind,'availability');
 assert.equal(understandArtisanCommand('Mets-moi disponible',context).kind,'availability');
});
