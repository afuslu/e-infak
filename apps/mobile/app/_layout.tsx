import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastHost } from '@/components/toast';
import { Btn, Loading } from '@/components/ui';
import { authenticate, biometricEnabled } from '@/lib/biometric';
import { setupNotificationHandler } from '@/lib/notifications';
import { colors, font, space } from '@/theme';

setupNotificationHandler();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error: any) => count < 1 && !(error?.status >= 400 && error?.status < 500),
    },
  },
});

function Gate() {
  const { status } = useAuth();
  const [locked, setLocked] = useState(false);
  const away = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (await authenticate()) setLocked(false);
  }, []);

  // Açılışta ve arka plandan dönüşte (30 sn'den uzun) biyometrik kilit.
  useEffect(() => {
    if (status !== 'signedIn') return setLocked(false);
    let alive = true;
    biometricEnabled().then((on) => {
      if (on && alive) {
        setLocked(true);
        unlock();
      }
    });
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state === 'background') away.current = Date.now();
      if (state === 'active' && away.current && Date.now() - away.current > 30_000 && (await biometricEnabled())) {
        setLocked(true);
        unlock();
      }
      if (state === 'active') away.current = null;
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [status, unlock]);

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <Loading />
      </View>
    );
  }
  if (locked) {
    return (
      <View style={styles.center}>
        <Lock size={44} color={colors.primary} />
        <Text style={styles.lockTitle}>e-İnfak kilitli</Text>
        <Text style={styles.lockText}>Devam etmek için kimliğinizi doğrulayın.</Text>
        <Btn title="Kilidi aç" onPress={unlock} />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={status !== 'signedIn'}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Gate />
          <ToastHost />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.bg },
  lockTitle: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  lockText: { fontSize: font.md, color: colors.muted, textAlign: 'center', marginBottom: space.sm },
});
