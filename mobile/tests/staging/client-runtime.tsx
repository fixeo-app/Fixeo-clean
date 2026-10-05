import { createElement } from 'react';
import { Dimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
const { createRoot } = require('react-dom/client');
import { supabase } from '../../lib/supabase';
import Home from '../../app/index';
import Workspace from '../../app/client-workspace/index';
import History from '../../app/client-workspace/history';
import Alerts from '../../app/client-workspace/notifications';
import Account from '../../app/client-workspace/account';
import Mission from '../../app/client-mission/[id]';
import { usePathname } from './router.web';
if (new URLSearchParams(location.search).has('large')) {
  const original = Dimensions.get.bind(Dimensions);
  Dimensions.get = name => ({ ...original(name), fontScale: 2 });
}
function Runtime() {
  const route = usePathname();
  const Screen = route.startsWith('/client-mission/') ? Mission : ({ '/client-workspace': Workspace, '/client-workspace/history': History, '/client-workspace/notifications': Alerts, '/client-workspace/account': Account } as Record<string, typeof Home>)[route] || Home;
  return <SafeAreaInsetsContext.Provider value={{ top: 24, bottom: 16, left: 0, right: 0 }}><Screen /></SafeAreaInsetsContext.Provider>;
}
async function start() {
  const session = await (globalThis as any).__freshSession();
  const { error } = await supabase.auth.setSession({ access_token: session.token, refresh_token: session.refresh });
  if (error) throw new Error('FRESH_SESSION_REJECTED');
  createRoot(document.getElementById('root')!).render(createElement(Runtime));
}
void start();
