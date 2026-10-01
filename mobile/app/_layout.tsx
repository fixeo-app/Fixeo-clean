import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureForegroundNotifications } from '@/lib/push';

configureForegroundNotifications();

function safeRequestId(value: unknown) {
  const id=String(value||'');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : '';
}

function routeNotification(notification: Notifications.Notification) {
  const data = notification.request.content.data || {};
  const screen = String(data.screen || '');
  const requestId=safeRequestId(data.request_id);

  if (screen === 'artisan') {
    router.push(requestId ? { pathname:'/artisan', params:{ requestId } } : '/artisan');
    return;
  }
  if (screen === 'client') {
    router.push(requestId ? { pathname:'/', params:{ requestId } } : '/');
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
