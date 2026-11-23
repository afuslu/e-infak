import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Heart, Search, ShoppingBag } from 'lucide-react-native';
import { CATEGORY_LABELS, fetchCampaigns, PublicCampaign } from '@/api/public';
import { IddefBottomBar, IddefHeader, useBrandColors } from '@/components/IddefChrome';
import { useCart } from '@/context/CartContext';
import { notify } from '@/components/toast';
import { money, toCents } from '@/lib/format';
import { radius, space } from '@/theme';

export default function QuickDonateScreen() {
  const router = useRouter();
  const { primary, accent } = useBrandColors();
  const { addItem, currency } = useCart();

  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const campaignsQuery = useQuery({
    queryKey: ['public', 'campaigns', 'active'],
    queryFn: () => fetchCampaigns({ page_size: 100 }),
  });

  const campaigns = campaignsQuery.data ?? [];

  const categoryKeys = useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach((c) => {
      if (c.category) set.add(c.category.toLowerCase());
    });
    return ['all', ...Array.from(set)];
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return campaigns.filter((c) => {
      if (selectedCat !== 'all' && (c.category || '').toLowerCase() !== selectedCat) return false;
      if (!q) return true;
      return (
        c.title.toLocaleLowerCase('tr-TR').includes(q) ||
        (c.summary || '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [campaigns, selectedCat, search]);

  const getCentsFor = (c: PublicCampaign): number => {
    const typed = customInputs[c.id];
    if (typed !== undefined && typed.trim() !== '') {
      return toCents(typed) || 0;
    }
    return c.suggested_amounts_cents?.[0] || c.reference_amounts?.[currency] || c.min_donation_cents || 10000;
  };

  const addQuick = (c: PublicCampaign, goCart: boolean) => {
    const cents = getCentsFor(c);
    const min = c.min_donation_cents || 100;
    if (cents < min) {
      notify(`Minimum tutar ${money(min, currency)} olmalıdır.`);
      return;
    }
    addItem({
      campaign_id: c.id,
      campaign_slug: c.slug,
      campaign_title: c.title,
      cover_image_url: c.cover_image_url,
      unit_amount_cents: cents,
      quantity: 1,
    });
    if (goCart) {
      router.push('/(vitrin)/sepet' as Href);
    } else {
      notify(`${c.title} sepete eklendi.`);
    }
  };

  return (
    <View style={styles.root}>
      <IddefHeader title="Hızlı Bağış Yap" />

      <View style={[styles.searchWrap, { backgroundColor: primary }]}>
        <View style={styles.searchBox}>
          <Search size={18} color="#64748B" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Kurban, su kuyusu, zekat, Gazze ara..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 118 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={campaignsQuery.isRefetching}
            onRefresh={() => campaignsQuery.refetch()}
            tintColor={primary}
          />
        }
      >
        {categoryKeys.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catRow}
          >
            {categoryKeys.map((cat) => {
              const active = selectedCat === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCat(cat)}
                  style={[
                    styles.catChip,
                    active
                      ? { backgroundColor: primary, borderColor: primary }
                      : { backgroundColor: '#FFFFFF', borderColor: '#DCE4E0' },
                  ]}
                >
                  <Text style={[styles.catText, { color: active ? '#FFFFFF' : '#334155' }]}>
                    {CATEGORY_LABELS[cat] || cat.toLocaleUpperCase('tr-TR')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.list}>
          {campaignsQuery.isLoading ? (
            <ActivityIndicator size="large" color={primary} style={{ marginTop: 40 }} />
          ) : filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Aramanızla eşleşen kampanya bulunamadı.</Text>
            </View>
          ) : (
            filtered.map((c) => {
              const presets =
                c.suggested_amounts_cents?.length
                  ? c.suggested_amounts_cents.slice(0, 4)
                  : [c.reference_amounts?.[currency] || 25000];
              const currentCents = getCentsFor(c);
              return (
                <View key={c.id} style={styles.card}>
                  <Pressable onPress={() => router.push(`/(vitrin)/kampanya/${encodeURIComponent(c.slug)}` as Href)}>
                    <Text style={styles.cardTitle}>{c.title}</Text>
                    {c.summary ? (
                      <Text style={styles.cardSub} numberOfLines={2}>
                        {c.summary}
                      </Text>
                    ) : null}
                  </Pressable>

                  <View style={styles.presetRow}>
                    {presets.map((amt) => {
                      const active = currentCents === amt;
                      return (
                        <Pressable
                          key={amt}
                          onPress={() =>
                            setCustomInputs((prev) => ({
                              ...prev,
                              [c.id]: String(Math.round(amt / 100)),
                            }))
                          }
                          style={[
                            styles.presetBtn,
                            active
                              ? { backgroundColor: primary, borderColor: primary }
                              : { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
                          ]}
                        >
                          <Text style={[styles.presetText, { color: active ? '#FFFFFF' : '#0F172A' }]}>
                            {money(amt, currency)}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {c.allow_custom_amount !== false && !c.fixed_amount ? (
                      <TextInput
                        value={customInputs[c.id] ?? ''}
                        onChangeText={(v) => setCustomInputs((prev) => ({ ...prev, [c.id]: v }))}
                        keyboardType="decimal-pad"
                        placeholder="Tutar"
                        placeholderTextColor="#94A3B8"
                        style={styles.inlineInput}
                      />
                    ) : null}
                  </View>

                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => addQuick(c, false)}
                      style={[styles.outlineBtn, { borderColor: primary }]}
                    >
                      <ShoppingBag size={16} color={primary} />
                      <Text style={[styles.outlineBtnText, { color: primary }]}>Sepete Ekle</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => addQuick(c, true)}
                      style={[styles.fillBtn, { backgroundColor: accent }]}
                    >
                      <Heart size={16} color="#FFFFFF" />
                      <Text style={styles.fillBtnText}>Hemen Öde</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <IddefBottomBar active="donate" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F7' },
  searchWrap: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  catRow: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  catText: { fontSize: 13, fontWeight: '700' },
  list: { paddingHorizontal: space.lg, gap: space.md },
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: space.xl, alignItems: 'center' },
  emptyText: { color: '#64748B', fontSize: 14 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  cardSub: { fontSize: 13, color: '#64748B', marginTop: 3, lineHeight: 18 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  presetBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1 },
  presetText: { fontSize: 13, fontWeight: '700' },
  inlineInput: {
    minWidth: 86,
    height: 36,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: 2 },
  outlineBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  outlineBtnText: { fontSize: 13, fontWeight: '800' },
  fillBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  fillBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
