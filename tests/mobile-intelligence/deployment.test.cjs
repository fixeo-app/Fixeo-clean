'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..'),legacy=require('../../vercel.legacy.json');
// Config contains plain JavaScript; evaluate with an explicit environment only.
const source=fs.readFileSync(path.join(root,'vercel.ts'),'utf8')
 .replace("import legacy from './vercel.legacy.json';",'').replace('export const config','const config');
const build=new Function('process','legacy',source+';return config;');
test('W41 builds only three JWT mobile endpoints; legacy routing preserved for other branches',()=>{
 const env={VERCEL_GIT_COMMIT_REF:'feat/fixeo-mobile-w4-1-intelligence-gateway',VERCEL_ENV:'preview'};
 const config=build({env},legacy);
 assert.deepEqual(config.builds.map(x=>x.src),['api/mobile-intelligence-fn/index.js','api/mobile-rafi-photo-fn/index.js','api/mobile-rafi-voice-fn/index.js']);
 assert.equal(config.crons,undefined);
 assert.equal(config.routes.at(-1).status,404);
 assert.deepEqual(build({env:{VERCEL_GIT_COMMIT_REF:'feat/fixeo-mobile-w4-client-os-wow'}},legacy),legacy);
 assert.deepEqual(build({env:{FIXEO_STAGING_PROJECT_REF:'kqyhusnbybsukbcaoqtu'}},legacy).builds,config.builds);
});
