const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const h=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const block=(h.match(/<style id="h-desktop-01-production-cleanup">([\s\S]*?)<\/style>/)||[])[1]||'';
test('H-DESKTOP-01 is desktop-only',()=>{assert.match(block,/@media \(min-width: 821px\)/);assert.doesNotMatch(block,/max-width/);});
test('desktop Hero has no nested RAFI scroll surface',()=>assert.match(block,/\.fxhf-scroll \{ overflow-y: visible !important/));
test('desktop NEED hides secondary RAFI visual only',()=>assert.match(block,/data-fxhf-state=need\] \.fxhf-visual \{ display: none !important/));
test('desktop header hides untranslated language selector',()=>assert.match(block,/#lang-select \{ display: none !important/));
test('desktop legacy floating urgency and WhatsApp entry points are neutralized',()=>{assert.match(block,/#fixeo-urgent-fab, \.chat-widget \{ display: none !important; pointer-events: none !important/);});
test('canonical RAFI Hero and estimator remain present',()=>{assert.match(h,/id="fxhf-root"/);assert.match(h,/id="fxes-open-estimator"/);});
