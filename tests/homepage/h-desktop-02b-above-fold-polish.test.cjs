const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const h=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');const b=(h.match(/<style id="h-desktop-01-production-cleanup">([\s\S]*?)<\/style>/)||[])[1]||'';
test('02B remains desktop-only',()=>{assert.match(b,/@media \(min-width: 821px\)/);assert.doesNotMatch(b,/max-width/);});
test('canonical RAFI is raised and reduced',()=>{assert.match(b,/margin-top:clamp\(12px,2vh,28px\)/);assert.match(b,/transform:scale\(\.88\) !important/);});
test('RAFI duplicate caption is removed',()=>assert.match(b,/\.fxhf-visual \.fxhf-rafi-caption \{ display:none !important/));
test('command block is centered and compact',()=>{assert.match(b,/max-width:760px !important/);assert.match(b,/align-self:center !important/);assert.match(b,/min-height:96px !important/);});
test('CTA remains natural-flow and compact above fold',()=>{assert.match(b,/\.fxhf-actions \{ padding-top:8px !important; margin-top:0 !important/);assert.match(b,/\.fxhf-submit \{ min-height:52px !important/);assert.doesNotMatch(b,/position:fixed/);});
