import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { money, dateTime } from '@/lib/format';
import { remember } from '@/lib/selected';
import { CHANNEL_COLORS, changeText, Inflow, useInflow } from '@/api/inflow';
import { ChannelBar, Sparkline } from '@/components/InflowCard';
import { Badge, Btn, Card, Chips, ListItem, Notice, QueryView, Screen, SectionTitle, Stat, ui } from '@/components/ui';
import { colors, font, space } from '@/theme';

const PERIODS = [
  { value: 'today', label: 'Bugün' },
  { value: 'week', label: 'Bu hafta' },
  { value: 'month', label: 'Bu ay' },
];

export default function Inflows() {
  const router = useRouter();
  const [period, setPeriod] = useState<Inflow['period']>('today');
  const query = useInflow(period);

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Para girişleri' }} />
      <Chips options={PERIODS} value={period} onChange={(p) => setPeriod(p as Inflow['period'])} />
      <QueryView query={query}>
        {(d) => {
          const change = changeText(d.total_cents, d.previous_total_cents);
          const avg = d.count ? Math.round(d.total_cents / d.count) : 0;
          return (
            <>
              {!d.sees_all ? <Notice text="Yalnızca kendi kestiğiniz makbuzlar gösteriliyor." /> : null}
              <Card>
                <Text style={ui.muted}>Toplam giriş</Text>
                <Text style={{ fontSize: 34, fontWeight: '800', color: colors.text }}>{money(d.total_cents)}</Text>
                {change ? <Text style={{ color: d.total_cents >= d.previous_total_cents ? colors.primaryDark : colors.danger, fontWeight: '700' }}>{change}</Text> : null}
                <Sparkline series={d.series} unit={d.series_unit} />
                <Text style={[ui.muted, { fontSize: font.xs }]}>{d.series_unit === 'hour' ? 'Saat saat (00–23)' : 'Gün gün'} · 30 saniyede bir yenilenir · son: {dateTime(d.updated_at)}</Text>
              </Card>
              <View style={ui.wrapGap}>
                <Stat label="İşlem" value={String(d.count)} sub={`Önceki: ${d.previous_count}`} />
                <Stat label="Ortalama" value={money(avg)} />
              </View>
              {d.other_currencies.length ? (
                <Card>
                  <Text style={ui.muted}>Döviz girişleri</Text>
                  {d.other_currencies.map((c) => <Text key={c.currency} style={ui.text}>{money(c.total_cents, c.currency)} · {c.count} işlem</Text>)}
                </Card>
              ) : null}

              <SectionTitle>Kanallar</SectionTitle>
              <Card><ChannelBar data={d} /></Card>

              {d.waiting_transfers.count || d.failed_payments_today ? <SectionTitle>Dikkat</SectionTitle> : null}
              {d.waiting_transfers.count ? (
                <Card onPress={() => router.push('/havaleler')}>
                  <Text style={[ui.text, { fontWeight: '700', color: colors.warn }]}>{d.waiting_transfers.count} havale eşleşme bekliyor</Text>
                  <Text style={ui.muted}>Toplam {money(d.waiting_transfers.total_cents)} · dokunup bağışçıya bağlayın</Text>
                </Card>
              ) : null}
              {d.failed_payments_today ? (
                <Card>
                  <Text style={[ui.text, { fontWeight: '700', color: colors.danger }]}>Bugün {d.failed_payments_today} online ödeme başarısız / incelemede</Text>
                  <Text style={ui.muted}>Ayrıntılar bildirim kutusunda.</Text>
                  <Btn title="Bildirimleri aç" variant="ghost" small onPress={() => router.push('/bildirimler')} />
                </Card>
              ) : null}

              <SectionTitle>Son girişler</SectionTitle>
              <View style={ui.listCard}>
                {d.recent.length ? d.recent.map((r, i) => (
                  <View key={r.id}>
                    {i ? <View style={ui.separator} /> : null}
                    <ListItem
                      left={<View style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, backgroundColor: CHANNEL_COLORS[r.channel] || colors.faint }} />}
                      title={r.donor_name ? `${r.donor_name}${r.is_anonymous ? ' (gizli)' : ''}` : 'İsimsiz'}
                      subtitle={r.campaign_title}
                      meta={`${dateTime(r.paid_at)} · ${r.channel_label}`}
                      right={<Text style={ui.amount}>{money(r.amount_cents, r.currency)}</Text>}
                      onPress={() => {
                        remember('donation', r.id, undefined);
                        router.push({ pathname: '/bagis/[id]', params: { id: r.id, no: r.receipt_number } });
                      }}
                    />
                  </View>
                )) : <Text style={[ui.muted, { padding: space.lg }]}>Henüz giriş yok.</Text>}
              </View>
              <Badge label="Aktarım (Excel / STK PRO) kayıtları bu sayılara dahil değildir" tone="muted" />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
