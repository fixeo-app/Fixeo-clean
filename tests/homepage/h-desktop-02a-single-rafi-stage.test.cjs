const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const h=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');const b=(h.match(/<style id="h-desktop-01-production-cleanup">([\s\S]*?)<\/style>/)||[])[1]||'';
test('desktop mounted Flagship suppresses legacy RAFI OS stage',()=>{assert.match(b,/hero-content > \.rfos-stage-wrap/);assert.match(b,/\.rfos-h1-band \{ display:none !important/);});
test('canonical Flagship visual remains visible',()=>{assert.match(b,/#fxhf-root \.fxhf-visual \{/);assert.match(b,/display:flex !important/);});
test('desktop composition gives more room to command surface',()=>assert.match(b,/grid-template-columns:minmax\(0,1\.55fr\) minmax\(280px,\.45fr\)/));
test('canonical RAFI visual is raised toward heading and input',()=>assert.match(b,/margin-top:clamp\(54px,7vh,88px\)/));
