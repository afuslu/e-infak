import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Btn, Chips, Field, Notice, Screen } from '@/components/ui';
import { MULTI_ORG_MESSAGE, webBase } from '@/lib/api';
import { openUrl } from '@/lib/format';
import { font, space, useTheme } from '@/theme';

type LoginMode = 'tenant' | 'platform';

export default function Login() {
  const { signIn, signInPlatform } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [loginMode, setLoginMode] = useState<LoginMode>('tenant');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [askTotp, setAskTotp] = useState(false);
  const [host, setHost] = useState('');
  const [askHost, setAskHost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (next: LoginMode) => {
    setLoginMode(next);
    setError(null);
    setAskHost(false);
    setAskTotp(false);
  };

  const submit = async () => {
    if (!email.trim() || !password) return setError('E-posta ve şifrenizi girin.');
    if (loginMode === 'tenant' && askHost && !host.trim()) return setError('Kurumunuzun web adresini girin.');
    if (loginMode === 'platform' && askTotp && !totpCode.trim()) return setError('2FA doğrulama kodunu girin.');
    setBusy(true);
    setError(null);
    try {
      if (loginMode === 'platform') {
        await signInPlatform(email, password, askTotp ? totpCode : undefined);
      } else {
        await signIn(email, password, askHost ? host : undefined);
      }
    } catch (e: any) {
      const message: string = e?.message || 'Giriş yapılamadı.';
      if (loginMode === 'platform' && message === 'totp_required') {
        setAskTotp(true);
        setError('Hesabınızda 2FA etkin. Doğrulama uygulamanızdaki 6 haneli kodu girin.');
      } else if (loginMode === 'tenant' && message.includes(MULTI_ORG_MESSAGE)) {
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
        <Text style={[styles.title, { color: colors.text }]}>
          {loginMode === 'platform' ? 'e-İnfak Platform' : 'e-İnfak Yönetim'}
        </Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          {loginMode === 'platform'
            ? 'e-İnfak platform yöneticisi / operatör hesabınızla giriş yapın.'
            : 'Kurum yetkilisi hesabınızla giriş yapın. Kurumunuz hesabınızdan otomatik belirlenir.'}
        </Text>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Chips<LoginMode>
          options={[
            { value: 'tenant', label: 'Kurum Yöneticisi' },
            { value: 'platform', label: 'Platform Yöneticisi' },
          ]}
          value={loginMode}
          onChange={switchMode}
        />
      </View>
      {error ? <Notice text={error} tone="danger" /> : null}
      <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" autoComplete="email" textContentType="username"
        placeholder={loginMode === 'platform' ? 'operator@e-infak.org' : 'ad@kurum.org'} />
      <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password"
        textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
      {loginMode === 'platform' && askTotp ? (
        <Field label="2FA Doğrulama Kodu" value={totpCode} onChangeText={setTotpCode}
          keyboardType="number-pad" maxLength={12} placeholder="123456" onSubmitEditing={submit} />
      ) : null}
      {loginMode === 'tenant' && askHost ? (
        <Field label="Kurum web adresi" value={host} onChangeText={setHost} autoCapitalize="none" autoCorrect={false}
          keyboardType="url" placeholder="ornekdernek.org" hint="Kurumunuzun bağış sitesinin adresi." />
      ) : null}
      <Btn title="Giriş yap" onPress={submit} loading={busy} />
      {loginMode === 'tenant' ? (
        <Btn title="Şifremi unuttum" variant="ghost" onPress={() => openUrl(`${webBase()}/sifremi-unuttum`)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: space.sm, marginBottom: space.md },
  logo: { width: 84, height: 84, borderRadius: 20 },
  title: { fontSize: font.xxl, fontWeight: '800' },
  sub: { fontSize: font.md, textAlign: 'center', lineHeight: 21 },
});
