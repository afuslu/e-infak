import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function DonorLayout() {
  const { colors } = useTheme();
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
