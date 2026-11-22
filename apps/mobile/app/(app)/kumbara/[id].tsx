import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { af } from '@/lib/api';
import { call, date, dateTime, daysAgo, idempotencyKey, isDialable, money, toCents, todayIso } from '@/lib/format';
import { recall } from '@/lib/selected';
import { useCampaignOptions } from '@/api/hooks';
import { MoneyBox } from '@/api/types';
import { Badge, Btn, Card, Field, ListItem, Notice, QueryView, Row, Screen, SectionTitle, Select, useUi } from '@/components/ui';
import { DateField } from '@/components/fields';
import { notify } from '@/components/toast';
import { space } from '@/theme';

type Collection = { id: string; collected_at: string; amount_cents: number; currency: string; collected_by: string; receipt_number: string | null; cancelled: boolean; notes: string | null };

export default function MoneyBoxDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const ui = useUi();
  const campaigns = useCampaignOptions();
  const box = useQuery({
    queryKey: ['money-box', id],
    initialData: recall<MoneyBox>('box', id),
    queryFn: async () => {
      const all = await af<MoneyBox[]>('/money-boxes');
      const found = all.find((b) => b.id === id);
      if (!found) throw new Error('Kumbara bulunamadı.');
      return found;
    },
  });
  const collections = useQuery({ queryKey: ['money-box-collections', id], queryFn: () => af<Collection[]>(`/money-boxes/${id}/collections`) });

  const key = useRef(idempotencyKey('kumbara'));
  const [amount, setAmount] = useState('');
  const [collectedOn, setCollectedOn] = useState<string | null>(todayIso());
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collect = async () => {
    setError(null);
    const cents = toCents(amount);
    if (!cents) return setError('Toplanan tutarı yazın.');
    if (!collectedOn) return setError('Geçerli bir tarih girin.');
    if (!campaignId && !box.data?.campaign_id) return setError('Tutarın aktarılacağı bağış kalemini seçin.');
    setBusy(true);
    try {
      const result = await af<{ receipt_number: string }>(`/money-boxes/${id}/collections`, {
        method: 'POST',
        body: {
          idempotency_key: key.current, amount_cents: cents, currency: 'TRY',
          collected_on: collectedOn === todayIso() ? undefined : collectedOn,
          campaign_id: campaignId || undefined, notes: notes.trim() || undefined,
        },
      });
      key.current = idempotencyKey('kumbara');
      setAmount('');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['money-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['donations'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      await Promise.all([collections.refetch(), box.refetch()]);
      notify(`Tahsilat kaydedildi: ${result.receipt_number}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Kumbara' }} />
      <QueryView query={box}>
        {(b) => (
          <>
            <Card>
              <Text style={ui.title}>{b.code}</Text>
              <Text style={ui.text}>{b.location_name}</Text>
              <Row label="Adres" value={[b.address, b.district, b.city].filter(Boolean).join(', ') || '—'} />
              {b.contact_name ? <Row label="Yetkili" value={b.contact_name} /> : null}
              {b.contact_phone ? <Row label="Telefon" value={b.contact_phone} onPress={isDialable(b.contact_phone) ? () => call(b.contact_phone!) : undefined} /> : null}
              <Row label="Son boşaltma" value={b.last_collected_at ? `${date(b.last_collected_at)} (${daysAgo(b.days_since_collection)})` : 'Hiç'} />
              <Row label="Toplam" value={`${money(b.total_collected_cents)} · ${b.collection_count} tahsilat`} />
            </Card>

            <SectionTitle>Tahsilat kaydet</SectionTitle>
            <Card style={{ gap: space.md }}>
              {error ? <Notice text={error} tone="danger" /> : null}
              <Field label="Toplanan tutar (TL)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
              <DateField label="Tarih" value={collectedOn} onChange={setCollectedOn} />
              <Select label="Bağış kalemi" value={campaignId} options={campaigns} onChange={setCampaignId} searchable allowClear
                placeholder={b.campaign_id ? 'Kumbaranın varsayılanı' : 'Seçin (zorunlu)'} />
              <Field label="Not" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
              <Btn title="Tahsilatı kaydet" onPress={collect} loading={busy} />
              <Text style={ui.muted}>Tahsilat, kumbara bağışçısı adına bir makbuz oluşturur.</Text>
            </Card>

            <SectionTitle>Geçmiş tahsilatlar</SectionTitle>
            <QueryView query={collections}>
              {(list) => list.length ? (
                <View style={ui.listCard}>
                  {list.map((c, i) => (
                    <View key={c.id}>
                      {i ? <View style={ui.separator} /> : null}
                      <ListItem title={money(c.amount_cents, c.currency)} subtitle={`${dateTime(c.collected_at)} · ${c.collected_by || '—'}`}
                        meta={c.receipt_number} right={c.cancelled ? <Badge label="İptal" /> : undefined} />
                    </View>
                  ))}
                </View>
              ) : <Text style={ui.muted}>Henüz tahsilat yok.</Text>}
            </QueryView>
            <Btn title="Başka kumbara okut" variant="ghost" onPress={() => router.replace('/kumbara/tara')} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
