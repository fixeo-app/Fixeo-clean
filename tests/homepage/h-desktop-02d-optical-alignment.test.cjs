const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const h=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');const b=(h.match(/<style id="h-desktop-01-production-cleanup">([\s\S]*?)<\/style>/)||[])[1]||'';
test('02D raises RAFI without changing sphere core scale',()=>{assert.match(b,/translateY\(-28px\)/);assert.match(b,/fxhf-rafi-sphere \{ transform:scale\(\.78\)/);});
test('02D reduces only external halo further',()=>assert.match(b,/fxhf-rafi-sphere::after \{ transform:scale\(\.56\) !important; opacity:\.40/));
test('02D recenters functional lower block consistently',()=>{assert.match(b,/\.fxhf-progress,[\s\S]*\.fxhf-actions \{ transform:translateX\(34px\)/);assert.match(b,/width:calc\(100% - 34px\)/);});
test('02D does not override frozen title or subtitle',()=>{const tail=b.split('H-DESKTOP-02D')[1]||'';assert.doesNotMatch(tail,/fxhf-title/);assert.doesNotMatch(tail,/fxhf-subtitle/);});
