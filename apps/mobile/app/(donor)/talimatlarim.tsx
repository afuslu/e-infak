import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { df } from '@/lib/api';
import { date, money, toCents } from '@/lib/format';
import { Badge, Btn, Card, Chips, Empty, Field, QueryView, Row, Screen, SectionTitle, Sheet, useUi } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { space, useTheme } from '@/theme';

type DonorSubscription = {
  id: string;
  campaign_id: string | null;
  campaign_title: string;
  amount_cents: number;
  currency: string;
  frequency: 'monthly' | 'weekly' | string;
  day_of_month: number | null;
  mode: 'card' | 'reminder' | string;
  card_brand: string | null;
  card_last4: string | null;
  status: 'active' | 'paused' | 'cancelled' | string;
  next_charge_date: string | null;
  created_at: string;
};

export default function DonorSubscriptionsScreen() {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const ui = useUi();

  const [createOpen, setCreateOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('500');
  const [frequency, setFrequency] = useState<'monthly' | 'weekly'>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('15');

  const subs = useQuery({
    queryKey: ['donor', 'subscriptions'],
    queryFn: () => df<DonorSubscription[]>('/me/subscriptions'),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume' | 'cancel' }) =>
      df(`/subscriptions/${id}/action`, { method: 'POST', body: { action } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donor', 'subscriptions'] });
      notify('Talimat güncellendi.');
    },
    onError: notifyError,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const amount_cents = toCents(amountInput);
      if (!amount_cents || amount_cents < 100) throw new Error('Lütfen en az 1 TL tutar girin.');
      const day = Math.max(1, Math.min(28, parseInt(dayOfMonth, 10) || 15));
      return df('/subscriptions', {
        method: 'POST',
        body: { amount_cents, currency: 'TRY', frequency, day_of_month: day },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donor', 'subscriptions'] });
      setCreateOpen(false);
      notify('Düzenli bağış talimatınız oluşturuldu.');
    },
    onError: notifyError,
  });

  return (
    <Screen onRefresh={() => subs.refetch()} refreshing={subs.isRefetching}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionTitle>DÜZENLİ BAĞIŞ TALİMATLARIM</SectionTitle>
        <Btn
          title="Yeni Talimat"
          small
          icon={<Plus size={16} color={colors.white} />}
          onPress={() => setCreateOpen(true)}
        />
      </View>

      <QueryView query={subs}>
        {(items) =>
          items.length === 0 ? (
            <Empty
              title="Düzenli bağış talimatınız bulunmuyor"
              text="Her ay belirlediğiniz günde otomatik çekim veya SMS hatırlatmalı bağış talimatı oluşturabilirsiniz."
            />
          ) : (
            <View style={{ gap: space.sm }}>
              {items.map((s) => {
                const st = s.status?.toLowerCase();
                const tone = st === 'active' ? 'ok' : st === 'paused' ? 'warn' : 'muted';
                const label = st === 'active' ? 'Aktif' : st === 'paused' ? 'Duraklatıldı' : 'İptal Edildi';
                return (
                  <Card key={s.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={ui.text}>{s.campaign_title || 'Genel Bağış'}</Text>
                      <Badge label={label} tone={tone} />
                    </View>
                    <Row label="Tutar" value={`${money(s.amount_cents, s.currency)} / ${s.frequency === 'weekly' ? 'Haftalık' : 'Aylık'}`} />
                    <Row label="Yöntem" value={s.card_last4 ? `${s.card_brand || 'Kart'} **** ${s.card_last4}` : 'SMS Hatırlatma'} />
                    {s.next_charge_date && st === 'active' ? (
                      <Row label="Sonraki Tarih" value={date(s.next_charge_date)} />
                    ) : null}
                    {st !== 'cancelled' ? (
                      <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end', marginTop: 4 }}>
                        {st === 'active' ? (
                          <Btn
                            title="Duraklat"
                            variant="outline"
                            small
                            loading={actionMutation.isPending}
                            onPress={() => actionMutation.mutate({ id: s.id, action: 'pause' })}
                          />
                        ) : (
                          <Btn
                            title="Devam Ettir"
                            variant="outline"
                            small
                            loading={actionMutation.isPending}
                            onPress={() => actionMutation.mutate({ id: s.id, action: 'resume' })}
                          />
                        )}
                        <Btn
                          title="İptal Et"
                          variant="danger"
                          small
                          loading={actionMutation.isPending}
                          onPress={() => actionMutation.mutate({ id: s.id, action: 'cancel' })}
                        />
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )
        }
      </QueryView>

      <Sheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Düzenli Bağış Talimatı"
        footer={<Btn title="Talimatı Kaydet" loading={createMutation.isPending} onPress={() => createMutation.mutate()} />}
      >
        <Field
          label="Bağış Tutarı (TL)"
          value={amountInput}
          onChangeText={setAmountInput}
          keyboardType="decimal-pad"
          placeholder="500"
        />
        <Text style={ui.muted}>Sıklık</Text>
        <Chips<'monthly' | 'weekly'>
          options={[
            { value: 'monthly', label: 'Aylık' },
            { value: 'weekly', label: 'Haftalık' },
          ]}
          value={frequency}
          onChange={setFrequency}
        />
        {frequency === 'monthly' ? (
          <Field
            label="Ayın Hangi Günü (1-28)"
            value={dayOfMonth}
            onChangeText={setDayOfMonth}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="15"
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
