import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { pf } from '@/lib/api';
import { money } from '@/lib/format';
import { Badge, Btn, Card, ListItem, QueryView, Screen, SectionTitle, Stat, useUi } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { font, radius, space, useTheme } from '@/theme';

type Metrics = {
  total_orgs?: number;
  mrr_cents: number;
  saas_collected_month_cents?: number;
  donations_30d_count?: number;
  donations_30d_cents?: number;
  failed_donations_30d?: number;
  paid_30d_count?: number;
  paid_30d_cents?: number;
  failed_30d_count?: number;
  status_counts: { active: number; trial: number; past_due: number; suspended: number };
  trends: { month: string; count: number; total_cents: number }[];
};

type AlertItem = {
  id?: string;
  key?: string;
  kind?: string;
  level: 'danger' | 'warning' | 'warn' | 'info' | string;
  title?: string;
  organization_name?: string;
  message: string;
  hint?: string | null;
  organization_id?: string | null;
};

export default function PlatformDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { platformMe } = useAuth();
  const { colors } = useTheme();
  const ui = useUi();

  const dismissAlert = useMutation({
    mutationFn: (a: AlertItem) =>
      pf('/alerts/dismiss', { method: 'POST', body: { organization_id: a.organization_id || null, kind: a.kind || a.key || 'general' } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'alerts'] });
      notify('Uyarı gizlendi.');
    },
    onError: notifyError,
  });

  const restoreAlerts = useMutation({
    mutationFn: () => pf('/alerts/dismiss', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'alerts'] });
      notify('Gizlenen uyarılar geri yüklendi.');
    },
    onError: notifyError,
  });

  const metrics = useQuery({
    queryKey: ['platform', 'metrics'],
    queryFn: () => pf<Metrics>('/metrics'),
  });

  const alerts = useQuery({
    queryKey: ['platform', 'alerts'],
    queryFn: () => pf<{ items: AlertItem[] } | AlertItem[]>('/alerts'),
  });

  const alertList = Array.isArray(alerts.data) ? alerts.data : alerts.data?.items || [];

  return (
    <Screen
      onRefresh={() => { metrics.refetch(); alerts.refetch(); }}
      refreshing={metrics.isRefetching || alerts.isRefetching}
    >
      <Text style={ui.title}>Merhaba, {platformMe?.full_name?.split(' ')[0] || 'Operatör'}</Text>

      <View style={{ flexDirection: 'row', gap: space.xs }}>
        <Btn title="Yeni Kurum" style={{ flex: 1 }} onPress={() => router.push('/kurum/yeni' as Href)} />
        <Btn title="Kurumlar" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/(platform)/(tabs)/kurumlar' as Href)} />
        <Btn title="Talepler" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/(platform)/(tabs)/talepler' as Href)} />
      </View>

      <QueryView query={metrics}>
        {(m) => {
          const peak = Math.max(1, ...(m.trends || []).map((t) => t.total_cents));
          const totalOrgs =
            (m.status_counts?.active || 0) +
            (m.status_counts?.trial || 0) +
            (m.status_counts?.past_due || 0) +
            (m.status_counts?.suspended || 0);
          return (
            <>
              <View style={ui.rowGap}>
                <Stat label="Toplam Kurum" value={String(totalOrgs)} sub={`${m.status_counts?.active || 0} aktif · ${m.status_counts?.trial || 0} deneme`} onPress={() => router.push('/(platform)/(tabs)/kurumlar' as Href)} />
                <Stat label="Aylık MRR" value={money(m.mrr_cents || 0, 'TRY')} sub={m.saas_collected_month_cents ? `Bu ay tahsilat: ${money(m.saas_collected_month_cents, 'TRY')}` : undefined} onPress={() => router.push('/(platform)/(tabs)/kurumlar' as Href)} />
              </View>
              <View style={ui.rowGap}>
                <Stat
                  onPress={() => router.push('/(platform)/(tabs)/kurumlar' as Href)}
                  label="Son 30 Gün Bağış"
                  value={money(m.donations_30d_cents ?? m.paid_30d_cents ?? 0, 'TRY')}
                  sub={`${(m.donations_30d_count ?? m.paid_30d_count ?? 0).toLocaleString('tr-TR')} işlem`}
                />
                <Stat
                  onPress={() => router.push('/(platform)/(tabs)/kurumlar' as Href)}
                  label="Başarısız (30g)"
                  value={String(m.failed_donations_30d ?? m.failed_30d_count ?? 0)}
                  sub={`${m.status_counts?.past_due || 0} gecikmiş · ${m.status_counts?.suspended || 0} askıda`}
                />
              </View>

              {m.trends?.length ? (
                <>
                  <SectionTitle>6 Aylık Platform Bağış Hacmi (TRY)</SectionTitle>
                  <Card style={{ gap: space.sm }}>
                    {m.trends.map((t) => (
                      <View key={t.month} style={{ gap: 4 }}>
                        <View style={styles.trendRow}>
                          <Text style={{ fontSize: font.sm, fontWeight: '600', color: colors.text }}>{t.month}</Text>
                          <Text style={{ fontSize: font.sm, fontWeight: '700', color: colors.text }}>
                            {money(t.total_cents, 'TRY')} ({t.count})
                          </Text>
                        </View>
                        <View style={[styles.barTrack, { backgroundColor: colors.primarySoft }]}>
                          <View style={[styles.barFill, { width: `${Math.max(4, Math.round((t.total_cents / peak) * 100))}%`, backgroundColor: colors.primary }]} />
                        </View>
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}
            </>
          );
        }}
      </QueryView>

      {alertList.length > 0 ? (
        <>
          <SectionTitle
            right={<Btn title="Gizlenenleri Aç" variant="ghost" small onPress={() => restoreAlerts.mutate()} />}
          >
            Platform Uyarıları ({alertList.length})
          </SectionTitle>
          <View style={ui.listCard}>
            {alertList.slice(0, 8).map((a, idx) => {
              const isWarn = a.level === 'warning' || a.level === 'warn';
              const badgeLabel = a.level === 'danger' ? 'Kritik' : isWarn ? 'Uyarı' : 'Bilgi';
              const badgeTone = a.level === 'danger' ? 'danger' : isWarn ? 'warn' : 'info';
              return (
                <View key={a.id || `${a.organization_id || 'p'}-${a.kind || a.key || idx}`}>
                  {idx > 0 ? <View style={ui.separator} /> : null}
                  <ListItem
                    title={a.title || a.organization_name || 'Platform'}
                    subtitle={a.message}
                    meta={a.hint || undefined}
                    right={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Badge label={badgeLabel} tone={badgeTone} />
                        <Btn title="Gizle" variant="ghost" small onPress={() => dismissAlert.mutate(a)} />
                      </View>
                    }
                    chevron={!!a.organization_id}
                    onPress={a.organization_id ? () => router.push(`/kurum/${a.organization_id}` as Href) : undefined}
                  />
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: radius.pill },
});
