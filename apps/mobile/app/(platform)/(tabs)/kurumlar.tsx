import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { pf } from '@/lib/api';
import { Badge, Btn, Chips, Empty, ListItem, QueryView, Screen, SearchBar, useUi } from '@/components/ui';
import { useTheme } from '@/theme';

export type PlatformOrg = {
  id: string;
  slug: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  plan: string;
  plan_label: string;
  subscription_status: string;
  is_active: boolean;
  url: string;
  user_count?: number;
  donation_count?: number;
  monthly_fee_cents?: number;
};

type Filter = 'all' | 'active' | 'trial' | 'past_due' | 'suspended';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'active', label: 'Aktif' },
  { value: 'trial', label: 'Deneme' },
  { value: 'past_due', label: 'Gecikmiş' },
  { value: 'suspended', label: 'Askıda' },
];

export default function PlatformOrgsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const ui = useUi();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const query = useQuery({
    queryKey: ['platform', 'organizations'],
    queryFn: () => pf<PlatformOrg[]>('/organizations'),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return (query.data || []).filter((o) => {
      if (filter === 'suspended' && o.is_active) return false;
      if (filter !== 'all' && filter !== 'suspended') {
        if (!o.is_active || (o.subscription_status || 'active') !== filter) return false;
      }
      if (!q) return true;
      return (
        o.name.toLocaleLowerCase('tr-TR').includes(q) ||
        o.slug.toLocaleLowerCase('tr-TR').includes(q) ||
        (o.city || '').toLocaleLowerCase('tr-TR').includes(q) ||
        o.email.toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [query.data, search, filter]);

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <View style={ui.rowGap}>
        <View style={{ flex: 1 }}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Kurum adı, slug, şehir..." />
        </View>
        <Btn
          title="Yeni"
          icon={<Plus size={16} color={colors.white} />}
          onPress={() => router.push('/kurum/yeni' as Href)}
        />
      </View>

      <Chips options={FILTERS} value={filter} onChange={setFilter} />

      <QueryView query={query}>
        {() =>
          filtered.length === 0 ? (
            <Empty title="Kurum bulunamadı" text="Arama veya filtre ölçütünü değiştirin." />
          ) : (
            <View style={ui.listCard}>
              {filtered.map((o, idx) => {
                const st = !o.is_active ? 'Askıda' : o.subscription_status === 'trial' ? 'Deneme' : o.subscription_status === 'past_due' ? 'Gecikmiş' : 'Aktif';
                const tone = !o.is_active ? 'danger' : o.subscription_status === 'trial' ? 'info' : o.subscription_status === 'past_due' ? 'warn' : 'ok';
                return (
                  <View key={o.id}>
                    {idx > 0 ? <View style={ui.separator} /> : null}
                    <ListItem
                      title={o.name}
                      subtitle={`${o.plan_label || o.plan} · ${o.city || o.slug}`}
                      meta={`${o.user_count ?? 0} kullanıcı · ${(o.donation_count ?? 0).toLocaleString('tr-TR')} bağış`}
                      right={<Badge label={st} tone={tone} />}
                      chevron
                      onPress={() => router.push(`/kurum/${o.id}` as Href)}
                    />
                  </View>
                );
              })}
            </View>
          )
        }
      </QueryView>
    </Screen>
  );
}
