const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const r=path.join(__dirname,'../..'),h=fs.readFileSync(path.join(r,'index.html'),'utf8'),j=fs.readFileSync(path.join(r,'js/fixeo-hero-flagship-v1.js'),'utf8');
const block=(h.match(/<style id="h-desktop-01-production-cleanup">([\s\S]*?)<\/style>/)||[])[1]||'';
test('H-DESKTOP-01B restores functional NEED RAFI visual',()=>assert.match(block,/data-fxhf-state=need\] \.fxhf-visual \{ display: flex !important/));
test('H-DESKTOP-01B removes duplicate visual caption, not RAFI interaction',()=>assert.match(block,/\.fxhf-visual \.fxhf-rafi-caption \{ display:none !important/));
test('header primary discovery action is RAFI',()=>{assert.match(h,/>Demander à RAFI<\/span>/);assert.doesNotMatch(h,/>Rechercher<\/span>/);});
test('auth CTAs are visually secondary on desktop',()=>assert.match(block,/#login-btn, \.nav-actions #register-btn/));
test('Hero promise stays canonical and gets stronger hierarchy',()=>{assert.match(j,/Écrivez, parlez ou montrez\. RAFI comprend et vous guide\./);assert.match(block,/\.fxhf-subtitle \{ max-width:42ch/);});
test('Hero primary CTA is RAFI',()=>{assert.match(j,/"Demander à RAFI"/);assert.doesNotMatch(j,/"Laisser RAFI comprendre"/);});
