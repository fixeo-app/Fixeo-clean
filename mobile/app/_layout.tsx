import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { configureForegroundNotifications } from '@/lib/push';
import { startSupabaseAuthLifecycle, supabase } from '@/lib/supabase';

configureForegroundNotifications();

function routeNotification(notification: Notifications.Notification) {
  const data = notification.request.content.data || {};
  const screen = String(data.screen || '');
  const missionId = String(data.mission_id || '');

  if (screen === 'artisan-mission' && missionId) {
    router.push({ pathname: '/mission/[id]', params: { id: missionId } } as any);
    return;
  }

  if (screen === 'client-mission' && missionId) {
    router.push({ pathname: '/client-mission/[id]', params: { id: missionId } } as any);
    return;
  }

  if (screen === 'artisan') {
    router.push('/artisan');
    return;
  }

  if (screen === 'client') {
    router.push('/');
  }
}

export default function Layout() {
  useEffect(() => {
    const stopAuthLifecycle = startSupabaseAuthLifecycle();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !session) {
        router.replace('/sign-in');
      }
    });

    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) routeNotification(last.notification);

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      routeNotification(response.notification);
    });
    return () => {
      subscription.remove();
      authListener.subscription.unsubscribe();
      stopAuthLifecycle();
    };
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F7F7F5' },
      }}
    >
      <Stack.Screen
        name="sign-in"
        options={{
          animation: 'fade',
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
