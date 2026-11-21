import React, { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Phone } from 'lucide-react-native';
import { af } from '@/lib/api';
import { call, isDialable } from '@/lib/format';
import { Badge, Btn, Card, Chips, Empty, ListItem, QueryView, Screen, SearchBar, SectionTitle } from '@/components/ui';
import { useTheme } from '@/theme';

type Recipient = {
  id: string;
  full_name: string;
  phone?: string;
  region_name?: string;
  address?: string;
  district?: string;
  city?: string;
  household_size?: number;
  status?: string;
  is_active?: boolean;
  review_status?: string;
};

export default function NeedyScreen() {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'passive'>('active');

  const query = useQuery({
    queryKey: ['aid-recipients', q],
    queryFn: () =>
      af<{ items?: Recipient[] } | Recipient[]>('/aid-recipients', {
        query: {
          q: q.trim() || undefined,
          page_size: 100,
        },
      }),
  });

  const isRecipientActive = (r: Recipient) =>
    r.status ? r.status === 'active' : r.is_active !== false;

  const list: Recipient[] = (Array.isArray(query.data) ? query.data : query.data?.items || []).filter((r) => {
    if (status === 'all') return true;
    const active = isRecipientActive(r);
    return status === 'active' ? active : !active;
  });

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Yoksul / Aile Takip' }} />
      <SearchBar value={q} onChangeText={setQ} placeholder="Aile adı, telefon veya bölge ara…" />
      <Chips
        options={[
          { value: 'active', label: 'Aktif' },
          { value: 'passive', label: 'Pasif' },
          { value: 'all', label: 'Tümü' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <SectionTitle>Kayıtlı Aileler ({list.length})</SectionTitle>
      <QueryView query={query}>
        {() =>
          list.length === 0 ? (
            <Empty title="Aile kaydı bulunamadı" text="Aramanıza uygun ihtiyaç sahibi kaydı yok." />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {list.map((r) => {
                const active = isRecipientActive(r);
                const loc = r.region_name || [r.district, r.city].filter(Boolean).join(', ') || r.address;
                return (
                <ListItem
                  key={r.id}
                  title={r.full_name}
                  subtitle={[loc, r.household_size ? `${r.household_size} kişi` : null].filter(Boolean).join(' · ') || r.phone}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Badge label={active ? 'Aktif' : 'Pasif'} tone={active ? 'ok' : 'muted'} />
                      {isDialable(r.phone) ? (
                        <Btn
                          title="Ara"
                          small
                          variant="outline"
                          icon={<Phone size={14} color={colors.primaryDark} />}
                          onPress={() => call(r.phone!)}
                        />
                      ) : null}
                    </View>
                  }
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
