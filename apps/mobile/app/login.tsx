import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicSite, resolveMediaUrl } from '@/api/public';
import { ACTIVE_TENANT, isWhiteLabel } from '@/config/tenant';
import { useAuth } from '@/context/AuthContext';
import { Btn, Chips, Field, Notice, Screen } from '@/components/ui';
import { loadRememberedLogin, MULTI_ORG_MESSAGE, saveRememberedLogin, sendDonorOtp, webBase } from '@/lib/api';
import { notify } from '@/components/toast';
import { openUrl } from '@/lib/format';
import { font, radius, space, useTheme } from '@/theme';

type EntryTab = 'staff' | 'donor';

/** Kuruma özel uygulamada giriş ekranının logosu; ortak uygulamada kurum henüz bilinmez. */
function useTenantSite() {
  const { data } = useQuery({
    queryKey: ['public', 'site', ACTIVE_TENANT?.slug || 'default'],
    queryFn: fetchPublicSite,
    enabled: !!ACTIVE_TENANT,
    staleTime: 5 * 60_000,
  });
  return { site: data };
}

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { signInUnified, signInDonor, signInDonorPassword } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const whiteLabel = isWhiteLabel();
  const { site: tenantSite } = useTenantSite();
  const tenantLogo = resolveMediaUrl(tenantSite?.logo_url, tenantSite?.url);
  const brandName = ACTIVE_TENANT?.name || 'e-İnfak';
  const [tab, setTab] = useState<EntryTab>(
    params.tab === 'staff' ? 'staff' : (whiteLabel ? 'donor' : 'staff'),
  );
  const activeTab: EntryTab = whiteLabel ? tab : 'staff';

  useEffect(() => {
    if (params.tab === 'staff' || params.tab === 'donor') {
      setTab(params.tab);
      setError(null);
    }
  }, [params.tab]);

  // Şifreli Giriş (Kurum & Platform ortak - E-posta veya Telefondan otomatik tanır)
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [askTotp, setAskTotp] = useState(false);
  const [totpForPlatform, setTotpForPlatform] = useState(false);
  const [host, setHost] = useState('');
  const [askHost, setAskHost] = useState(false);

  // Bağışçı Girişi (Şifre ile veya SMS/E-posta Kodu ile)
  const [donorMethod, setDonorMethod] = useState<'otp' | 'password'>('otp');
  const [donorContact, setDonorContact] = useState('');
  const [donorPassword, setDonorPassword] = useState('');
  const [donorOtp, setDonorOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Ortak
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRememberedLogin().then((saved) => {
      setRememberMe(saved.remember);
      if (saved.remember) {
        if (saved.identifier) setIdentifier(saved.identifier);
        if (saved.host) {
          setHost(saved.host);
          setAskHost(true);
        }
        if (saved.donorContact) setDonorContact(saved.donorContact);
      }
    });
  }, []);

  const switchTab = (next: EntryTab) => {
    setTab(next);
    setError(null);
  };

  const toggleRemember = () => {
    const next = !rememberMe;
    setRememberMe(next);
    if (!next) {
      saveRememberedLogin({ remember: false }).catch(() => {});
    }
  };

  const submitStaff = async () => {
    if (!identifier.trim() || !password) return setError('E-posta veya telefon numaranızı ve şifrenizi girin.');
    if (askHost && !host.trim()) return setError('Kurumunuzun web adresini girin.');
    if (askTotp && !totpCode.trim()) return setError('2FA doğrulama kodunu girin.');
    setBusy(true);
    setError(null);
    try {
      await signInUnified(identifier, password, {
        tenantHost: askHost ? host : undefined,
        totpCode: askTotp ? totpCode : undefined,
        preferPlatform: totpForPlatform,
      });
      await saveRememberedLogin({
        remember: rememberMe,
        identifier: identifier.trim(),
        host: askHost && host.trim() ? host.trim() : '',
      });
    } catch (e: any) {
      const message: string = e?.message || 'Giriş yapılamadı.';
      if (message === 'totp_required') {
        setAskTotp(true);
        setTotpForPlatform(true);
        setError('Hesabınızda 2FA etkin. Doğrulama uygulamanızdaki 6 haneli kodu girin.');
      } else if (message.includes('2FA doğrulama kodu gereklidir')) {
        setAskTotp(true);
        setTotpForPlatform(false);
        setError('Hesabınızda 2FA etkin. Doğrulama uygulamanızdaki 6 haneli kodu girin.');
      } else if (message.includes(MULTI_ORG_MESSAGE)) {
        setAskHost(true);
        setError('Bu hesap birden fazla kurumda kayıtlı. Kurumunuzun adını veya web adresini yazıp tekrar deneyin.');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const requestDonorCode = async () => {
    if (!donorContact.trim()) return setError('Telefon numaranızı veya e-posta adresinizi girin.');
    setBusy(true);
    setError(null);
    try {
      const res = await sendDonorOtp(donorContact);
      setOtpSent(true);
      notify(res.message);
    } catch (e: any) {
      setError(e?.message || 'Doğrulama kodu gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const verifyDonorCode = async () => {
    if (!donorOtp.trim()) return setError('Gönderilen 6 haneli doğrulama kodunu girin.');
    setBusy(true);
    setError(null);
    try {
      await signInDonor(donorContact, donorOtp);
      await saveRememberedLogin({
        remember: rememberMe,
        donorContact: donorContact.trim(),
      });
    } catch (e: any) {
      setError(e?.message || 'Doğrulama başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const submitDonorPassword = async () => {
    if (!donorContact.trim() || !donorPassword) return setError('Telefon/e-posta ve şifrenizi girin.');
    setBusy(true);
    setError(null);
    try {
      await signInDonorPassword(donorContact, donorPassword);
      await saveRememberedLogin({
        remember: rememberMe,
        donorContact: donorContact.trim(),
      });
    } catch (e: any) {
      setError(e?.message || 'Giriş yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ paddingTop: insets.top + (whiteLabel ? space.md : space.xl * 1.5), gap: space.lg }}>
      {whiteLabel ? (
        <Pressable
          onPress={() => router.back()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 }}
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: font.md, fontWeight: '600' }}>Vitrine Dön</Text>
        </Pressable>
      ) : null}
      <View style={styles.brand}>
        <Image
          source={ACTIVE_TENANT?.slug === 'hakder' ? require('../assets/tenants/hakder/icon.png') : tenantLogo ? { uri: tenantLogo } : require('../assets/icon.png')}
          style={styles.logo}
          accessibilityIgnoresInvertColors
        />
        <Text style={[styles.title, { color: colors.text }]}>
          {activeTab === 'donor' ? `${brandName} Bağışçı Paneli` : `${brandName} Giriş`}
        </Text>
        {activeTab === 'donor' ? (
          <Text style={[styles.sub, { color: colors.muted }]}>
            Telefon numaranız veya e-posta adresinizle giriş yaparak tüm bağışlarınızı, su kuyularınızı ve kurban hisselerinizi takip edin.
          </Text>
        ) : null}
      </View>

      {whiteLabel ? (
        <View style={{ alignItems: 'center' }}>
          <Chips<EntryTab>
            options={[
              { value: 'donor', label: 'Bağışçı Girişi' },
              { value: 'staff', label: 'Yetkili Girişi' },
            ]}
            value={activeTab}
            onChange={switchTab}
          />
        </View>
      ) : null}

      {error ? <Notice text={error} tone="danger" /> : null}

      {activeTab === 'staff' ? (
        <>
          <Field
            label="E-posta veya Telefon"
            value={identifier}
            onChangeText={(v) => { setIdentifier(v); if (askTotp) setAskTotp(false); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="username"
            textContentType="username"
            placeholder="ad@kurum.org veya 05XX XXX XX XX"
          />
          <Field
            label="Şifre"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={submitStaff}
            returnKeyType="go"
          />
          {askTotp ? (
            <Field
              label="2FA Doğrulama Kodu"
              value={totpCode}
              onChangeText={setTotpCode}
              keyboardType="number-pad"
              maxLength={12}
              placeholder="123456"
              onSubmitEditing={submitStaff}
            />
          ) : null}
          {askHost ? (
            <Field
              label="Kurum adı veya web adresi"
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="hakder veya hakder.org"
              hint="Aynı hesap birden fazla kurumda kayıtlı olduğunda kurumunuzu seçmek için kullanılır."
            />
          ) : null}

          <Pressable
            onPress={toggleRemember}
            style={styles.rememberRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: rememberMe ? colors.primary : colors.line,
                  backgroundColor: rememberMe ? colors.primary : colors.card,
                },
              ]}
            >
              {rememberMe ? <Check size={14} color={colors.white} /> : null}
            </View>
            <Text style={[styles.rememberText, { color: colors.text }]}>Beni hatırla</Text>
          </Pressable>

          <Btn title="Giriş yap" onPress={submitStaff} loading={busy} />
          <Btn title="Şifremi unuttum" variant="ghost" onPress={() => openUrl(`${webBase()}/sifremi-unuttum`)} />
        </>
      ) : (
        <>
          <View style={{ alignItems: 'center' }}>
            <Chips<'otp' | 'password'>
              options={[
                { value: 'otp', label: 'SMS / E-posta Kodu' },
                { value: 'password', label: 'Şifre ile Giriş' },
              ]}
              value={donorMethod}
              onChange={(m) => { setDonorMethod(m); setError(null); }}
            />
          </View>
          <Field
            label="Telefon veya E-posta"
            value={donorContact}
            onChangeText={(v) => { setDonorContact(v); if (otpSent) setOtpSent(false); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="05XX XXX XX XX veya ad@ornek.com"
            hint={
              donorMethod === 'otp'
                ? 'İlk kez giriş yapıyorsanız telefon numaranızı girmeniz yeterlidir; hesabınız otomatik oluşturulur.'
                : 'Ayarlar bölümünden belirlediğiniz şifre ile giriş yapın.'
            }
          />
          {donorMethod === 'password' ? (
            <Field
              label="Şifre"
              value={donorPassword}
              onChangeText={setDonorPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={submitDonorPassword}
              returnKeyType="go"
            />
          ) : otpSent ? (
            <Field
              label="Doğrulama Kodu (6 Haneli)"
              value={donorOtp}
              onChangeText={setDonorOtp}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
              onSubmitEditing={verifyDonorCode}
            />
          ) : null}

          <Pressable
            onPress={toggleRemember}
            style={styles.rememberRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: rememberMe ? colors.primary : colors.line,
                  backgroundColor: rememberMe ? colors.primary : colors.card,
                },
              ]}
            >
              {rememberMe ? <Check size={14} color={colors.white} /> : null}
            </View>
            <Text style={[styles.rememberText, { color: colors.text }]}>Beni hatırla</Text>
          </Pressable>

          {donorMethod === 'password' ? (
            <Btn title="Giriş Yap" onPress={submitDonorPassword} loading={busy} />
          ) : !otpSent ? (
            <Btn title="Doğrulama Kodu Gönder" onPress={requestDonorCode} loading={busy} />
          ) : (
            <View style={{ gap: space.sm }}>
              <Btn title="Doğrula ve Giriş Yap" onPress={verifyDonorCode} loading={busy} />
              <Btn title="Yeni Kod Gönder" variant="ghost" onPress={requestDonorCode} disabled={busy} />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  logo: { width: 84, height: 84, borderRadius: 20 },
  title: { fontSize: font.xxl, fontWeight: '800' },
  sub: { fontSize: font.md, textAlign: 'center', lineHeight: 21 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rememberText: { fontSize: font.md, fontWeight: '500' },
});
