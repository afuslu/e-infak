import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useLastNotificationData } from '@/lib/lastNotification';
import { openNotificationTarget } from '@/lib/notificationRoute';
import { registerPush, watchPushTokenRefresh } from '@/lib/notifications';
import { getItem, setItem } from '@/lib/storage';
import { useTheme } from '@/theme';

const KEY_PLATFORM_ASKED = 'einfak_platform_push_asked';

function usePlatformPushWiring() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const handled = useRef<string | null>(null);
  const last = useLastNotificationData();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const asked = await getItem(KEY_PLATFORM_ASKED);
      await registerPush(!asked, 'platform').catch(() => undefined);
      if (!asked) await setItem(KEY_PLATFORM_ASKED, '1');
    })();
    const stopTokenWatch = watchPushTokenRefresh('platform');
    const received = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
    });
    return () => {
      stopTokenWatch();
      received.remove();
    };
  }, [queryClient]);

  useEffect(() => {
    if (Platform.OS === 'web' || !last) return;
    if (handled.current === last.id) return;
    handled.current = last.id;
    openNotificationTarget(router, last.data, last.actionId, 'platform');
  }, [last, router]);
}

export default function PlatformLayout() {
  const { colors } = useTheme();
  usePlatformPushWiring();
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
