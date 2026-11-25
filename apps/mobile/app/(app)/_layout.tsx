import React, { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { registerPush, watchPushTokenRefresh } from '@/lib/notifications';
import { useLastNotificationData } from '@/lib/lastNotification';
import { openNotificationTarget } from '@/lib/notificationRoute';
import { syncOfflineQueue } from '@/lib/offlineQueue';
import { getItem, setItem } from '@/lib/storage';
import { useAuth } from '@/context/AuthContext';
import { allowed } from '@/lib/access';
import { useInflow } from '@/api/inflow';
import { updateHomeWidgets } from '@/widgets';
import { widgetProps } from '@/widgets/data';
import { useTheme } from '@/theme';

const KEY_ASKED = 'einfak_push_asked';

/** Push: ilk girişte bir kez izin ister, dokunulan bildirimin ekranını açar, gelen bildirimde panoları yeniler. */
function usePushWiring() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { simulatingOrg } = useAuth();
  const handled = useRef<string | null>(null);
  const last = useLastNotificationData();

  useEffect(() => {
    // Platform yöneticisi bir kurumu simüle ederken kendi telefonu o kuruma bağlanmamalı.
    if (Platform.OS === 'web' || simulatingOrg) return;
    (async () => {
      const asked = await getItem(KEY_ASKED);
      await registerPush(!asked, 'tenant').catch(() => undefined);
      if (!asked) await setItem(KEY_ASKED, '1');
    })();
    const stopTokenWatch = watchPushTokenRefresh('tenant');
    const received = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['inflow'] });
      queryClient.invalidateQueries({ queryKey: ['failed-payments'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['donations'] });
    });
    return () => {
      stopTokenWatch();
      received.remove();
    };
  }, [queryClient, simulatingOrg]);

  // Uygulama kapalıyken dokunulan bildirim de dahil: her yanıt bir kez işlenir.
  useEffect(() => {
    if (Platform.OS === 'web' || !last) return;
    if (handled.current === last.id) return;
    handled.current = last.id;
    const data = last.data;
    if (data?.notification_id) {
      import('@/lib/api').then(({ api }) => api('/mobile/notifications/read', { method: 'POST', body: { ids: [data.notification_id] } }))
        .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] })).catch(() => {});
    }
    openNotificationTarget(router, data, last.actionId);
  }, [last, router, queryClient]);
}

/** Uygulama açıkken bugünkü para girişini ana ekran widget'ına aktarır. */
function useWidgetSync() {
  const { access, site } = useAuth();
  const { dark } = useTheme();
  const inflow = useInflow('today', Platform.OS !== 'web' && allowed(access, undefined, 'receipts'));
  useEffect(() => {
    if (inflow.data) updateHomeWidgets(widgetProps(inflow.data, site?.name || 'e-İnfak', dark));
  }, [inflow.data, site?.name, dark]);
}

/** Uygulama açılışında ve arka plandan dönünce çevrimdışı kuyruğu otomatik senkronize eder. */
function useOfflineAutoSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const run = () => {
      syncOfflineQueue()
        .then((res) => {
          if (res.synced > 0) {
            queryClient.invalidateQueries({ queryKey: ['donations'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            queryClient.invalidateQueries({ queryKey: ['inflow'] });
          }
        })
        .catch(() => {});
    };
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, [queryClient]);
}

export default function AppLayout() {
  const { colors } = useTheme();
  usePushWiring();
  useWidgetSync();
  useOfflineAutoSync();
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
