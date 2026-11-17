import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { allowed, can } from '@/lib/access';
import { dateTime, money } from '@/lib/format';
import { STATUS } from '@/api/types';
import { Badge, Btn, Card, Chips, ListItem, Notice, QueryView, Screen, SectionTitle, Stat, ui } from '@/components/ui';
import { colors, font, radius, space } from '@/theme';

type Stats = {
  sees_all: boolean;
  currency: string;
  kpis: {
    today_cents: number; yesterday_cents: number; month_cents: number; last_month_to_date_cents: number;
    donor_count: number; new_donors_this_month: number; active_campaigns: number;
  };
  monthly_donations: { month: string; total_cents: number; count: number }[];
  campaigns_progress: { id: string; title: string; currency: string; progress: number; collected_cents: number; target_cents: number | null }[];
  payment_methods: { method: string; count: number; total_cents: number }[];
  recent_donations: any[];
  pending_donations_count: number;
};

const PERIODS = [
  { value: 'today', label: 'Bugün' },
  { value: 'week', label: 'Bu hafta' },
  { value: 'month', label: 'Bu ay' },
  { value: 'year', label: 'Bu yıl' },
];

function change(now: number, before: number): string | undefined {
  if (!before) return now ? 'Önceki dönemde bağış yok' : undefined;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}% önceki döneme göre`;
}

export default function Dashboard() {
  const router = useRouter();
  const { access, me } = useAuth();
  const [period, setPeriod] = useState('month');
  const query = useQuery({
    queryKey: ['stats', period],
    queryFn: () => af<Stats>('/analytics/stats', { query: { months: 6, period, currency: 'TRY' } }),
  });
  const sms = useQuery({
    queryKey: ['sms-counts'],
    enabled: allowed(access, 'sms', 'sms'),
    queryFn: () => af<{ counts?: Record<string, number> }>('/sms/messages', { query: { page_size: 1 } }),
  });
  const failedSms = (sms.data?.counts?.failed || 0) + (sms.data?.counts?.queued || 0);

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Text style={ui.title}>Merhaba, {me?.first_name}</Text>
      <QueryView query={query}>
        {(data) => {
          const k = data.kpis;
          const peak = Math.max(1, ...data.monthly_donations.map((m) => m.total_cents));
          return (
            <>
              {!data.sees_all ? <Notice text="Yalnızca kendi kestiğiniz makbuzların özetini görüyorsunuz." /> : null}
              <View style={ui.wrapGap}>
                <Stat label="Bugün" value={money(k.today_cents, data.currency)} sub={change(k.today_cents, k.yesterday_cents)} />
                <Stat label="Bu ay" value={money(k.month_cents, data.currency)} sub={change(k.month_cents, k.last_month_to_date_cents)} />
                <Stat label="Bağışçı" value={String(k.donor_count)} sub={`Bu ay ${k.new_donors_this_month} yeni`} />
                <Stat label="Aktif kampanya" value={String(k.active_campaigns)} />
              </View>

              {(data.pending_donations_count > 0 || failedSms > 0) ? (
                <Card>
                  <Text style={styles.cardTitle}>Bekleyen işler</Text>
                  {data.pending_donations_count > 0 ? (
                    <ListItem title={`${data.pending_donations_count} bekleyen bağış`} subtitle="Ödemesi onaylanmamış makbuzlar" chevron
                      onPress={() => router.push({ pathname: '/bagislar', params: { gorunum: 'bekleyen' } })} />
                  ) : null}
                  {failedSms > 0 ? (
                    <ListItem title={`${failedSms} bekleyen / başarısız SMS`} chevron onPress={() => router.push('/sms/gonderimler')} />
                  ) : null}
                </Card>
              ) : null}

              {can(access, 'receipts.create') ? (
                <Btn title="Elle makbuz kes" onPress={() => router.push('/makbuz-kes')} />
              ) : null}

              <SectionTitle>Aylık bağış</SectionTitle>
              <Card>
                <View style={styles.bars}>
                  {data.monthly_donations.map((m) => (
                    <View key={m.month} style={styles.barCol}>
                      <Text style={styles.barValue} numberOfLines={1}>{m.total_cents ? money(m.total_cents, data.currency).replace(/\s?₺/, '') : ''}</Text>
                      <View style={[styles.bar, { height: Math.max(4, (m.total_cents / peak) * 90) }]} />
                      <Text style={styles.barLabel}>{m.month.slice(0, 3)}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              <SectionTitle>Ödeme kanalları</SectionTitle>
              <Chips options={PERIODS} value={period} onChange={setPeriod} />
              <Card>
                {data.payment_methods.length ? data.payment_methods.map((p) => (
                  <View key={p.method} style={styles.line}>
                    <Text style={ui.text}>{p.method} <Text style={ui.muted}>({p.count})</Text></Text>
                    <Text style={ui.amount}>{money(p.total_cents, data.currency)}</Text>
                  </View>
                )) : <Text style={ui.muted}>Bu dönemde bağış yok.</Text>}
              </Card>

              {data.campaigns_progress.length ? (
                <>
                  <SectionTitle>Kampanya ilerlemesi</SectionTitle>
                  <Card style={{ gap: space.md }}>
                    {data.campaigns_progress.slice(0, 6).map((c) => (
                      <View key={c.id} style={{ gap: 6 }}>
                        <View style={styles.line}>
                          <Text style={[ui.text, { flex: 1 }]} numberOfLines={1}>{c.title}</Text>
                          <Text style={ui.muted}>%{Math.round(c.progress || 0)}</Text>
                        </View>
                        <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, c.progress || 0)}%` }]} /></View>
                        <Text style={ui.muted}>{money(c.collected_cents, c.currency)}{c.target_cents ? ` / ${money(c.target_cents, c.currency)}` : ''}</Text>
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}

              <SectionTitle>Son bağışlar</SectionTitle>
              <View style={ui.listCard}>
                {data.recent_donations.length ? data.recent_donations.map((d, i) => (
                  <View key={d.id}>
                    {i ? <View style={ui.separator} /> : null}
                    <ListItem
                      title={d.donor_name || 'İsimsiz'}
                      subtitle={d.campaign_title}
                      meta={dateTime(d.paid_at)}
                      right={<><Text style={ui.amount}>{money(d.amount_cents, d.currency)}</Text><Badge label={STATUS[d.status]?.label || d.status} tone={STATUS[d.status]?.tone} /></>}
                      onPress={() => router.push({ pathname: '/bagis/[id]', params: { id: d.id, no: d.receipt_number } })}
                    />
                  </View>
                )) : <Text style={[ui.muted, { padding: space.lg }]}>Henüz bağış yok.</Text>}
              </View>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: font.md, fontWeight: '700', color: colors.text },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, height: 140 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '70%', backgroundColor: colors.primary, borderRadius: radius.sm },
  barValue: { fontSize: 10, color: colors.muted },
  barLabel: { fontSize: font.xs, color: colors.muted },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, paddingVertical: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#E6EBE9', overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.primary, borderRadius: 4 },
});
