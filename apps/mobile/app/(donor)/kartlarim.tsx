import React from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Trash2 } from 'lucide-react-native';
import { df } from '@/lib/api';
import { date, money } from '@/lib/format';
import { Badge, Btn, Card, Empty, QueryView, Row, Screen, SectionTitle, useUi } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { space, useTheme } from '@/theme';

type SavedCardItem = {
  id: string;
  subscription_id: string;
  card_brand: string;
  card_last4: string;
  provider: string | null;
  campaign_title: string;
  amount_lira: number;
  currency: string;
  status: string;
  next_charge_date: string | null;
};

export default function DonorSavedCardsScreen() {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const ui = useUi();

  const cards = useQuery({
    queryKey: ['donor', 'cards'],
    queryFn: () => df<SavedCardItem[]>('/me/cards'),
  });

  const removeMutation = useMutation({
    mutationFn: (subscriptionId: string) => df(`/me/cards/${subscriptionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donor', 'cards'] });
      queryClient.invalidateQueries({ queryKey: ['donor', 'subscriptions'] });
      notify('Kayıtlı kart kaldırıldı.');
    },
    onError: notifyError,
  });

  return (
    <Screen onRefresh={() => cards.refetch()} refreshing={cards.isRefetching}>
      <SectionTitle>KAYITLI KARTLARIM</SectionTitle>
      <QueryView query={cards}>
        {(items) =>
          items.length === 0 ? (
            <Empty
              title="Kayıtlı kartınız bulunmuyor"
              text="Düzenli bağış talimatlarınıza tanımladığınız banka saklamalı kartlarınız burada görüntülenir."
            />
          ) : (
            <View style={{ gap: space.sm }}>
              {items.map((c) => (
                <Card key={c.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <CreditCard size={20} color={colors.primary} />
                      <Text style={ui.text}>{c.card_brand} ···· {c.card_last4}</Text>
                    </View>
                    <Badge label={c.status === 'active' ? 'Aktif' : 'Duraklatıldı'} tone={c.status === 'active' ? 'ok' : 'warn'} />
                  </View>
                  <Row label="Bağlı Talimat" value={c.campaign_title} />
                  <Row label="Aylık Tutar" value={money(Math.round((c.amount_lira || 0) * 100), c.currency)} />
                  {c.next_charge_date ? <Row label="Sonraki Çekim" value={date(c.next_charge_date)} /> : null}
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                    <Btn
                      title="Kartı Kaldır"
                      variant="danger"
                      small
                      icon={<Trash2 size={15} color={colors.danger} />}
                      loading={removeMutation.isPending}
                      onPress={() => removeMutation.mutate(c.subscription_id)}
                    />
                  </View>
                </Card>
              ))}
            </View>
          )
        }
      </QueryView>
    </Screen>
  );
}
