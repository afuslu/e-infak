import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '@/context/AuthContext';
import { api, currentHost, webBase } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/access';
import { authenticate, biometricAvailable, biometricEnabled, setBiometricEnabled } from '@/lib/biometric';
import { openUrl } from '@/lib/format';
import { pushEnabled, registerPush, unregisterPush } from '@/lib/notifications';
import { getItem } from '@/lib/storage';
import { Btn, Card, Chips, Field, Notice, Row, Screen, SectionTitle, SwitchRow, useUi } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { radius, space, useTheme, type ThemeMode } from '@/theme';
import { getSavedWidgetThemeStyle, refreshHomeWidgets, setWidgetThemeAndRefresh } from '@/widgets';
import {
  resolveWidgetPalette,
  WIDGET_THEME_OPTIONS,
  type WidgetThemeStyle,
} from '@/widgets/palette';

export default function Account() {
  const { me, site, signOut } = useAuth();
  const { mode, dark, colors, setMode } = useTheme();
  const ui = useUi();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bio, setBio] = useState(false);
  const [push, setPush] = useState(false);
  const [widgetTheme, setWidgetTheme] = useState<WidgetThemeStyle>('system');
  const native = Platform.OS !== 'web';

  useEffect(() => {
    biometricAvailable().then(setBioAvailable);
    biometricEnabled().then(setBio);
    pushEnabled('tenant').then(setPush);
    getSavedWidgetThemeStyle().then(setWidgetTheme);
  }, []);

  const changeWidgetTheme = async (style: WidgetThemeStyle) => {
    setWidgetTheme(style);
    await setWidgetThemeAndRefresh(style);
    notify('Widget renk teması güncellendi.');
  };

  const refreshWidgetsNow = async () => {
    setBusy('widgets');
    try {
      const ok = await refreshHomeWidgets(site?.name || undefined);
      if (ok) {
        notify('Ana ekran widget verileri yenilendi.');
      } else {
        notify('Sunucuya ulaşılamadı; son kayıtlı widget verileri korundu.', 'error');
      }
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  const previewPalette = resolveWidgetPalette(widgetTheme, dark, colors.primary);
  const selectedThemeMeta = WIDGET_THEME_OPTIONS.find((o) => o.value === widgetTheme) || WIDGET_THEME_OPTIONS[0];

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
        const result = await registerPush(true, 'tenant');
        notify(result.message, result.ok ? 'ok' : 'error');
        setPush(result.ok);
      } else {
        await unregisterPush('tenant');
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

      {native ? (
        <>
          <SectionTitle>Ana Ekran Widget Teması</SectionTitle>
          <Card style={{ gap: space.md }}>
            <Text style={ui.muted}>
              Ana ekran ve kilit ekranı widget'larınız için gündüz, koyu, zümrüt veya AMOLED renk stilini seçin.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {WIDGET_THEME_OPTIONS.map((opt) => {
                const active = widgetTheme === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => changeWidgetTheme(opt.value)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      borderRadius: radius.md,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? colors.primary : colors.line,
                      backgroundColor: active ? colors.primarySoft : colors.bg,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: opt.swatchBg,
                        borderWidth: 1,
                        borderColor: colors.line,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: opt.swatchAccent,
                        }}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: active ? '700' : '600',
                        color: active ? colors.primary : colors.text,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Canlı Widget Önizleme Kartı */}
            <View
              style={{
                backgroundColor: previewPalette.bg,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: previewPalette.border,
                padding: 14,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: previewPalette.primary }}>
                  {site?.name || 'e-İnfak'} · {selectedThemeMeta.label}
                </Text>
                <Text style={{ fontSize: 11, color: previewPalette.muted }}>Canlı Önizleme</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <Text style={{ fontSize: 11, color: previewPalette.muted }}>Bugün gelen para</Text>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: previewPalette.text }}>₺48.250</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: previewPalette.subtext }}>27 bağış</Text>
                    <View
                      style={{
                        backgroundColor: previewPalette.primarySoft,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 99,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: previewPalette.primary }}>▲ %18</Text>
                    </View>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 34 }}>
                  {[12, 18, 15, 22, 19, 27, 34].map((h, i) => (
                    <View
                      key={i}
                      style={{
                        width: 6,
                        height: h,
                        borderRadius: 3,
                        backgroundColor: i === 6 ? previewPalette.primary : previewPalette.track,
                      }}
                    />
                  ))}
                </View>
              </View>
              <Text style={{ fontSize: 11, color: previewPalette.muted }}>{selectedThemeMeta.hint}</Text>
            </View>

            <Btn
              title="Widget'ları Şimdi Yenile"
              variant="outline"
              small
              loading={busy === 'widgets'}
              onPress={refreshWidgetsNow}
            />
          </Card>
        </>
      ) : null}

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
          <SwitchRow label="Bu telefona bildirim gönder" hint="Bağış, havale, sanal POS girişleri ve görevler." value={push} onValueChange={togglePush} />
        ) : null}
        <Btn title="Bildirim ayarları" variant="outline" small onPress={() => router.push('/ayarlar/bildirimler')} />
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
