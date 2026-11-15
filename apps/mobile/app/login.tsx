import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'

export default function LoginScreen() {
  const router = useRouter()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantHost, setTenantHost] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Eksik Bilgi', 'E-posta ve şifre zorunludur.')
      return
    }
    setLoading(true)
    try {
      await signIn(email, password, tenantHost)
      router.replace('/(tabs)')
    } catch (err: any) {
      Alert.alert('Giriş Başarısız', err?.message || 'Bilgilerinizi kontrol edin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.page}
    >
      <View style={styles.card}>
        <Text style={styles.title}>e-İnfak Hesabına Giriş</Text>
        <Text style={styles.sub}>
          Bağışçı veya yetkili personel hesabınızla oturum açın.
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="E-posta adresiniz"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Şifreniz"
          secureTextEntry
          style={styles.input}
        />
        <TextInput
          value={tenantHost}
          onChangeText={setTenantHost}
          placeholder="Kurum alan adı (opsiyonel, ör. dernek.e-infak.org)"
          autoCapitalize="none"
          style={styles.input}
        />

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.btnText}>Giriş Yap</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    backgroundColor: '#f8fafc',
  },
  btn: {
    marginTop: 6,
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
})
