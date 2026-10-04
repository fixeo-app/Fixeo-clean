const path = require('node:path'), fs = require('node:fs');
const mobile = path.resolve(__dirname, '../..');
const { buildSync } = require(path.join(mobile, 'node_modules/esbuild'));
const dir = path.resolve(process.argv[2] || path.join(mobile, 'node_modules/.w4-visual'));
fs.mkdirSync(dir, { recursive: true });
const alias = { 'react-native': path.join(mobile, 'node_modules/react-native-web'), 'expo-router': path.join(__dirname, 'client-router.web.ts'), '@/lib/clientLocationNative': path.join(__dirname, 'client-location.web.ts') };
for (const name of ['auth', 'supabase', 'missionTerrain', 'decisionCenter', 'magicLoop', 'clientWatch', 'push', 'rafiGateway', 'mobileDiagnostic', 'mobileDiagnosticReference', 'mobileEstimator', 'clientWorkspace', 'missionEvidence', 'missionChange']) alias['@/lib/' + name] = path.join(__dirname, 'client-services.web.ts');
for (const name of ['expo-audio', 'expo-image-picker']) alias[name] = path.join(__dirname, 'rafi-capture.web.ts');
buildSync({ entryPoints: [path.join(__dirname, 'client-visual.tsx')], outfile: path.join(dir, 'app.js'), bundle: true, platform: 'browser', jsx: 'automatic',
  loader: { '.js': 'jsx', '.ttf': 'dataurl', '.png': 'file' }, resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'], alias,
  define: { global: 'globalThis', __DEV__: 'false', 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' });
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>FIXEO W4 · UI fixtures</title><style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden}#root{display:flex;flex-direction:column}</style></head><body><div id="root"></div><script>globalThis.process={env:{NODE_ENV:"production",EXPO_OS:"web"}};</script><script src="/app.js"></script></body></html>');
console.log(dir);
