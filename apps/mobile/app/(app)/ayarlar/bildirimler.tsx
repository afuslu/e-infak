import React, { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { centsToInput, toCents } from '@/lib/format';
import { pushEnabled, registerPush, sendTestPush, unregisterPush } from '@/lib/notifications';
import { Btn, Card, Field, Notice, QueryView, Screen, SectionTitle, SwitchRow, ui } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { space } from '@/theme';

type Settings = Record<string, any>;
type Response = { settings: Settings; available: Record<string, boolean> };

const ROWS: { key: string; label: string; hint: string }[] = [
  { key: 'online', label: 'Online bağış (sanal POS)', hint: 'Sitedeki kartlı bağışlar: tutar, bağışçı, kalem, kartın son 4 hanesi.' },
  { key: 'transfer', label: 'Havale / EFT girişleri', hint: 'Bankadan otomatik eşleşen ve elle eşleştirilen havaleler, hesap ve gönderen bilgisiyle.' },
  { key: 'transfer_waiting', label: 'Eşleşmeyi bekleyen havaleler', hint: 'Banka senkronunda bağışçısı bulunamayan yeni havaleler.' },
  { key: 'offline', label: 'Elden, POS, kumbara, aidat, SMS', hint: 'Personelin kestiği makbuzlar, kumbara tahsilatları, aidatlar ve SMS bağışları.' },
  { key: 'payment_failed', label: 'Başarısız ödemeler', hint: 'Bankanın reddettiği ya da incelemeye düşen kartlı ödemeler.' },
  { key: 'refund', label: 'İadeler', hint: 'Online bağış iadeleri.' },
  { key: 'digest', label: 'Gün sonu özeti (21:00)', hint: 'Günün toplamı, kanal kanal dağılım ve düne göre değişim.' },
];

export default function NotificationSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['notification-settings'], queryFn: () => api<Response>('/mobile/notification-settings') });
  const [min, setMin] = useState('');
  const [device, setDevice] = useState(false);
  const native = Platform.OS !== 'web';

  useEffect(() => {
    if (query.data) setMin(centsToInput(query.data.settings.min_amount_cents || 0) === '0' ? '' : centsToInput(query.data.settings.min_amount_cents));
  }, [query.data]);
  useEffect(() => {
    pushEnabled().then(setDevice);
  }, []);

  const save = async (patch: Settings) => {
    try {
      const next = await api<Response>('/mobile/notification-settings', { method: 'PUT', body: patch });
      queryClient.setQueryData(['notification-settings'], next);
    } catch (e) {
      notifyError(e);
    }
  };

  const toggleDevice = async (on: boolean) => {
    try {
      if (on) {
        const result = await registerPush();
        notify(result.message, result.ok ? 'ok' : 'error');
        setDevice(result.ok);
      } else {
        await unregisterPush();
        setDevice(false);
      }
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Bildirim ayarları' }} />
      <Card>
        {native ? (
          <>
            <SwitchRow label="Bu telefona bildirim gönder" hint="Kapalıyken bildirimler yalnızca uygulamadaki kutuya düşer." value={device} onValueChange={toggleDevice} />
            {device ? <Btn title="Deneme bildirimi gönder" variant="outline" small onPress={() => sendTestPush().then(() => notify('Deneme bildirimi gönderildi.')).catch(notifyError)} /> : null}
          </>
        ) : <Text style={ui.muted}>Telefon bildirimleri uygulamada açılır; buradaki seçimler tüm cihazlarınız için geçerlidir.</Text>}
      </Card>
      <QueryView query={query}>
        {(data) => (
          <>
            <SectionTitle>Neler bildirilsin?</SectionTitle>
            <Card style={{ gap: space.md }}>
              {ROWS.filter((r) => data.available[r.key] !== false).map((r) => (
                <SwitchRow key={r.key} label={r.label} hint={r.hint} value={!!data.settings[r.key]} onValueChange={(v) => save({ [r.key]: v })} />
              ))}
            </Card>
            <SectionTitle>İnce ayar</SectionTitle>
            <Card style={{ gap: space.md }}>
              <Field label="En az tutar (TL)" value={min} onChangeText={setMin} keyboardType="decimal-pad" placeholder="Hepsi"
                hint="Bunun altındaki girişler telefona gelmez, kutuda görünür."
                onBlur={() => save({ min_amount_cents: toCents(min) || 0 })} />
              <SwitchRow label="Gece sessiz (22:00–08:00)" hint="Gece gelen bildirimler sabah kutuda olur." value={!!data.settings.quiet_hours}
                onValueChange={(v) => save({ quiet_hours: v })} />
            </Card>
            <Notice text="Bildirimler yalnızca görme yetkiniz olan bağışlar için gelir; kendi kestiğiniz makbuz için bildirim gelmez." />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
