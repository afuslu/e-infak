import { useEffect } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Lock } from 'lucide-react-native'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import { initNotificationHandler } from '../src/lib/notifications'
import { COLORS } from '../src/theme'

function AppShell() {
  const { lockedByBiometric, unlockWithBiometric } = useAuth()

  useEffect(() => {
    initNotificationHandler()
  }, [])

  useEffect(() => {
    if (lockedByBiometric) {
      unlockWithBiometric()
    }
  }, [lockedByBiometric])

  if (lockedByBiometric) {
    return (
      <View style={styles.lockScreen}>
        <Lock color={COLORS.primary} size={44} />
        <Text style={styles.lockTitle}>e-İnfak Kilitli</Text>
        <Text style={styles.lockSub}>Devam etmek için Face ID veya parmak izinizi doğrulayın.</Text>
        <TouchableOpacity style={styles.lockBtn} onPress={unlockWithBiometric}>
          <Text style={styles.lockBtnText}>Kilidi Aç</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="login"
        options={{ headerShown: true, title: 'Giriş Yap', presentation: 'modal' }}
      />
      <Stack.Screen
        name="donate/[slug]"
        options={{ headerShown: true, title: 'Güvenli Bağış' }}
      />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <AppShell />
    </AuthProvider>
  )
}

const styles = StyleSheet.create({
  lockScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.bg,
    gap: 12,
  },
  lockTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  lockSub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  lockBtn: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  lockBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
})
