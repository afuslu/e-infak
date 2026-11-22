import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { hasFeature } from '@/lib/access';
import { money } from '@/lib/format';
import { Card, Chips, Notice, QueryView, Row, Screen, SectionTitle, Stat, useUi } from '@/components/ui';
import { font, radius, space, useTheme } from '@/theme';

type Monthly = {
  year: number; currency: string; total_cents: number; previous_year_total_cents: number; change_pct: number | null; count: number;
  months: { month: number; label: string; total_cents: number; count: number; donor_count: number }[];
  payment_methods: { method: string; label: string; count: number; total_cents: number }[];
  status_summary: Record<string, number>;
};
type CampaignReport = { campaigns: { id: string; title: string; total_cents: number; count: number; donor_count: number; share_pct: number }[]; categories: { category: string; label: string; total_cents: number; share_pct: number }[] };
type StaffReport = { staff: { user_id: string; name: string; count: number; total_cents: number }[] };

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2].map((y) => ({ value: String(y), label: String(y) }));

export default function Reports() {
  const { access } = useAuth();
  const { colors, dark } = useTheme();
  const ui = useUi();
  const advanced = hasFeature(access, 'reports_advanced');
  const [year, setYear] = useState(String(THIS_YEAR));
  const [tab, setTab] = useState('monthly');
  const range = { start: `${year}-01-01`, end: `${year}-12-31` };
  const monthly = useQuery({ queryKey: ['report-monthly', year], queryFn: () => af<Monthly>('/reports/monthly', { query: { year } }) });
  const campaigns = useQuery({ queryKey: ['report-campaigns', year], enabled: advanced && tab === 'campaigns', queryFn: () => af<CampaignReport>('/reports/campaigns', { query: range }) });
  const staff = useQuery({ queryKey: ['report-staff', year], enabled: advanced && tab === 'staff', queryFn: () => af<StaffReport>('/reports/staff-receipts', { query: range }) });

  const tabs = [{ value: 'monthly', label: 'Aylık' }, ...(advanced ? [{ value: 'campaigns', label: 'Kampanyalar' }, { value: 'staff', label: 'Personel' }] : [])];

  return (
    <Screen onRefresh={() => monthly.refetch()} refreshing={monthly.isRefetching}>
      <Stack.Screen options={{ title: 'Raporlar' }} />
      <Chips options={YEARS} value={year} onChange={setYear} />
      <Chips options={tabs} value={tab} onChange={setTab} />
      {!advanced ? <Notice text="Kampanya ve personel raporları Gelişmiş Raporlar paketinde yer alır." /> : null}

      {tab === 'monthly' ? (
        <QueryView query={monthly}>
          {(m) => {
            const peak = Math.max(1, ...m.months.map((x) => x.total_cents));
            return (
              <>
                <View style={ui.wrapGap}>
                  <Stat label={`${m.year} toplam`} value={money(m.total_cents, m.currency)}
                    sub={m.change_pct != null ? `${m.change_pct >= 0 ? '+' : ''}${Math.round(m.change_pct)}% geçen yıla göre` : undefined} />
                  <Stat label="Bağış sayısı" value={String(m.count)} sub={`Tahsil oranı %${m.status_summary.collection_rate_pct ?? '—'}`} />
                </View>
                <SectionTitle>Aylara göre</SectionTitle>
                <Card style={{ gap: 8 }}>
                  {m.months.map((x) => (
                    <View key={x.month} style={{ gap: 4 }}>
                      <View style={[ui.rowGap, { justifyContent: 'space-between' }]}>
                        <Text style={ui.text}>{x.label}</Text>
                        <Text style={ui.amount}>{money(x.total_cents, m.currency)} <Text style={ui.muted}>({x.count})</Text></Text>
                      </View>
                      <View style={{ height: 6, borderRadius: radius.sm, backgroundColor: dark ? '#334155' : '#E6EBE9' }}>
                        <View style={{ height: 6, borderRadius: radius.sm, backgroundColor: colors.primary, width: `${(x.total_cents / peak) * 100}%` }} />
                      </View>
                    </View>
                  ))}
                </Card>
                <SectionTitle>Ödeme yöntemleri</SectionTitle>
                <Card>
                  {m.payment_methods.length ? m.payment_methods.map((p) => <Row key={p.method} label={`${p.label} (${p.count})`} value={money(p.total_cents, m.currency)} />)
                    : <Text style={ui.muted}>Bağış yok.</Text>}
                </Card>
                <SectionTitle>Durumlar</SectionTitle>
                <Card>
                  <Row label={`Onaylı (${m.status_summary.confirmed_count || 0})`} value={money(m.status_summary.confirmed_cents, m.currency)} />
                  <Row label={`Bekleyen (${m.status_summary.pending_count || 0})`} value={money(m.status_summary.pending_cents, m.currency)} />
                  <Row label={`İade (${m.status_summary.refunded_count || 0})`} value={money(m.status_summary.refunded_cents, m.currency)} />
                  <Row label={`İptal (${m.status_summary.cancelled_count || 0})`} value={money(m.status_summary.cancelled_cents, m.currency)} />
                </Card>
              </>
            );
          }}
        </QueryView>
      ) : null}

      {tab === 'campaigns' ? (
        <QueryView query={campaigns}>
          {(r) => (
            <>
              <SectionTitle>Kategoriler</SectionTitle>
              <Card>{r.categories.length ? r.categories.map((c) => <Row key={c.category} label={`${c.label} · %${Math.round(c.share_pct)}`} value={money(c.total_cents)} />) : <Text style={ui.muted}>Veri yok.</Text>}</Card>
              <SectionTitle>Kampanyalar</SectionTitle>
              {r.campaigns.map((c) => (
                <Card key={c.id}>
                  <Text style={[ui.text, { fontWeight: '600' }]}>{c.title}</Text>
                  <Row label={`${c.count} bağış · ${c.donor_count} bağışçı`} value={money(c.total_cents)} />
                </Card>
              ))}
            </>
          )}
        </QueryView>
      ) : null}

      {tab === 'staff' ? (
        <QueryView query={staff}>
          {(r) => (
            <Card>
              {r.staff.length ? r.staff.map((s) => <Row key={s.user_id} label={`${s.name} (${s.count})`} value={money(s.total_cents)} />)
                : <Text style={ui.muted}>Bu yıl personelin kestiği makbuz yok.</Text>}
              <Text style={[ui.muted, { fontSize: font.xs, marginTop: space.sm }]}>Personelin elle kestiği makbuzlar.</Text>
            </Card>
          )}
        </QueryView>
      ) : null}
    </Screen>
  );
}
