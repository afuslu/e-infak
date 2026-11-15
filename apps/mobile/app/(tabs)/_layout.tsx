import { Tabs } from 'expo-router'
import { Calculator, Heart, History, ShieldCheck, User } from 'lucide-react-native'
import { useAuth } from '../../src/context/AuthContext'

export default function TabsLayout() {
  const { isStaffOrAdmin } = useAuth()

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#059669',
        tabBarInactiveTintColor: '#64748b',
        headerStyle: { backgroundColor: '#ffffff' },
        headerTitleStyle: { fontWeight: '700', color: '#0f172a' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Kampanyalar',
          tabBarIcon: ({ color, size }) => <Heart color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="zakat"
        options={{
          title: 'Zekât',
          tabBarIcon: ({ color, size }) => <Calculator color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="donations"
        options={{
          title: 'Bağışlarım',
          tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Yönetim',
          href: isStaffOrAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Hesap',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
