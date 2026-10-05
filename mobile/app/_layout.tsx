import { useEffect } from 'react';
import { Stack, router, usePathname, useRootNavigationState } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { configureForegroundNotifications } from '@/lib/push';
import { notificationDestinationForRole, shouldHandleNotificationResponse } from '@/lib/notificationIntent';
import { normalizeNotificationIntent } from '@/lib/notificationRouting';
import { authState, startAuthOwner, useAuthState } from '@/lib/authSession';

configureForegroundNotifications();
const clientScreens = ['index', 'client-mission/[id]', 'client-workspace/index', 'client-workspace/account', 'client-workspace/history', 'client-workspace/notifications'];
const artisanScreens = ['artisan', 'mission/[id]', 'artisan-workspace/index', 'artisan-workspace/agenda', 'artisan-workspace/clients', 'artisan-workspace/client/[id]', 'artisan-workspace/evidence/[id]', 'artisan-workspace/finance', 'artisan-workspace/missions', 'artisan-workspace/notifications', 'artisan-workspace/opportunities', 'artisan-workspace/opportunity/[id]', 'artisan-workspace/profile', 'artisan-workspace/quote/[id]', 'artisan-workspace/quotes', 'artisan-workspace/rafi'];

async function routeNotificationResponse(response: Notifications.NotificationResponse) {
  const before = authState.snapshot();
  // A notification has no authority to open an account or survive an account switch.
  if (before.phase !== 'ready' || !before.role) return;
  if (!(await shouldHandleNotificationResponse(String(response.notification.request.identifier || '')))) return;
  if (!authState.isCurrent(before.epoch)) return;
  const destination = notificationDestinationForRole(normalizeNotificationIntent(response.notification.request.content.data), before.role);
  if (destination) router.push(destination as any);
}
export default function Layout() {
  const state = useAuthState(); const path = usePathname();
  const navigation = useRootNavigationState();
  useEffect(startAuthOwner, []);
  useEffect(() => {
    if (!navigation?.key || path === '/auth-callback') return;
    if (state.phase === 'recovery' && path !== '/reset-password') router.replace('/reset-password');
    else if (state.phase === 'onboarding' && path !== '/complete-profile') router.replace('/complete-profile');
    else if (state.phase === 'blocked' && path !== '/auth-status') router.replace('/auth-status');
    else if (state.phase === 'ready' && ['/entry', '/sign-in', '/sign-up', '/auth-status', '/complete-profile'].includes(path)) router.replace(state.role === 'artisan' ? '/artisan' : '/');
    else if (state.phase === 'signed_out' && (path === '/auth-status' || (state.issue && path === '/entry'))) router.replace(state.issue ? '/sign-in' : '/entry');
  }, [state.phase, state.role, state.issue, path, navigation?.key]);
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => void routeNotificationResponse(response));
    return () => subscription.remove();
  }, []);
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F7F7F5' }, animation: 'fade' }}>
    <Stack.Screen name="entry" />
    <Stack.Screen name="sign-in" options={{ gestureEnabled: false }} />
    <Stack.Screen name="sign-up" /><Stack.Screen name="forgot-password" /><Stack.Screen name="auth-callback" /><Stack.Screen name="auth-status" />
    <Stack.Protected guard={state.phase === 'recovery'}><Stack.Screen name="reset-password" /></Stack.Protected>
    <Stack.Protected guard={state.phase === 'onboarding' && state.role === 'artisan'}><Stack.Screen name="complete-profile" /></Stack.Protected>
    <Stack.Protected guard={state.phase === 'ready' && state.role === 'client'}>{clientScreens.map(name => <Stack.Screen key={name} name={name} />)}</Stack.Protected>
    <Stack.Protected guard={state.phase === 'ready' && state.role === 'artisan'}>{artisanScreens.map(name => <Stack.Screen key={name} name={name} />)}</Stack.Protected>
  </Stack>;
}
