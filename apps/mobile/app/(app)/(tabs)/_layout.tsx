import React from 'react';
import { Tabs } from 'expo-router';
import { HandCoins, LayoutDashboard, Menu, Users } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { allowed } from '@/lib/access';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { access, site } = useAuth();
  const donations = allowed(access, undefined, 'receipts');
  const donors = allowed(access, 'donor_crm', 'donors');
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Genel Bakış', headerTitle: site?.name || 'Genel Bakış', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="bagislar" options={{ title: 'Bağışlar', href: donations ? undefined : null, tabBarIcon: ({ color, size }) => <HandCoins color={color} size={size} /> }} />
      <Tabs.Screen name="bagiscilar" options={{ title: 'Bağışçılar', href: donors ? undefined : null, tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="menu" options={{ title: 'Menü', tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }} />
    </Tabs>
  );
}
