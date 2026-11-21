import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react-native';
import { af } from '@/lib/api';
import { money } from '@/lib/format';
import { remember } from '@/lib/selected';
import { categoryBody, DonationCategory } from '@/api/types';
import { Badge, Btn, Empty, ListItem, QueryView, Screen, ui } from '@/components/ui';
import { notifyError } from '@/components/toast';
import { colors, font } from '@/theme';

export default function Categories() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['donation-categories'], queryFn: () => af<DonationCategory[]>('/donation-categories') });
  const [moving, setMoving] = useState(false);

  const sorted = [...(query.data || [])].sort((a, b) => a.display_order - b.display_order);

  // Web panelindeki gibi iki kaydın sırası takas edilir.
  const move = async (index: number, dir: -1 | 1) => {
    const a = sorted[index];
    const b = sorted[index + dir];
    if (!a || !b || moving) return;
    setMoving(true);
    try {
      const orderA = a.display_order === b.display_order ? index : a.display_order;
      const orderB = a.display_order === b.display_order ? index + dir : b.display_order;
      await af(`/donation-categories/${a.id}`, { method: 'PUT', body: categoryBody(a, { display_order: orderB }) });
      await af(`/donation-categories/${b.id}`, { method: 'PUT', body: categoryBody(b, { display_order: orderA }) });
      await queryClient.invalidateQueries({ queryKey: ['donation-categories'] });
    } catch (e) {
      notifyError(e);
    } finally {
      setMoving(false);
    }
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Bağış kalemleri' }} />
      <Text style={ui.muted}>Web sitesi ana sayfasındaki hızlı bağış kutucukları. Okla sıralayın, dokunarak düzenleyin.</Text>
      <Btn title="Bağış kalemi ekle" icon={<Plus size={18} color={colors.white} />} onPress={() => router.push('/bagis-kalemleri/form')} />
      <QueryView query={query}>
        {() => sorted.length ? (
          <View style={ui.listCard}>
            {sorted.map((c, i) => (
              <View key={c.id}>
                {i ? <View style={ui.separator} /> : null}
                <ListItem
                  left={<Text style={{ fontSize: 26 }}>{c.icon}</Text>}
                  title={c.title}
                  subtitle={c.campaign_title || c.target_url || c.description}
                  meta={c.suggested_amounts_cents.length ? c.suggested_amounts_cents.map((a) => money(a)).join(' · ') : undefined}
                  right={(
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {!c.is_active ? <Badge label="Pasif" /> : null}
                      <Pressable onPress={() => move(i, -1)} disabled={!i} hitSlop={8} accessibilityLabel={`${c.title} yukarı`} style={{ opacity: i ? 1 : 0.3, padding: 4 }}>
                        <ArrowUp size={20} color={colors.primaryDark} />
                      </Pressable>
                      <Pressable onPress={() => move(i, 1)} disabled={i === sorted.length - 1} hitSlop={8} accessibilityLabel={`${c.title} aşağı`} style={{ opacity: i === sorted.length - 1 ? 0.3 : 1, padding: 4 }}>
                        <ArrowDown size={20} color={colors.primaryDark} />
                      </Pressable>
                    </View>
                  )}
                  onPress={() => {
                    remember('category', c.id, c);
                    router.push({ pathname: '/bagis-kalemleri/form', params: { id: c.id } });
                  }}
                />
              </View>
            ))}
          </View>
        ) : <Empty title="Henüz bağış kalemi yok" text="Ana sayfada hızlı bağış kutucuğu göstermek için ekleyin." />}
      </QueryView>
      {moving ? <Text style={[ui.muted, { fontSize: font.xs }]}>Sıralama kaydediliyor…</Text> : null}
    </Screen>
  );
}
