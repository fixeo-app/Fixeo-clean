// Inspect a disposable Expo prebuild. This does not certify a compiled APK.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.argv[2];if(!root)throw Error('Pass the disposable Android prebuild directory');
const config=require('../app.json').expo,profile=require('../eas.json').build['w6-physical-certification'];
const gradle=fs.readFileSync(path.join(root,'app/build.gradle'),'utf8');
const manifest=fs.readFileSync(path.join(root,'app/src/main/AndroidManifest.xml'),'utf8');
const styles=fs.readFileSync(path.join(root,'app/src/main/res/values/styles.xml'),'utf8');
const pkg=require('../package.json');const checks=[];
function check(name,condition){assert.ok(condition,name);checks.push(name);}
check('package ma.fixeo.app',gradle.includes("applicationId 'ma.fixeo.app'"));
check('Android 0.3.0 (5)',gradle.includes('versionCode 5')&&gradle.includes('versionName "0.3.0"'));
check('preview APK only',profile.environment==='preview'&&profile.android.buildType==='apk'&&profile.distribution==='internal'&&!profile.developmentClient);
check('staging Supabase only',profile.env.EXPO_PUBLIC_SUPABASE_URL==='https://kqyhusnbybsukbcaoqtu.supabase.co'&&profile.env.EXPO_PUBLIC_APP_ENV==='staging');
check('canonical callback unchanged',profile.env.EXPO_PUBLIC_AUTH_CALLBACK_URL==='https://w6-auth-staging.fixeo.ma/auth-callback');
check('foreground location declared',manifest.includes('android.permission.ACCESS_FINE_LOCATION'));
check('background location blocked',manifest.includes('android.permission.ACCESS_BACKGROUND_LOCATION" tools:node="remove"'));
check('location foreground service blocked',manifest.includes('android.permission.FOREGROUND_SERVICE_LOCATION" tools:node="remove"'));
check('microphone declared',manifest.includes('android.permission.RECORD_AUDIO'));
check('native callback scheme',manifest.includes('android:scheme="fixeo"'));
check('keyboard resize',manifest.includes('android:windowSoftInputMode="adjustResize"'));
check('dark system bar foreground',styles.includes('name="android:windowLightStatusBar">true')&&styles.includes('name="android:windowLightNavigationBar">true'));
check('ivory status bar',styles.includes('name="android:statusBarColor">#F7F7F5'));
check('SDK 54 native picker pinned',pkg.dependencies['@react-native-community/datetimepicker']==='8.4.4');
check('SDK 54 system UI present',pkg.dependencies['expo-system-ui']==='6.0.9');
check('SDK 54 inbox intent present',pkg.dependencies['expo-intent-launcher']==='13.0.8');
check('FIXEO launcher resource',config.icon==='./assets/fixeo-icon.png'&&config.android.adaptiveIcon.foregroundImage===config.icon&&manifest.includes('android:icon="@mipmap/ic_launcher"'));
console.log(JSON.stringify({scope:'Disposable Expo prebuild, NOT compiled APK or physical certification',checks,result:'PASS'},null,2));
