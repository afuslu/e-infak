import React, { useEffect, useRef, useState } from 'react';
import { Platform, Text } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { centsToInput, toCents } from '@/lib/format';
import { pushEnabled, registerPush, sendTestPush, unregisterPush } from '@/lib/notifications';
import { Btn, Card, Field, Notice, QueryView, Screen, SectionTitle, SwitchRow, useUi } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { space } from '@/theme';

type Settings = Record<string, any>;
type Response = { settings: Settings; available: Record<string, boolean> };

const FINANCE_ROWS = [
  { key: 'online', label: 'Online bağış (sanal POS)', hint: 'Sitedeki kartlı bağışlar: tutar, bağışçı, kalem, kartın son 4 hanesi.' },
  { key: 'transfer', label: 'Havale / EFT girişleri', hint: 'Bankadan otomatik eşleşen ve elle eşleştirilen havaleler.' },
  { key: 'transfer_waiting', label: 'Eşleşmeyi bekleyen havaleler', hint: 'Banka senkronunda bağışçısı bulunamayan yeni havaleler.' },
  { key: 'offline', label: 'Elden, POS, kumbara, aidat, SMS', hint: 'Personelin kestiği makbuzlar, kumbara tahsilatları, aidatlar ve SMS bağışları.' },
  { key: 'large_donation', label: 'Büyük bağış özel alarmı', hint: 'Belirlediğiniz tutarın üzerindeki bağışlarda yüksek öncelikli uyarı.' },
  { key: 'payment_failed', label: 'Başarısız ödemeler', hint: 'Bankanın reddettiği ya da incelemeye düşen kartlı ödemeler.' },
  { key: 'recurring_failed', label: 'Düzenli bağış / aidat uyarısı', hint: 'Otomatik çekimi başarısız olan veya günü geçen düzenli bağışlar.' },
  { key: 'refund', label: 'İadeler', hint: 'Online bağış iadeleri.' },
];

const OPS_ROWS = [
  { key: 'tasks', label: 'Görev ataması ve son tarih', hint: 'Size yeni görev atandığında veya teslim günü yaklaştığında.' },
  { key: 'donor_reminders', label: 'Bağışçı arama hatırlatmaları', hint: 'Planlanmış bağışçı arama / takip zamanı geldiğinde.' },
  { key: 'money_box_due', label: 'Kumbara toplama zamanı', hint: 'Değişim/toplama günü gelen kumbaralar için hatırlatma.' },
  { key: 'campaign_milestone', label: 'Kampanya hedef bildirimleri', hint: 'Aktif bir kampanya %50, %80 veya %100 hedefine ulaştığında.' },
  { key: 'whatsapp_inbox', label: 'WhatsApp mesaj ve aramaları', hint: 'Bağışçı WhatsApp’tan yazdığında veya aradığında.' },
  { key: 'system_alert', label: 'Sistem & SMS bakiye uyarıları', hint: 'SMS kredisi azaldığında veya banka senkron bağlantısı koptuğunda.' },
];

const SUMMARY_ROWS = [
  { key: 'digest', label: 'Gün sonu özeti (21:00)', hint: 'Günün toplamı, kanal kanal dağılım ve düne göre değişim.' },
  { key: 'weekly_digest', label: 'Haftalık yönetici özeti', hint: 'Haftanın toplamı, en çok bağış alan kalemler ve geçen haftayla kıyas.' },
];

const DEFAULT_LARGE_CENTS = 1_000_000;

