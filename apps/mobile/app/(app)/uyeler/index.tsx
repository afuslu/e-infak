import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { can } from '@/lib/access';
import { money } from '@/lib/format';
import { useDebounced } from '@/lib/paged';
import { Member } from '@/api/types';
import { Badge, Chips, Empty, Fab, ListItem, QueryView, Screen, SearchBar, Stat, ui } from '@/components/ui';
import { colors } from '@/theme';

type Summary = { members: Record<string, number>; open_cents: number; overdue_cents: number; overdue_members: number; collected_cents: number; year: number };

const FILTERS = [
  { value: 'active', label: 'Aktif' },
  { value: 'overdue', label: 'Aidatı geciken' },
  { value: 'all', label: 'Tümü' },
];

export default function Members() {
  const router = useRouter();
  const { access } = useAuth();
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState('active');
  const q = useDebounced(term);
  const summary = useQuery({ queryKey: ['member-summary'], queryFn: () => af<Summary>('/member-dues-summary') });
  const query = useQuery({
    queryKey: ['members', q, filter],
    queryFn: () => af<Member[]>('/members', {
      query: { q: q.trim() || undefined, status: filter === 'active' ? 'active' : undefined, overdue_only: filter === 'overdue' || undefined, sort: filter === 'overdue' ? 'debt_desc' : 'member_no' },
    }),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Üyeler ve aidatlar' }} />
      <Screen onRefresh={() => { query.refetch(); summary.refetch(); }} refreshing={query.isRefetching} style={{ paddingBottom: 110 }}>
        {summary.data ? (
          <View style={ui.wrapGap}>
            <Stat label="Aktif üye" value={String(summary.data.members.active || 0)} />
            <Stat label="Geciken aidat" value={money(summary.data.overdue_cents)} sub={`${summary.data.overdue_members} üye`} />
            <Stat label={`${summary.data.year} tahsilat`} value={money(summary.data.collected_cents)} />
          </View>
        ) : null}
        <SearchBar value={term} onChangeText={setTerm} placeholder="Üye no, ad, telefon" />
        <Chips options={FILTERS} value={filter} onChange={setFilter} />
        <QueryView query={query}>
          {(list) => list.length ? (
            <View style={ui.listCard}>
              <Text style={[ui.muted, { padding: 12 }]}>{list.length} üye</Text>
              {list.slice(0, 300).map((m) => (
                <View key={m.id}>
                  <View style={ui.separator} />
                  <ListItem
                    title={`${m.member_no ? `${m.member_no} · ` : ''}${m.full_name || '—'}`}
                    subtitle={[m.member_type_label, m.phone, m.city].filter(Boolean).join(' · ')}
                    right={(
                      <>
                        {m.open_dues_cents ? <Text style={ui.amount}>{money(m.open_dues_cents)}</Text> : null}
                        {m.overdue_count ? <Badge label={`${m.overdue_count} gecikmiş`} tone="danger" /> : <Badge label={m.status_label} tone={m.status === 'active' ? 'ok' : 'muted'} />}
                      </>
                    )}
                    onPress={() => router.push({ pathname: '/uyeler/[id]', params: { id: m.id } })}
                  />
                </View>
              ))}
              {list.length > 300 ? <Text style={[ui.muted, { padding: 12 }]}>İlk 300 üye gösteriliyor; aramayı daraltın.</Text> : null}
            </View>
          ) : <Empty title="Üye bulunamadı" />}
        </QueryView>
      </Screen>
      {can(access, 'members.manage') ? <Fab label="Üye ekle" icon={<Plus size={20} color={colors.white} />} onPress={() => router.push('/uyeler/form')} /> : null}
    </View>
  );
}
