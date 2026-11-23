import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { ToastHost } from '@/components/toast';
import { Btn, Loading } from '@/components/ui';
import { ForcePassword } from '@/components/ForcePassword';
import { authenticate, biometricEnabled } from '@/lib/biometric';
import { isWhiteLabel } from '@/config/tenant';
import { setupNotificationHandler } from '@/lib/notifications';
import { font, space, ThemeProvider, useTheme } from '@/theme';

// Açılış görseli, oturum ve kilit durumu belli olana kadar kalır; arada boş ekran görünmez.
SplashScreen.preventAutoHideAsync().catch(() => {});
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
  const { status, mode, me, platformMe } = useAuth();
  const { colors } = useTheme();
  const [locked, setLocked] = useState(false);
  const [lockChecked, setLockChecked] = useState(false);
  const away = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (await authenticate()) setLocked(false);
  }, []);

  // Açılışta ve arka plandan dönüşte (30 sn'den uzun) biyometrik kilit.
  useEffect(() => {
    if (status !== 'signedIn') {
      setLocked(false);
      setLockChecked(false);
      return;
    }
    let alive = true;
    biometricEnabled().catch(() => false).then((on) => {
      if (!alive) return;
      if (on) {
        setLocked(true);
        unlock();
      }
      setLockChecked(true);
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

  const ready = status === 'signedOut' || (status === 'signedIn' && lockChecked);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  // Ağ yavaşsa açılış görseli takılı kalmasın.
  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 6000);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Loading />
      </View>
    );
  }
  if (locked) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Lock size={44} color={colors.primary} />
        <Text style={[styles.lockTitle, { color: colors.text }]}>e-İnfak kilitli</Text>
        <Text style={[styles.lockText, { color: colors.muted }]}>Devam etmek için kimliğinizi doğrulayın.</Text>
        <Btn title="Kilidi aç" onPress={unlock} />
      </View>
    );
  }
  if (status === 'signedIn' && (me?.must_change_password || platformMe?.must_change_password)) return <ForcePassword />;
  const whiteLabel = isWhiteLabel();
  const showVitrin = (status === 'signedIn' && mode === 'donor') || (status !== 'signedIn' && whiteLabel);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'signedIn' && mode === 'platform'}>
        <Stack.Screen name="(platform)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedIn' && mode === 'tenant'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={showVitrin}>
        <Stack.Screen name="(vitrin)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedIn' && mode === 'donor'}>
        <Stack.Screen name="(donor)" />
      </Stack.Protected>
      <Stack.Protected guard={status !== 'signedIn'}>
        <Stack.Screen
          name="login"
          options={whiteLabel ? { presentation: 'modal' } : undefined}
        />
      </Stack.Protected>
    </Stack>
  );
}

function ThemedRoot() {
  const { dark } = useTheme();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Gate />
      <ToastHost />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <CartProvider>
              <ThemedRoot />
            </CartProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  lockTitle: { fontSize: font.xl, fontWeight: '700' },
  lockText: { fontSize: font.md, textAlign: 'center', marginBottom: space.sm },
});
