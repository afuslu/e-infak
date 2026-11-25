import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useLastNotificationData } from '@/lib/lastNotification';
import { openNotificationTarget } from '@/lib/notificationRoute';
import { registerPush, watchPushTokenRefresh } from '@/lib/notifications';
import { getItem, setItem } from '@/lib/storage';
import { useTheme } from '@/theme';

const KEY_DONOR_ASKED = 'einfak_donor_push_asked';

function useDonorPushWiring() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { donorMe } = useAuth();
  const handled = useRef<string | null>(null);
  const last = useLastNotificationData();

  useEffect(() => {
    if (Platform.OS === 'web' || donorMe?.push_opt_out) return;
    (async () => {
      const asked = await getItem(KEY_DONOR_ASKED);
      await registerPush(!asked, 'donor').catch(() => undefined);
      if (!asked) await setItem(KEY_DONOR_ASKED, '1');
    })();
    const stopTokenWatch = watchPushTokenRefresh('donor');
    const received = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ['donor'] });
    });
    return () => {
      stopTokenWatch();
      received.remove();
    };
  }, [queryClient, donorMe?.push_opt_out]);

  useEffect(() => {
    if (Platform.OS === 'web' || !last) return;
    if (handled.current === last.id) return;
    handled.current = last.id;
    openNotificationTarget(router, last.data, last.actionId, 'donor');
  }, [last, router]);
}

export default function DonorLayout() {
  const { colors } = useTheme();
  useDonorPushWiring();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primaryDark,
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerBackTitle: 'Geri',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="bagislarim" options={{ title: 'Bağışlarım' }} />
      <Stack.Screen name="ustlendiklerim" options={{ title: 'Üstlendiklerim' }} />
      <Stack.Screen name="su-kuyularim" options={{ title: 'Su Kuyularım' }} />
      <Stack.Screen name="projelerim" options={{ title: 'Projelerim & Kurban' }} />
      <Stack.Screen name="talimatlarim" options={{ title: 'Talimatlarım' }} />
      <Stack.Screen name="kartlarim" options={{ title: 'Kayıtlı Kartlarım' }} />
      <Stack.Screen name="ayarlar" options={{ title: 'Ayarlar' }} />
    </Stack>
  );
}
