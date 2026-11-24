import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function VitrinLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primaryDark,
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerBackTitle: 'Geri',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#F6F8F7' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sayfa/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="haberler" options={{ headerShown: false }} />
      <Stack.Screen name="bagis-yap" options={{ headerShown: false }} />
      <Stack.Screen name="sepet" options={{ headerShown: false }} />
      <Stack.Screen name="hesabim" options={{ headerShown: false }} />
      <Stack.Screen name="kampanya/[slug]" options={{ title: 'Kampanya Detayı' }} />
      <Stack.Screen name="haber/[slug]" options={{ title: 'Haber Detayı' }} />
      <Stack.Screen name="odeme" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="odeme-sonuc" options={{ title: 'Bağış Sonucu', headerBackVisible: false }} />
      <Stack.Screen name="zekat" options={{ title: 'Zekat Hesapla' }} />
      <Stack.Screen name="iban" options={{ title: 'IBAN / Hesap Numaraları' }} />
      <Stack.Screen name="makbuz-dogrula" options={{ title: 'Makbuz Doğrula' }} />
      <Stack.Screen name="iletisim" options={{ title: 'Hakkımızda & İletişim' }} />
    </Stack>
  );
}
