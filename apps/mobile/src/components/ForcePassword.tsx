import React, { useState } from 'react';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { getItem } from '@/lib/storage';
import { Btn, Field, Notice, Screen, useUi } from './ui';
import { notify } from './toast';
import { space } from '@/theme';

/** Kurum yöneticisinin verdiği geçici şifreyle girilince gösterilir. */
export function ForcePassword() {
  const { me, reload, signOut } = useAuth();
  const ui = useUi();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!current || !next) return setError('Geçici ve yeni şifrenizi yazın.');
    if (next.length < 10) return setError('Yeni şifre en az 10 karakter olmalı.');
    if (next !== again) return setError('Yeni şifreler birbirini tutmuyor.');
    setBusy(true);
    try {
      const refresh_token = await getItem('einfak_refresh_token');
      await api('/auth/me/password', { method: 'POST', body: { current_password: current, new_password: next, refresh_token } });
      await reload();
      notify('Şifreniz değiştirildi.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ paddingTop: insets.top + space.xl, gap: space.lg }}>
      <Text style={ui.title}>Yeni şifre belirleyin</Text>
      <Text style={ui.muted}>{me?.email} hesabına geçici bir şifreyle girdiniz. Devam etmek için kendi şifrenizi belirleyin.</Text>
      {error ? <Notice text={error} tone="danger" /> : null}
      <Field label="Geçici şifre" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Field label="Yeni şifre" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" hint="En az 10 karakter." />
      <Field label="Yeni şifre (tekrar)" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
      <Btn title="Şifreyi kaydet" onPress={submit} loading={busy} />
      <Btn title="Çıkış yap" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
