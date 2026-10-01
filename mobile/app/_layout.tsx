import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureForegroundNotifications } from '@/lib/push';

configureForegroundNotifications();

function routeNotification(notification: Notifications.Notification) {
  const data = notification.request.content.data || {};
  const screen = String(data.screen || '');
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
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) routeNotification(last.notification);

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      routeNotification(response.notification);
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
