import { useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/context/AuthContext'
import { apiFetch, WEB_BASE_URL } from '../../src/lib/api'
import {
  isFridayReminderEnabled,
  registerForPushNotificationsAsync,
  toggleFridayReminder,
} from '../../src/lib/notifications'
import { CARD_SHADOW, COLORS } from '../../src/theme'

export default function ProfileScreen() {
  const router = useRouter()
  const { user, isStaffOrAdmin, biometricEnabled, toggleBiometric, signOut } = useAuth()
  const [fridayOn, setFridayOn] = useState(false)

  useEffect(() => {
    isFridayReminderEnabled().then(setFridayOn).catch(() => {})
  }, [])

  const handleToggleFriday = async (val: boolean) => {
    const ok = await toggleFridayReminder(val)
    setFridayOn(ok)
    if (val && !ok) {
      Alert.alert('İzin Gerekli', 'Hatırlatıcı için cihaz ayarlarından bildirim izni verin.')
    }
  }

  const handleToggleBiometric = async (val: boolean) => {
    const ok = await toggleBiometric(val)
    if (val && !ok) {
      Alert.alert('Desteklenmiyor', 'Cihazınızda Face ID / Parmak İzi tanımlı değil.')
    }
  }

  const handleTestPush = async () => {
    try {
      const token = await registerForPushNotificationsAsync()
      if (!token) {
        Alert.alert('Bilgi', 'Push token yalnız fiziksel cihazlarda alınabilir.')
        return
      }
      await apiFetch('/mobile/test-push', { method: 'POST' })
      Alert.alert('Gönderildi', 'Test bildirimi cihazınıza iletildi.')
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Push bildirimi gönderilemedi')
    }
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      'Hesap Silme Talebi',
      'Hesabınızı ve kişisel verilerinizi kalıcı olarak silmek için destek sayfasına yönlendirileceksiniz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Devam Et',
          style: 'destructive',
          onPress: () => Linking.openURL(`${WEB_BASE_URL}/hesap-sil`),
        },
      ],
    )
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        {user ? (
          <>
            <Text style={styles.name}>
              {user.first_name} {user.last_name}
            </Text>
            <Text style={styles.email}>{user.email}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {isStaffOrAdmin ? 'Yönetim / Personel Hesabı' : 'Bağışçı Hesabı'}
              </Text>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
              <Text style={styles.logoutText}>Çıkış Yap</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.name}>Misafir Kullanıcı</Text>
            <Text style={styles.email}>
              Bağış geçmişiniz ve makbuzlarınız için giriş yapın.
            </Text>
            <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/login')}>
              <Text style={styles.loginText}>Giriş Yap</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Güvenlik & Hatırlatıcılar</Text>
        {user && (
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.rowText}>Face ID / Parmak İzi Kilidi</Text>
              <Text style={styles.rowSub}>Uygulama açılışında biyometrik doğrulama</Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleToggleBiometric}
              trackColor={{ true: COLORS.primary }}
            />
          </View>
        )}
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.rowText}>Cuma Hayır Hatırlatıcısı</Text>
            <Text style={styles.rowSub}>Her Cuma 11:00&apos;de yerel bildirim</Text>
          </View>
          <Switch
            value={fridayOn}
            onValueChange={handleToggleFriday}
            trackColor={{ true: COLORS.primary }}
          />
        </View>
        {user && (
          <TouchableOpacity style={styles.rowBtn} onPress={handleTestPush}>
            <Text style={styles.rowText}>Anlık Bildirim (Push) Test Et</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Gizlilik & Hesap</Text>
        <TouchableOpacity
          style={styles.rowBtn}
          onPress={() => Linking.openURL(`${WEB_BASE_URL}/kvkk`)}
        >
          <Text style={styles.rowText}>KVKK ve Gizlilik Politikası</Text>
        </TouchableOpacity>
        {user && (
          <TouchableOpacity style={styles.rowBtn} onPress={handleDeleteAccount}>
            <Text style={styles.deleteText}>Hesabımı Kalıcı Olarak Sil</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 16, gap: 14 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...CARD_SHADOW,
  },
  name: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  email: { fontSize: 13, color: COLORS.textMuted },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primarySoft,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  loginBtn: {
    marginTop: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  loginText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  logoutBtn: {
    marginTop: 6,
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  logoutText: { color: COLORS.danger, fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  switchInfo: { flex: 1, paddingRight: 12 },
  rowBtn: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  rowText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  rowSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  deleteText: { fontSize: 14, color: COLORS.danger, fontWeight: '600' },
})