export default function NotificationSettings() {
  const queryClient = useQueryClient();
  const ui = useUi();
  const query = useQuery({ queryKey: ['notification-settings'], queryFn: () => api<Response>('/mobile/notification-settings') });
  const [min, setMin] = useState('');
  const [largeMin, setLargeMin] = useState('');
  const [device, setDevice] = useState(false);
  const dirtyRef = useRef<{ min?: string; large?: string }>({});
  const native = Platform.OS !== 'web';

  useEffect(() => {
    if (query.data) {
      const m = centsToInput(query.data.settings.min_amount_cents || 0);
      setMin(m === '0' ? '' : m);
      const rawLarge = query.data.settings.large_donation_cents ?? DEFAULT_LARGE_CENTS;
      const lm = centsToInput(rawLarge > 0 ? rawLarge : DEFAULT_LARGE_CENTS);
      setLargeMin(lm);
      dirtyRef.current = {};
    }
  }, [query.data]);

  useEffect(() => {
    pushEnabled('tenant').then(setDevice);
  }, []);

  const save = async (patch: Settings) => {
    try {
      const next = await api<Response>('/mobile/notification-settings', { method: 'PUT', body: patch });
      queryClient.setQueryData(['notification-settings'], next);
    } catch (e) {
      notifyError(e);
    }
  };

  // Kullanıcı tutar yazıp doğrudan geri tuşuna basarsa yazılan eşik kaybolmasın.
  useEffect(() => {
    return () => {
      const pending: Settings = {};
      if (dirtyRef.current.min !== undefined) {
        pending.min_amount_cents = toCents(dirtyRef.current.min) || 0;
      }
      if (dirtyRef.current.large !== undefined) {
        const cents = toCents(dirtyRef.current.large);
        pending.large_donation_cents = cents && cents > 0 ? cents : DEFAULT_LARGE_CENTS;
      }
      if (Object.keys(pending).length > 0) {
        api<Response>('/mobile/notification-settings', { method: 'PUT', body: pending })
          .then((next) => queryClient.setQueryData(['notification-settings'], next))
          .catch(() => {});
      }
    };
  }, [queryClient]);

  const commitMin = () => {
    dirtyRef.current.min = undefined;
    void save({ min_amount_cents: toCents(min) || 0 });
  };

  const commitLarge = () => {
    dirtyRef.current.large = undefined;
    const cents = toCents(largeMin);
    if (!cents || cents <= 0) {
      setLargeMin(centsToInput(DEFAULT_LARGE_CENTS));
      void save({ large_donation_cents: DEFAULT_LARGE_CENTS });
    } else {
      void save({ large_donation_cents: cents });
    }
  };

  const toggleDevice = async (on: boolean) => {
    try {
      if (on) {
        const result = await registerPush(true, 'tenant');
        notify(result.message, result.ok ? 'ok' : 'error');
        setDevice(result.ok);
      } else {
        await unregisterPush('tenant');
        setDevice(false);
      }
    } catch (e) {
      notifyError(e);
    }
  };

  const renderGroup = (title: string, rows: typeof FINANCE_ROWS, data: Response) => {
    const visible = rows.filter((r) => data.available[r.key] !== false);
    if (!visible.length) return null;
    return (
      <>
        <SectionTitle>{title}</SectionTitle>
        <Card style={{ gap: space.md }}>
          {visible.map((r) => (
            <SwitchRow
              key={r.key}
              label={r.label}
              hint={r.hint}
              value={!!data.settings[r.key]}
              onValueChange={(v) => save({ [r.key]: v })}
            />
          ))}
        </Card>
      </>
    );
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Bildirim ayarları' }} />
      <Card>
        {native ? (
          <>
            <SwitchRow
              label="Bu telefona bildirim gönder"
              hint="Kapalıyken bildirimler yalnızca uygulamadaki kutuya düşer."
              value={device}
              onValueChange={toggleDevice}
            />
            {device ? (
              <Btn
                title="Deneme bildirimi gönder"
                variant="outline"
                small
                onPress={() => sendTestPush('tenant').then(() => notify('Deneme bildirimi gönderildi.')).catch(notifyError).finally(() => pushEnabled('tenant').then(setDevice))}
              />
            ) : null}
          </>
        ) : (
          <Text style={ui.muted}>Telefon bildirimleri uygulamada açılır; buradaki seçimler tüm cihazlarınız için geçerlidir.</Text>
        )}
      </Card>
      <QueryView query={query}>
        {(data) => (
          <>
            {renderGroup('Finans ve Ödeme', FINANCE_ROWS, data)}
            {renderGroup('Operasyon ve Saha', OPS_ROWS, data)}
            {renderGroup('Özet Raporlar', SUMMARY_ROWS, data)}
            <SectionTitle>İnce ayar</SectionTitle>
            <Card style={{ gap: space.md }}>
              <Field
                label="En az bildirim tutarı (TL)"
                value={min}
                onChangeText={(v) => { setMin(v); dirtyRef.current.min = v; }}
                keyboardType="decimal-pad"
                placeholder="Hepsi"
                hint="Bunun altındaki girişler telefona gelmez, kutuda görünür."
                onBlur={commitMin}
                onSubmitEditing={commitMin}
              />
              {data.available.large_donation !== false && data.settings.large_donation ? (
                <Field
                  label="Büyük bağış alarm eşiği (TL)"
                  value={largeMin}
                  onChangeText={(v) => { setLargeMin(v); dirtyRef.current.large = v; }}
                  keyboardType="decimal-pad"
                  placeholder="10000"
                  hint="Bu tutar ve üzerindeki bağışlar gece sessiz modda bile yüksek öncelikli kanaldan bildirilir."
                  onBlur={commitLarge}
                  onSubmitEditing={commitLarge}
                />
              ) : null}
              <SwitchRow
                label="Gece sessiz (22:00–08:00)"
                hint="Gece gelen bildirimler sabah kutuda olur."
                value={!!data.settings.quiet_hours}
                onValueChange={(v) => save({ quiet_hours: v })}
              />
            </Card>
            <Notice text="Android telefon ayarlarından Para Girişleri, Acil Uyarılar ve Görevler kanalları için ayrı bildirim sesi seçebilirsiniz." />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
