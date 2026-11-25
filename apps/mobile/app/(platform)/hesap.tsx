import React, { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { Stack } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '@/context/AuthContext';
import { currentHost, pf, updatePlatformToken } from '@/lib/api';
import { authenticate, biometricAvailable, biometricEnabled, setBiometricEnabled } from '@/lib/biometric';
import { pushEnabled, registerPush, sendTestPush, unregisterPush } from '@/lib/notifications';
import { Btn, Card, Chips, Field, Notice, Row, Screen, SectionTitle, SwitchRow, useUi } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space, useTheme, type ThemeMode } from '@/theme';

export default function PlatformAccountScreen() {
  const { platformMe, reload, signOut } = useAuth();
  const { mode, setMode } = useTheme();
  const ui = useUi();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bio, setBio] = useState(false);
  const [push, setPush] = useState(false);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const native = Platform.OS !== 'web';

  useEffect(() => {
    biometricAvailable().then(setBioAvailable);
    biometricEnabled().then(setBio);
    pushEnabled('platform').then(setPush);
  }, []);

  const togglePush = async (on: boolean) => {
    try {
      if (on) {
        const res = await registerPush(true, 'platform');
        notify(res.message, res.ok ? 'ok' : 'error');
        setPush(res.ok);
      } else {
        await unregisterPush('platform');
        setPush(false);
      }
    } catch (e) {
      notifyError(e);
    }
  };

  const changePassword = async () => {
    setError(null);
    if (!current || !next) return setError('Mevcut ve yeni şifrenizi yazın.');
    if (next.length < 10) return setError('Yeni şifre en az 10 karakter olmalı.');
    if (next !== again) return setError('Yeni şifreler birbirini tutmuyor.');
    setBusy(true);
    try {
      const res = await pf<{ access_token?: string }>('/me/password', { method: 'POST', body: { current_password: current, new_password: next } });
      if (res?.access_token) await updatePlatformToken(res.access_token);
      setCurrent('');
      setNext('');
      setAgain('');
      notify('Platform şifreniz değiştirildi.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleBio = async (on: boolean) => {
    if (on && !(await authenticate())) return;
    await setBiometricEnabled(on);
    setBio(on);
  };

  const setup2fa = async () => {
    setTotpBusy(true);
    try {
      const res = await pf<{ secret: string }>('/me/2fa/setup', { method: 'POST' });
      setTotpSecret(res.secret);
      setTotpCode('');
    } catch (e: any) {
      notify(e.message || '2FA başlatılamadı', 'error');
    } finally {
      setTotpBusy(false);
    }
  };

  const verify2fa = async () => {
    if (!totpCode.trim()) return;
    setTotpBusy(true);
    try {
      await pf('/me/2fa/verify', { method: 'POST', body: { code: totpCode.trim() } });
      setTotpSecret(null);
      setTotpCode('');
      await reload();
      notify('2FA etkinleştirildi.');
    } catch (e: any) {
      notify(e.message || 'Kod doğrulanamadı', 'error');
    } finally {
      setTotpBusy(false);
    }
  };

  const disable2fa = async () => {
    if (!totpCode.trim()) return notify('2FA kapatmak için mevcut 6 haneli kodu girin.', 'error');
    setTotpBusy(true);
    try {
      await pf('/me/2fa/disable', { method: 'POST', body: { code: totpCode.trim() } });
      setTotpCode('');
      await reload();
      notify('2FA devre dışı bırakıldı.');
    } catch (e: any) {
      notify(e.message || '2FA kapatılamadı', 'error');
    } finally {
      setTotpBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Platform Hesabım' }} />
      <Card>
        <Row label="Ad soyad" value={platformMe?.full_name} />
        <Row label="E-posta" value={platformMe?.email} />
        <Row label="Rol" value={platformMe?.role} />
        <Row label="2FA" value={platformMe?.totp_enabled ? 'Etkin' : 'Kapalı'} />
        <Row label="Bağlantı" value={currentHost()} />
      </Card>

      <SectionTitle>Görünüm</SectionTitle>
      <Card style={{ gap: space.sm }}>
        <Chips<ThemeMode>
          options={[
            { value: 'system', label: 'Sistem' },
            { value: 'light', label: 'Açık' },
            { value: 'dark', label: 'Koyu' },
          ]}
          value={mode}
          onChange={setMode}
          wrap
        />
      </Card>

      <SectionTitle>Bildirimler</SectionTitle>
      <Card style={{ gap: space.md }}>
        {native ? (
          <>
            <SwitchRow
              label="Bu telefona platform bildirimleri gönder"
              hint="Yeni destek talebi, demo başvurusu ve mağaza yayın başvuruları."
              value={push}
              onValueChange={togglePush}
            />
            {push ? (
              <Btn
                title="Deneme bildirimi gönder"
                variant="outline"
                small
                onPress={() => sendTestPush('platform').then(() => notify('Deneme bildirimi gönderildi.')).catch(notifyError).finally(() => pushEnabled('platform').then(setPush))}
              />
            ) : null}
          </>
        ) : (
          <Text style={ui.muted}>Telefon bildirimleri yalnızca mobil uygulamada açılır.</Text>
        )}
      </Card>

      <SectionTitle>Güvenlik & 2FA</SectionTitle>
      <Card style={{ gap: space.md }}>
        {native ? (
          <SwitchRow
            label="Biyometrik kilit"
            hint={bioAvailable ? 'Uygulama açılırken Face ID / parmak izi istenir.' : 'Bu cihazda biyometrik doğrulama kurulu değil.'}
            value={bio}
            onValueChange={toggleBio}
            disabled={!bioAvailable}
          />
        ) : <Text style={ui.muted}>Biyometrik kilit yalnızca telefonda kullanılabilir.</Text>}
        {platformMe?.totp_enabled ? (
          <>
            <Field label="2FA Kapatma Kodu" value={totpCode} onChangeText={setTotpCode} keyboardType="number-pad" placeholder="6 haneli kod" />
            <Btn title="2FA'yı Devre Dışı Bırak" variant="danger" small loading={totpBusy} onPress={disable2fa} />
          </>
        ) : totpSecret ? (
          <>
            <Notice text={`Doğrulama uygulamanıza (Authenticator) bu gizli anahtarı ekleyin: ${totpSecret}`} tone="info" />
            <Field label="Uygulamadaki 6 Haneli Kod" value={totpCode} onChangeText={setTotpCode} keyboardType="number-pad" placeholder="123456" />
            <Btn title="2FA'yı Doğrula ve Aç" small loading={totpBusy} onPress={verify2fa} />
          </>
        ) : (
          <Btn title="2FA Kurulumunu Başlat" variant="outline" small loading={totpBusy} onPress={setup2fa} />
        )}
      </Card>

      <SectionTitle>Şifre değiştir</SectionTitle>
      <Card style={{ gap: space.md }}>
        {error ? <Notice text={error} tone="danger" /> : null}
        <Field label="Mevcut şifre" value={current} onChangeText={setCurrent} secureTextEntry />
        <Field label="Yeni şifre" value={next} onChangeText={setNext} secureTextEntry hint="En az 10 karakter." />
        <Field label="Yeni şifre (tekrar)" value={again} onChangeText={setAgain} secureTextEntry />
        <Btn title="Şifreyi değiştir" onPress={changePassword} loading={busy} />
      </Card>

      <Btn
        title="Çıkış yap"
        variant="danger"
        onPress={async () => {
          if (await confirm('Platform oturumundan çıkış yapılsın mı?')) await signOut();
        }}
      />
      <Text style={[ui.muted, { textAlign: 'center', fontSize: 12 }]}>
        e-İnfak Mobil v{Constants.expoConfig?.version || '2.0.0'}
      </Text>
    </Screen>
  );
}
