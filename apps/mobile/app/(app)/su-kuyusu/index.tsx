import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Droplets, MapPin } from 'lucide-react-native';
import { af } from '@/lib/api';
import { date, money, openUrl } from '@/lib/format';
import { Badge, Btn, Card, Chips, Empty, ListItem, Loading, QueryView, Row, Screen, SearchBar, SectionTitle, Sheet, useUi } from '@/components/ui';
import { radius, useTheme } from '@/theme';

type Well = {
  id: string;
  name: string;
  country?: string | null;
  location_name?: string | null;
  region?: string | null;
  status?: string;
  donor_name?: string | null;
  description?: string | null;
  funding_model?: string | null;
  target_cents?: number | null;
  collected_cents?: number | null;
  progress_pct?: number | null;
  share_count?: number | null;
  shares_sold?: number | null;
  shares_left?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
};

type WellShare = {
  id: string;
  share_count: number;
  donor_name: string;
  on_behalf_of?: string | null;
  receipt_number?: string | null;
  created_at?: string | null;
};

const WELL_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'info' | 'muted' }> = {
  planned: { label: 'Planlandı', tone: 'muted' },
  funding: { label: 'Fonlama', tone: 'warn' },
  drilling: { label: 'Sondaj / Yapımda', tone: 'info' },
  completed: { label: 'Açıldı', tone: 'ok' },
};

export default function WaterWellsScreen() {
  const { colors, dark } = useTheme();
  const ui = useUi();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [selected, setSelected] = useState<Well | null>(null);

  const query = useQuery({
    queryKey: ['water-wells'],
    queryFn: () =>
      af<{ items?: Well[] } | Well[]>('/water-wells', {
        query: { page_size: 100 },
      }),
  });

  const sharesQuery = useQuery({
    queryKey: ['water-well-shares', selected?.id],
    enabled: !!selected,
    queryFn: () => af<WellShare[]>(`/water-wells/${selected!.id}/shares`),
  });

  const term = q.trim().toLocaleLowerCase('tr-TR');
  const list: Well[] = (Array.isArray(query.data) ? query.data : query.data?.items || []).filter((w) => {
    if (filter === 'completed' && w.status !== 'completed') return false;
    if (filter === 'active' && w.status === 'completed') return false;
    if (term) {
      const hay = `${w.name} ${w.country || ''} ${w.location_name || ''} ${w.region || ''} ${w.donor_name || ''}`.toLocaleLowerCase('tr-TR');
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Su Kuyuları' }} />
      <SearchBar value={q} onChangeText={setQ} placeholder="Kuyu adı, ülke veya konum ara…" />
      <Chips
        options={[
          { value: 'all', label: 'Tümü' },
          { value: 'active', label: 'Devam Eden' },
          { value: 'completed', label: 'Açılanlar' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <SectionTitle>Su Kuyuları ({list.length})</SectionTitle>
      <QueryView query={query}>
        {() =>
          list.length === 0 ? (
            <Empty title="Su kuyusu bulunamadı" text="Seçili filtreye uygun kuyu kaydı yok." />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {list.map((w, idx) => {
                const st = WELL_STATUS[w.status || ''] || { label: w.status || '—', tone: 'muted' as const };
                return (
                  <View key={w.id}>
                    {idx ? <View style={ui.separator} /> : null}
                    <ListItem
                      title={w.name}
                      subtitle={[w.country, w.location_name || w.region, w.donor_name].filter(Boolean).join(' · ')}
                      meta={w.progress_pct != null ? `%${Math.round(w.progress_pct)} tamamlandı` : undefined}
                      left={<Droplets size={18} color={colors.info} />}
                      right={<Badge label={st.label} tone={st.tone} />}
                      chevron
                      onPress={() => setSelected(w)}
                    />
                  </View>
                );
              })}
            </Card>
          )
        }
      </QueryView>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name || 'Su Kuyusu'}>
        {selected ? (
          <>
            <Row
              label="Durum"
              value={
                <Badge
                  label={WELL_STATUS[selected.status || '']?.label || selected.status || '—'}
                  tone={WELL_STATUS[selected.status || '']?.tone || 'muted'}
                />
              }
            />
            {selected.country ? <Row label="Ülke" value={selected.country} /> : null}
            {selected.location_name || selected.region ? <Row label="Konum" value={selected.location_name || selected.region || '—'} /> : null}
            {selected.target_cents ? (
              <View style={{ gap: 6 }}>
                <Row label="Toplanan / Hedef" value={`${money(selected.collected_cents || 0)} / ${money(selected.target_cents)}`} />
                <View style={{ height: 7, borderRadius: radius.sm, backgroundColor: dark ? '#334155' : '#E6EBE9', overflow: 'hidden' }}>
                  <View style={{ height: 7, backgroundColor: colors.primary, width: `${Math.min(100, selected.progress_pct || 0)}%` }} />
                </View>
              </View>
            ) : null}
            {selected.share_count ? (
              <Row label="Hisseler" value={`${selected.shares_sold ?? 0}/${selected.share_count} satıldı (${selected.shares_left ?? 0} kalan)`} />
            ) : null}
            {selected.description ? <Text style={ui.text}>{selected.description}</Text> : null}
            {selected.latitude != null && selected.longitude != null ? (
              <Btn
                title="Haritada aç"
                small
                variant="outline"
                icon={<MapPin size={15} color={colors.primaryDark} />}
                onPress={() => openUrl(`https://maps.google.com/?q=${selected.latitude},${selected.longitude}`)}
              />
            ) : null}

            <SectionTitle>Hissedarlar</SectionTitle>
            {sharesQuery.isLoading ? (
              <Loading label="Hissedarlar yükleniyor…" />
            ) : (sharesQuery.data || []).length > 0 ? (
              <View style={ui.listCard}>
                {(sharesQuery.data || []).map((s, idx) => (
                  <View key={s.id}>
                    {idx ? <View style={ui.separator} /> : null}
                    <ListItem
                      title={s.on_behalf_of || s.donor_name || 'Bağışçı'}
                      subtitle={s.on_behalf_of && s.donor_name ? `Bağışçı: ${s.donor_name}` : undefined}
                      meta={[s.receipt_number, s.created_at ? date(s.created_at) : null].filter(Boolean).join(' · ') || undefined}
                      right={<Badge label={`${s.share_count} hisse`} tone="info" />}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={ui.muted}>Henüz hisse kaydı yok.</Text>
            )}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
