import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { configureForegroundNotifications } from '@/lib/push';
import { getStableSession, resolveRole } from '@/lib/auth';
import {
  consumePendingNotificationIntent,
  notificationDestinationForRole,
  persistPendingNotificationIntent,
  shouldHandleNotificationResponse,
} from '@/lib/notificationIntent';
import { triggerFixeoFeedback } from '@/lib/feedback';
import { startSupabaseAuthLifecycle, supabase } from '@/lib/supabase';

configureForegroundNotifications();

async function routeNotificationResponse(response: Notifications.NotificationResponse) {
  const identifier = String(response.notification.request.identifier || '');
  if (!(await shouldHandleNotificationResponse(identifier))) return;

  const data = (response.notification.request.content.data || {}) as Record<string, unknown>;
  await persistPendingNotificationIntent(data).catch(() => undefined);

  try {
    const session = await getStableSession();
    if (!session) {
      router.replace('/sign-in');
      return;
    }

    const role = await resolveRole(session.user.id);
    const intent = await consumePendingNotificationIntent();
    if (!intent) return;

    const destination = notificationDestinationForRole(intent, role);
    if (!destination) return;

    triggerFixeoFeedback('impact');
    router.push({
      pathname: destination.pathname,
      params: destination.params,
    } as any);
  } catch {
    // Keep the pending intent. Auth/session recovery can consume it after sign-in.
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
    if (last?.notification) {
      void routeNotificationResponse(last);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      void routeNotificationResponse(response);
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
        animation: 'fade',
      }}
    >
      <Stack.Screen
        name="sign-in"
        options={{
          animation: 'fade',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="mission/[id]"
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="client-mission/[id]"
        options={{ animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
