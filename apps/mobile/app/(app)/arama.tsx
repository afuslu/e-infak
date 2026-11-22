import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { HandCoins, HeartHandshake, PiggyBank, Users } from 'lucide-react-native';
import { af, api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useDebounced } from '@/lib/paged';
import { remember } from '@/lib/selected';
import type { Donation } from '@/api/types';
import { Card, Empty, ListItem, Loading, Screen, SearchBar, SectionTitle } from '@/components/ui';
import { space, useTheme } from '@/theme';

type DonorHit = { id: string; full_name: string; phone?: string; email?: string; total_donated_cents?: number };
type BoxHit = { id: string; code: string; location_name?: string; status?: string };
type CampHit = { id: string; title: string; status?: string; collected_cents?: number; target_cents?: number };

export default function GlobalSearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [term, setTerm] = useState('');
  const q = useDebounced(term).trim();

  const query = useQuery({
    queryKey: ['global-search', q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const [donors, donations, boxes, campaigns] = await Promise.all([
        af<{ items: DonorHit[] }>('/donors', { query: { q, page_size: 5 } }).catch(() => ({ items: [] })),
        af<{ items: Donation[] }>('/donations', { query: { q, page_size: 5 } }).catch(() => ({ items: [] })),
        af<BoxHit[] | { items?: BoxHit[] }>('/money-boxes', { query: { q, page_size: 5 } }).catch(() => []),
        api<CampHit[] | { items?: CampHit[] }>('/campaigns', { query: { search: q, page_size: 5 } }).catch(() => ({ items: [] })),
      ]);
      const boxList = Array.isArray(boxes) ? boxes : boxes.items || [];
      const campList = Array.isArray(campaigns) ? campaigns : campaigns.items || [];
      return {
        donors: donors.items || [],
        donations: donations.items || [],
        boxes: boxList.slice(0, 5),
        campaigns: campList.slice(0, 5),
      };
    },
  });

  const d = query.data;
  const total = d ? d.donors.length + d.donations.length + d.boxes.length + d.campaigns.length : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Hızlı Arama' }} />
      <SearchBar value={term} onChangeText={setTerm} placeholder="Bağışçı, telefon, makbuz no, kumbara, kampanya…" />

      {q.length < 2 ? (
        <Empty title="Tek yerden arayın" text="En az 2 karakter yazarak bağışçı, makbuz, kumbara ve kampanyalarda arayabilirsiniz." />
      ) : query.isLoading ? (
        <Loading label="Aranıyor…" />
      ) : total === 0 ? (
        <Empty title="Sonuç bulunamadı" text={`“${q}” ile eşleşen kayıt yok.`} />
      ) : (
        <View style={{ gap: space.md }}>
          {d && d.donors.length > 0 ? (
            <>
              <SectionTitle>Bağışçılar ({d.donors.length})</SectionTitle>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {d.donors.map((item) => (
                  <ListItem
                    key={item.id}
                    title={item.full_name}
                    subtitle={item.phone || item.email}
                    left={<Users size={18} color={colors.primary} />}
                    right={item.total_donated_cents ? <Text style={{ fontWeight: '700', color: colors.text }}>{money(item.total_donated_cents)}</Text> : undefined}
                    chevron
                    onPress={() => router.push({ pathname: '/bagisci/[id]', params: { id: item.id } })}
                  />
                ))}
              </Card>
            </>
          ) : null}

          {d && d.donations.length > 0 ? (
            <>
              <SectionTitle>Bağışlar & Makbuzlar ({d.donations.length})</SectionTitle>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {d.donations.map((item) => (
                  <ListItem
                    key={item.id}
                    title={`${item.donor_name || 'İsimsiz'} · ${item.receipt_number}`}
                    subtitle={item.campaign_title}
                    meta={dateTime(item.paid_at)}
                    left={<HandCoins size={18} color={colors.primary} />}
                    right={<Text style={{ fontWeight: '700', color: colors.primary }}>{money(item.amount_cents, item.currency)}</Text>}
                    chevron
                    onPress={() => {
                      remember('donation', item.id, item);
                      router.push({ pathname: '/bagis/[id]', params: { id: item.id, no: item.receipt_number } });
                    }}
                  />
                ))}
              </Card>
            </>
          ) : null}

          {d && d.boxes.length > 0 ? (
            <>
              <SectionTitle>Kumbaralar ({d.boxes.length})</SectionTitle>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {d.boxes.map((item) => (
                  <ListItem
                    key={item.id}
                    title={item.code}
                    subtitle={item.location_name || 'Konum belirtilmemiş'}
                    left={<PiggyBank size={18} color={colors.primary} />}
                    chevron
                    onPress={() => router.push({ pathname: '/kumbara/[id]', params: { id: item.id } })}
                  />
                ))}
              </Card>
            </>
          ) : null}

          {d && d.campaigns.length > 0 ? (
            <>
              <SectionTitle>Kampanyalar ({d.campaigns.length})</SectionTitle>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {d.campaigns.map((item) => (
                  <ListItem
                    key={item.id}
                    title={item.title}
                    subtitle={item.target_cents ? `${money(item.collected_cents || 0)} / ${money(item.target_cents)}` : undefined}
                    left={<HeartHandshake size={18} color={colors.primary} />}
                    chevron
                    onPress={() => router.push('/kampanyalar')}
                  />
                ))}
              </Card>
            </>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
