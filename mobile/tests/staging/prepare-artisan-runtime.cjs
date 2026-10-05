// Whole Artisan OS, real auth/business/HTTP modules. Only native hardware is adapted.
const path=require('path'),fs=require('fs');
const mobile=path.resolve(__dirname,'../..'),dir=path.resolve(process.argv[2]);
fs.mkdirSync(dir,{recursive:true});
const alias={'react-native':path.join(mobile,'node_modules/react-native-web'),'expo-router':path.join(__dirname,'artisan-router.web.ts'),'expo-secure-store':path.join(__dirname,'secure-store.web.ts')};
for(const name of ['expo-audio','expo-image-picker'])alias[name]=path.join(__dirname,'native-adapters.ts');
const define={global:'globalThis',__DEV__:'false','process.env.NODE_ENV':'"production"'};
const env={EXPO_PUBLIC_APP_ENV:'staging',EXPO_PUBLIC_SUPABASE_URL:'https://kqyhusnbybsukbcaoqtu.supabase.co',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,EXPO_PUBLIC_FIXEO_API_BASE_URL:'https://kqyhusnbybsukbcaoqtu.supabase.co/functions/v1/mobile-rafi-preview-proxy'};
if(!/^sb_publishable_/.test(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY||''))throw new Error('STAGING_PUBLISHABLE_KEY_REQUIRED');
for(const [k,v]of Object.entries(env))define['process.env.'+k]=JSON.stringify(v);
require(path.join(mobile,'node_modules/esbuild')).buildSync({entryPoints:[path.join(__dirname,'artisan-runtime.tsx')],outfile:path.join(dir,'app.js'),bundle:true,platform:'browser',jsx:'automatic',loader:{'.js':'jsx','.ttf':'dataurl','.png':'file'},resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.js','.json'],alias,define,logLevel:'warning'});
fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>FIXEO W5 staging runtime</title><style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden}#root{display:flex;flex-direction:column}</style></head><body><div id="root"></div><script>globalThis.process={env:{NODE_ENV:"production",EXPO_OS:"web"}};</script><script src="/app.js"></script></body></html>');
console.log('Real Artisan runtime bundled');
