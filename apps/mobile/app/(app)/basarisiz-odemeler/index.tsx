import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { call, dateTime, money, whatsapp } from '@/lib/format';
import { FailedPayment, Inflow, PERIODS, providerLabel, useFailedPayments } from '@/api/inflow';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { can } from '@/lib/access';
import { notify, notifyError } from '@/components/toast';
import { Badge, Btn, Chips, Empty, Field, ListItem, Notice, QueryView, Row, Screen, SectionTitle, Sheet, useUi } from '@/components/ui';
import { space } from '@/theme';

const isReview = (p: FailedPayment) => p.status === 'review';
const reason = (p: FailedPayment) => p.failure_message || p.attempts[0]?.response_message || 'Neden kaydedilmemiş';

function badge(p: FailedPayment) {
  if (p.retried_paid) return { label: 'Sonradan ödedi', tone: 'ok' as const };
  if (isReview(p)) return { label: 'İncelemede', tone: 'warn' as const };
  if (p.status === 'failed') return { label: 'Başarısız', tone: 'danger' as const };
  return { label: 'Sonuçlandı', tone: 'muted' as const };
}

/** Bankanın reddettiği ya da sonucu doğrulanamayan kart ödemeleri; dokununca neden ve yapılacak iş. */
export default function FailedPayments() {
  const router = useRouter();
  const ui = useUi();
  const params = useLocalSearchParams<{ order_id?: string }>();
  const [period, setPeriod] = useState<Inflow['period']>('today');
  const [selected, setSelected] = useState<FailedPayment | null>(null);
  const query = useFailedPayments(period);
  // Bildirimden gelinen kayıt başka bir güne ait olabilir; tek başına sorgulanır.
  const single = useFailedPayments('today', params.order_id);

  useEffect(() => {
    if (params.order_id && single.data?.items[0]) setSelected(single.data.items[0]);
  }, [params.order_id, single.data]);

  const queryClient = useQueryClient();
  const { access } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const close = () => { setSelected(null); setNote(null); };
  const act = async (path: 'requery' | 'close', body?: unknown) => {
    if (!selected) return;
    setBusy(path);
    try {
      const r = await api<{ message: string }>(`/mobile/failed-payments/${selected.id}/${path}`, { method: 'POST', body });
      await Promise.all(['failed-payments', 'inflow', 'stats', 'donations'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      close();
      notify(r.message);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };

  const p = selected;
  const attempt = p?.attempts[0];
  const openDonor = (id: string) => {
    close();
    router.push({ pathname: '/bagisci/[id]', params: { id } });
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Başarısız ödemeler' }} />
      <Chips options={PERIODS} value={period} onChange={(v) => setPeriod(v as Inflow['period'])} />
      <QueryView query={query}>
        {(d) => d.items.length ? (
          <View style={ui.listCard}>
            {d.items.map((x, i) => (
              <View key={x.id}>
                {i ? <View style={ui.separator} /> : null}
                <ListItem title={x.donor.name || 'İsimsiz'} subtitle={reason(x)} meta={dateTime(x.created_at)}
                  right={<><Text style={ui.amount}>{money(x.total_cents, x.currency)}</Text><Badge {...badge(x)} /></>}
                  onPress={() => setSelected(x)} />
              </View>
            ))}
            {d.total > d.items.length ? <Text style={[ui.muted, { padding: space.md }]}>{d.total} kaydın en yeni {d.items.length} tanesi gösteriliyor.</Text> : null}
          </View>
        ) : <Empty title="Sorunlu ödeme yok" text="Bu dönemde başarısız ya da incelemede online ödeme bulunmuyor." />}
      </QueryView>

      <Sheet visible={!!p} onClose={close} title={p ? money(p.total_cents, p.currency) : ''}>
        {p ? (
          <>
            {p.retried_paid ? <Notice text="Bağışçı daha sonra aynı tutarı başarıyla ödedi. Tekrar aramanız gerekmeyebilir." /> : null}
            {isReview(p) ? (
              <Notice tone="warn" text="Sonuç doğrulanamadı; para çekilmiş olabilir. Sipariş numarasıyla banka panelinden kontrol edin, kontrol etmeden tekrar ödeme istemeyin." />
            ) : p.status === 'failed' ? <Notice tone="danger" text="Banka ödemeyi onaylamadı; bağış kaydı oluşmadı." /> : null}
            <Row label="Neden" value={reason(p)} />
            <Row label="Banka kodu" value={p.failure_code || attempt?.response_code || 'Kaydedilmemiş'} />
            <Row label="Bağışçı" value={p.donor.name || 'İsimsiz'} onPress={() => openDonor(p.donor.id)} />
            {p.donor.phone ? <Row label="Telefon" value={p.donor.phone} /> : null}
            {p.donor.email ? <Row label="E-posta" value={p.donor.email} /> : null}
            {p.items.map((it, i) => (
              <Row key={i} label={`${it.campaign_title}${it.quantity > 1 ? ` × ${it.quantity}` : ''}`} value={money(it.total_amount_cents, p.currency)} />
            ))}
            <Row label="Tarih" value={dateTime(p.created_at)} />
            <Row label="Sipariş no" value={p.merchant_payment_id} />
            {attempt?.card_last_4 ? <Row label="Kart" value={`${attempt.card_brand || ''} •••• ${attempt.card_last_4}`.trim()} /> : null}
            {p.later_payments.length ? <SectionTitle>Sonraki ödemeleri</SectionTitle> : null}
            {p.later_payments.map((l) => <Row key={l.created_at} label={dateTime(l.created_at)} value={money(l.total_cents, l.currency)} />)}
            {p.attempts.length ? <SectionTitle>Deneme geçmişi</SectionTitle> : null}
            {p.attempts.map((a) => (
              <Row key={a.id} label={`${dateTime(a.created_at)} · ${providerLabel(a.provider)}`}
                value={[a.response_code, a.response_message].filter(Boolean).join(' · ') || (a.completed_at ? '—' : 'Bankadan dönüş yok')} />
            ))}
            {can(access, 'receipts.mark_paid') && (isReview(p) || p.status === 'failed') ? (
              <Btn title="Bankaya yeniden sor" loading={busy === 'requery'} disabled={!!busy} onPress={() => act('requery')} />
            ) : null}
            {can(access, 'receipts.mark_paid') && isReview(p) ? (
              note === null ? <Btn title="Ödenmedi olarak kapat" variant="danger" disabled={!!busy} onPress={() => setNote('')} /> : (
                <View style={{ gap: space.sm }}>
                  <Field label="Kapatma nedeni" value={note} onChangeText={setNote} maxLength={300} />
                  <Btn title="Kapat" variant="danger" loading={busy === 'close'} disabled={!!busy || note.trim().length < 3} onPress={() => act('close', { note: note.trim() })} />
                </View>
              )
            ) : null}
            {p.donor.phone ? (
              <View style={ui.rowGap}>
                <Btn title="Ara" style={{ flex: 1 }} onPress={() => call(p.donor.phone!)} />
                <Btn title="WhatsApp" variant="outline" style={{ flex: 1 }} onPress={() => whatsapp(p.donor.phone!)} />
              </View>
            ) : null}
            <Btn title="Bağışçıyı aç" variant="outline" onPress={() => openDonor(p.donor.id)} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
