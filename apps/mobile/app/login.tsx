import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Btn, Field, Notice, Screen } from '@/components/ui';
import { MULTI_ORG_MESSAGE, webBase } from '@/lib/api';
import { openUrl } from '@/lib/format';
import { colors, font, space } from '@/theme';

export default function Login() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState('');
  const [askHost, setAskHost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return setError('E-posta ve şifrenizi girin.');
    if (askHost && !host.trim()) return setError('Kurumunuzun web adresini girin.');
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password, askHost ? host : undefined);
    } catch (e: any) {
      const message: string = e?.message || 'Giriş yapılamadı.';
      // Aynı e-posta birden çok kurumda kayıtlıysa backend platform adresinden girişi reddeder.
      if (message.includes(MULTI_ORG_MESSAGE)) {
        setAskHost(true);
        setError('Bu e-posta birden fazla kurumda kayıtlı. Kurumunuzun web adresini yazıp tekrar deneyin.');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ paddingTop: insets.top + space.xl * 2, gap: space.lg }}>
      <View style={styles.brand}>
        <Image source={require('../assets/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
        <Text style={styles.title}>e-İnfak Yönetim</Text>
        <Text style={styles.sub}>Kurum yetkilisi hesabınızla giriş yapın. Kurumunuz hesabınızdan otomatik belirlenir.</Text>
      </View>
      {error ? <Notice text={error} tone="danger" /> : null}
      <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" autoComplete="email" textContentType="username" placeholder="ad@kurum.org" />
      <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password"
        textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
      {askHost ? (
        <Field label="Kurum web adresi" value={host} onChangeText={setHost} autoCapitalize="none" autoCorrect={false}
          keyboardType="url" placeholder="ornekdernek.org" hint="Kurumunuzun bağış sitesinin adresi." />
      ) : null}
      <Btn title="Giriş yap" onPress={submit} loading={busy} />
      <Btn title="Şifremi unuttum" variant="ghost" onPress={() => openUrl(`${webBase()}/sifremi-unuttum`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: space.sm, marginBottom: space.md },
  logo: { width: 84, height: 84, borderRadius: 20 },
  title: { fontSize: font.xxl, fontWeight: '800', color: colors.text },
  sub: { fontSize: font.md, color: colors.muted, textAlign: 'center', lineHeight: 21 },
});
