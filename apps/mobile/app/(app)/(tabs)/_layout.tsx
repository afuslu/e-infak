import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Bell, HandCoins, LayoutDashboard, Menu, Users } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { allowed } from '@/lib/access';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { access, site } = useAuth();
  const donations = allowed(access, undefined, 'receipts');
  const donors = allowed(access, 'donor_crm', 'donors');
  const router = useRouter();
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api<{ unread: number }>('/mobile/notifications', { query: { page_size: 1 } }),
    refetchInterval: 60_000,
  });
  const count = unread.data?.unread || 0;
  const bell = () => (
    <Pressable onPress={() => router.push('/bildirimler')} hitSlop={10} accessibilityRole="button"
      accessibilityLabel={count ? `Bildirimler, ${count} okunmamış` : 'Bildirimler'} style={{ paddingHorizontal: 16 }}>
      <Bell size={22} color={colors.primaryDark} />
      {count ? (
        <View style={{ position: 'absolute', right: 8, top: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: colors.white, fontSize: 11, fontWeight: '800' }}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerShadowVisible: false,
        headerRight: bell,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Genel Bakış', headerTitle: site?.name || 'Genel Bakış', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="bagislar" options={{ title: 'Bağışlar', href: donations ? undefined : null, tabBarIcon: ({ color, size }) => <HandCoins color={color} size={size} /> }} />
      <Tabs.Screen name="bagiscilar" options={{ title: 'Bağışçılar', href: donors ? undefined : null, tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="menu" options={{ title: 'Menü', tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }} />
    </Tabs>
  );
}
