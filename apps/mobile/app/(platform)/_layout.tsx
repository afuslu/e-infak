import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function PlatformLayout() {
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
