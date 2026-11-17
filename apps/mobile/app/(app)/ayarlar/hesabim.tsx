import React, { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { Stack } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '@/context/AuthContext';
import { api, currentHost, webBase } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/access';
import { authenticate, biometricAvailable, biometricEnabled, setBiometricEnabled } from '@/lib/biometric';
import { openUrl } from '@/lib/format';
import { pushEnabled, registerPush, sendTestPush, unregisterPush } from '@/lib/notifications';
import { getItem } from '@/lib/storage';
import { Btn, Card, Field, Notice, Row, Screen, SectionTitle, SwitchRow, ui } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space } from '@/theme';

export default function Account() {
  const { me, site, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bio, setBio] = useState(false);
  const [push, setPush] = useState(false);
  const native = Platform.OS !== 'web';

  useEffect(() => {
    biometricAvailable().then(setBioAvailable);
    biometricEnabled().then(setBio);
    pushEnabled().then(setPush);
  }, []);

  const changePassword = async () => {
    setError(null);
    if (!current || !next) return setError('Mevcut ve yeni şifrenizi yazın.');
    if (next.length < 10) return setError('Yeni şifre en az 10 karakter olmalı.');
    if (next !== again) return setError('Yeni şifreler birbirini tutmuyor.');
    setBusy('password');
    try {
      // refresh_token gönderilince bu cihazın oturumu açık kalır, diğer cihazlar kapanır.
      const refresh_token = await getItem('einfak_refresh_token');
      await api('/auth/me/password', { method: 'POST', body: { current_password: current, new_password: next, refresh_token } });
      setCurrent('');
      setNext('');
      setAgain('');
      notify('Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const toggleBio = async (on: boolean) => {
    if (on && !(await authenticate())) return;
    await setBiometricEnabled(on);
    setBio(on);
  };

  const togglePush = async (on: boolean) => {
    try {
      if (on) {
        const result = await registerPush();
        notify(result.message, result.ok ? 'ok' : 'error');
        setPush(result.ok);
      } else {
        await unregisterPush();
        setPush(false);
      }
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Hesabım' }} />
      <Card>
        <Row label="Ad soyad" value={me?.full_name} />
        <Row label="E-posta" value={me?.email} />
        <Row label="Rol" value={ROLE_LABELS[me?.role || ''] || me?.role} />
        <Row label="Kurum" value={site?.name} />
        <Row label="Bağlantı" value={currentHost()} />
      </Card>

      <SectionTitle>Güvenlik</SectionTitle>
      <Card style={{ gap: space.md }}>
        {native ? (
          <SwitchRow label="Biyometrik kilit" hint={bioAvailable ? 'Uygulama açılırken Face ID / parmak izi istenir.' : 'Bu cihazda biyometrik doğrulama kurulu değil.'}
            value={bio} onValueChange={toggleBio} disabled={!bioAvailable} />
        ) : <Text style={ui.muted}>Biyometrik kilit yalnızca telefonda kullanılabilir.</Text>}
      </Card>

      <SectionTitle>Bildirimler</SectionTitle>
      <Card style={{ gap: space.md }}>
        {native ? (
          <>
            <SwitchRow label="Anlık bildirimler" hint="Size görev atandığında bildirim alırsınız." value={push} onValueChange={togglePush} />
            {push ? <Btn title="Deneme bildirimi gönder" variant="outline" small onPress={() => sendTestPush().then(() => notify('Deneme bildirimi gönderildi.')).catch(notifyError)} /> : null}
          </>
        ) : <Text style={ui.muted}>Bildirimler yalnızca telefonda kullanılabilir.</Text>}
      </Card>

      <SectionTitle>Şifre değiştir</SectionTitle>
      <Card style={{ gap: space.md }}>
        {error ? <Notice text={error} tone="danger" /> : null}
        <Field label="Mevcut şifre" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
        <Field label="Yeni şifre" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" hint="En az 10 karakter." />
        <Field label="Yeni şifre (tekrar)" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" />
        <Btn title="Şifreyi değiştir" variant="outline" onPress={changePassword} loading={busy === 'password'} />
      </Card>

      <Btn title="KVKK aydınlatma metni" variant="ghost" onPress={() => openUrl(`${site?.url || webBase()}/kvkk`)} />
      <Btn title="Çıkış yap" variant="danger" loading={busy === 'out'} onPress={async () => {
        if (!(await confirm('Çıkış yapılsın mı?', undefined, 'Çıkış yap', true))) return;
        setBusy('out');
        await signOut();
      }} />
      <Text style={[ui.muted, { textAlign: 'center' }]}>e-İnfak Yönetim · sürüm {Constants.expoConfig?.version}</Text>
    </Screen>
  );
}
