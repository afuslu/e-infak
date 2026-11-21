import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { af } from '@/lib/api';
import { centsToInput, date, money, toCents } from '@/lib/format';
import { useDebounced } from '@/lib/paged';
import { Badge, Btn, Chips, Empty, Field, ListItem, Notice, QueryView, Row, Screen, SearchBar, Sheet, Stat, ui } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space } from '@/theme';

type Sub = {
  id: string; donor_id: string; donor_name: string; donor_phone: string | null; campaign_title: string; amount_cents: number; currency: string;
  status: string; mode: 'card' | 'reminder'; day_of_month: number | null; has_card_token: boolean; card_brand: string | null; card_last4: string | null;
  failed_attempts: number; last_error: string | null; last_charged_at: string | null; next_billing_date: string | null;
};
type SubList = { items: Sub[]; total: number; recurring_enabled: boolean; summary: { counts: Record<string, number>; monthly_totals: Record<string, number> } };

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }> = {
  active: { label: 'Aktif', tone: 'ok' }, paused: { label: 'Duraklatıldı', tone: 'warn' },
  past_due: { label: 'Ödeme alınamadı', tone: 'danger' }, cancelled: { label: 'İptal', tone: 'muted' },
};
const FILTERS = [{ value: 'all', label: 'Tümü' }, ...Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))];

export default function Subscriptions() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('all');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Sub | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const q = useDebounced(term);
  const query = useQuery({
    queryKey: ['subscriptions', status, q],
    queryFn: () => af<SubList>('/subscriptions', { query: { status: status === 'all' ? undefined : status, q: q.trim() || undefined, limit: 200 } }),
  });

  const open = (s: Sub) => {
    setSelected(s);
    setAmount(centsToInput(s.amount_cents));
  };

  const run = async (name: string, action: () => Promise<string>) => {
    setBusy(name);
    try {
      const message = await action();
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      setSelected(null);
      notify(message);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(null);
    }
  };
  const patch = (body: Record<string, unknown>) => af(`/subscriptions/${selected!.id}`, { method: 'PATCH', body });

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Düzenli ödemeler' }} />
      <QueryView query={query}>
        {(data) => (
          <>
            {!data.recurring_enabled ? <Notice tone="warn" text="Kurumunuzda düzenli bağış talimatı alma kapalı; mevcut talimatlar yönetilebilir." /> : null}
            <View style={ui.wrapGap}>
              <Stat label="Aktif talimat" value={String(data.summary.counts.active || 0)} />
              <Stat label="Aylık beklenen" value={Object.entries(data.summary.monthly_totals || {}).map(([c, v]) => money(v, c)).join(' · ') || money(0)} />
            </View>
            <SearchBar value={term} onChangeText={setTerm} placeholder="Bağışçı adı ya da telefon" />
            <Chips options={FILTERS} value={status} onChange={setStatus} />
            {data.items.length ? (
              <View style={ui.listCard}>
                {data.items.map((s, i) => (
                  <View key={s.id}>
                    {i ? <View style={ui.separator} /> : null}
                    <ListItem title={s.donor_name} subtitle={s.campaign_title}
                      meta={`${s.mode === 'card' ? `Kart${s.card_last4 ? ` •••• ${s.card_last4}` : ''}` : 'Hatırlatma'}${s.next_billing_date ? ` · Sonraki ${date(s.next_billing_date)}` : ''}`}
                      right={<><Text style={ui.amount}>{money(s.amount_cents, s.currency)}</Text><Badge label={STATUS[s.status]?.label || s.status} tone={STATUS[s.status]?.tone} /></>}
                      onPress={() => open(s)} />
                  </View>
                ))}
              </View>
            ) : <Empty title="Düzenli ödeme talimatı yok" />}
          </>
        )}
      </QueryView>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title="Talimat">
        {selected ? (
          <>
            <Row label="Bağışçı" value={selected.donor_name} onPress={() => { setSelected(null); router.push({ pathname: '/bagisci/[id]', params: { id: selected.donor_id } }); }} />
            <Row label="Kampanya" value={selected.campaign_title} />
            <Row label="Tür" value={selected.mode === 'card' ? 'Kayıtlı karttan çekim' : 'SMS ile hatırlatma'} />
            <Row label="Son çekim" value={date(selected.last_charged_at)} />
            <Row label="Sonraki" value={date(selected.next_billing_date)} />
            {selected.last_error ? <Notice tone="danger" text={`${selected.failed_attempts} başarısız deneme: ${selected.last_error}`} /> : null}
            {selected.status !== 'cancelled' ? (
              <View style={{ gap: space.sm }}>
                {selected.mode !== 'card' ? (
                  <View style={[ui.rowGap, { alignItems: 'flex-end' }]}>
                    <View style={{ flex: 1 }}><Field label="Tutar" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /></View>
                    <Btn title="Güncelle" small variant="outline" loading={busy === 'amount'} onPress={() => run('amount', async () => {
                      const cents = toCents(amount);
                      if (!cents || cents < 100) throw new Error('Tutar en az 1 olmalı.');
                      await patch({ amount_cents: cents });
                      return 'Tutar güncellendi.';
                    })} />
                  </View>
                ) : <Text style={ui.muted}>Kartlı talimatın tutarını yalnızca bağışçı değiştirebilir.</Text>}
                {selected.status === 'active' || selected.status === 'past_due' ? (
                  <Btn title="Duraklat" variant="outline" loading={busy === 'pause'} onPress={() => run('pause', async () => { await patch({ status: 'paused' }); return 'Talimat duraklatıldı.'; })} />
                ) : null}
                {selected.status === 'paused' ? (
                  <Btn title="Devam ettir" loading={busy === 'resume'} onPress={() => run('resume', async () => { await patch({ status: 'active' }); return 'Talimat yeniden aktif.'; })} />
                ) : null}
                {selected.status === 'past_due' || selected.failed_attempts ? (
                  <Btn title={selected.mode === 'card' ? 'Çekimi yeniden dene' : 'Hatırlatmayı yeniden gönder'} variant="outline" loading={busy === 'retry'}
                    onPress={() => run('retry', async () => {
                      const r = await af<{ message?: string }>(`/subscriptions/${selected.id}/retry`, { method: 'POST' });
                      return r?.message || 'Yeniden denendi.';
                    })} />
                ) : null}
                <Btn title="Talimatı iptal et" variant="danger" loading={busy === 'cancel'} onPress={async () => {
                  if (!(await confirm('Talimat iptal edilsin mi?', 'İptal edilen talimat yeniden açılamaz.', 'İptal et', true))) return;
                  run('cancel', async () => { await patch({ status: 'cancelled' }); return 'Talimat iptal edildi.'; });
                }} />
              </View>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
