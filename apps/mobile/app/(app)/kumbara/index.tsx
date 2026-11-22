import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { QrCode } from 'lucide-react-native';
import { af } from '@/lib/api';
import { date, daysAgo, money } from '@/lib/format';
import { useDebounced } from '@/lib/paged';
import { remember } from '@/lib/selected';
import { MoneyBox } from '@/api/types';
import { Badge, Btn, Chips, Empty, ListItem, QueryView, Screen, SearchBar, useUi } from '@/components/ui';
import { useTheme } from '@/theme';

const FILTERS = [
  { value: 'all', label: 'Tümü' },
  { value: 'me', label: 'Sorumlu olduklarım' },
  { value: 'late', label: '60+ gün boşaltılmayan' },
];

export default function MoneyBoxes() {
  const router = useRouter();
  const { colors } = useTheme();
  const ui = useUi();
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const q = useDebounced(term);
  const query = useQuery({
    queryKey: ['money-boxes', q, filter],
    queryFn: () => af<MoneyBox[]>('/money-boxes', {
      query: { q: q.trim() || undefined, status: 'active', responsible: filter === 'me' ? 'me' : undefined, not_collected_days: filter === 'late' ? 60 : undefined },
    }),
  });

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Kumbaralar' }} />
      {Platform.OS !== 'web' ? (
        <Btn title="QR kod okut" icon={<QrCode size={20} color={colors.white} />} onPress={() => router.push('/kumbara/tara')} />
      ) : null}
      <SearchBar value={term} onChangeText={setTerm} placeholder="Kod, yer adı, şehir" />
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      <QueryView query={query}>
        {(boxes) => boxes.length ? (
          <View style={ui.listCard}>
            <Text style={[ui.muted, { padding: 12 }]}>{boxes.length} etkin kumbara</Text>
            {boxes.map((b) => (
              <View key={b.id}>
                <View style={ui.separator} />
                <ListItem
                  title={`${b.code} · ${b.location_name}`}
                  subtitle={[b.district, b.city, b.region_name].filter(Boolean).join(' / ') || b.address}
                  meta={b.last_collected_at ? `Son boşaltma ${date(b.last_collected_at)} (${daysAgo(b.days_since_collection)})` : 'Hiç boşaltılmadı'}
                  right={<><Text style={ui.amount}>{money(b.total_collected_cents)}</Text>{(b.days_since_collection ?? 999) > 60 ? <Badge label="Gecikmiş" tone="warn" /> : null}</>}
                  onPress={() => {
                    remember('box', b.id, b);
                    router.push({ pathname: '/kumbara/[id]', params: { id: b.id } });
                  }}
                />
              </View>
            ))}
          </View>
        ) : <Empty title="Kumbara bulunamadı" text="Kumbaralar web panelinden tanımlanır." />}
      </QueryView>
    </Screen>
  );
}
