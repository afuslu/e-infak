import React, { useState } from 'react';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Droplets } from 'lucide-react-native';
import { af } from '@/lib/api';
import { Badge, Card, Chips, Empty, ListItem, QueryView, Screen, SearchBar, SectionTitle } from '@/components/ui';
import { useTheme } from '@/theme';

type Well = {
  id: string;
  name: string;
  country?: string;
  location_name?: string;
  region?: string;
  status?: string;
  donor_name?: string;
};

const WELL_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'info' | 'muted' }> = {
  planned: { label: 'Planlandı', tone: 'muted' },
  funding: { label: 'Fonlama', tone: 'warn' },
  drilling: { label: 'Sondaj / Yapımda', tone: 'info' },
  completed: { label: 'Açıldı', tone: 'ok' },
};

export default function WaterWellsScreen() {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const query = useQuery({
    queryKey: ['water-wells'],
    queryFn: () =>
      af<{ items?: Well[] } | Well[]>('/water-wells', {
        query: { page_size: 100 },
      }),
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
              {list.map((w) => {
                const st = WELL_STATUS[w.status || ''] || { label: w.status || '—', tone: 'muted' as const };
                return (
                  <ListItem
                    key={w.id}
                    title={w.name}
                    subtitle={[w.country, w.location_name || w.region, w.donor_name].filter(Boolean).join(' · ')}
                    left={<Droplets size={18} color={colors.info} />}
                    right={<Badge label={st.label} tone={st.tone} />}
                  />
                );
              })}
            </Card>
          )
        }
      </QueryView>
    </Screen>
  );
}
