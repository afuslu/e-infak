import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { money } from '@/lib/format';
import { useDebounced, usePaged } from '@/lib/paged';
import { Campaign, CAMPAIGN_STATUS } from '@/api/types';
import { Badge, Chips, Empty, ErrorView, Fab, ListItem, Loading, SearchBar, ui } from '@/components/ui';
import { colors, space } from '@/theme';

const FILTERS = [{ value: 'all', label: 'Tümü' }, ...Object.entries(CAMPAIGN_STATUS).map(([value, s]) => ({ value, label: s.label }))];

export default function Campaigns() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');
  const q = useDebounced(term);
  const list = usePaged<Campaign>(['campaigns'], '/campaigns', { search: q.trim() || undefined, status: status === 'all' ? undefined : status, sort: 'display_order' }, 30);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Kampanyalar' }} />
      <FlatList
        data={list.items}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={(
          <View style={{ gap: space.md, padding: space.lg, paddingBottom: space.sm }}>
            <SearchBar value={term} onChangeText={setTerm} placeholder="Kampanya ara" />
            <Chips options={FILTERS} value={status} onChange={setStatus} />
            {list.first ? <Text style={ui.muted}>{list.total} kampanya</Text> : null}
          </View>
        )}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => list.refetch()}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        contentContainerStyle={{ paddingBottom: 110 }}
        ItemSeparatorComponent={() => <View style={ui.separator} />}
        ListEmptyComponent={list.isLoading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={() => list.refetch()} /> : <Empty title="Kampanya yok" />}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ padding: space.lg }} /> : null}
        renderItem={({ item }) => {
          const s = CAMPAIGN_STATUS[item.status] || { label: item.status, tone: 'muted' as const };
          return (
            <ListItem
              title={item.title}
              subtitle={`${money(item.collected_cents, item.currency)}${item.target_cents ? ` / ${money(item.target_cents, item.currency)} · %${Math.round(item.progress_percentage || 0)}` : ''}`}
              meta={item.is_featured ? 'Öne çıkan' : undefined}
              right={<Badge label={s.label} tone={s.tone} />}
              chevron
              onPress={() => router.push({ pathname: '/kampanyalar/form', params: { id: item.id, slug: item.slug } })}
            />
          );
        }}
      />
      <Fab label="Kampanya ekle" icon={<Plus size={20} color={colors.white} />} onPress={() => router.push('/kampanyalar/form')} />
    </View>
  );
}
