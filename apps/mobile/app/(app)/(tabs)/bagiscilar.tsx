import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, SlidersHorizontal } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/access';
import { initials, money, toCents } from '@/lib/format';
import { useDebounced, usePaged } from '@/lib/paged';
import { useStaffOptions } from '@/api/hooks';
import { activity, Donor } from '@/api/types';
import { Avatar, Badge, Btn, Chips, Empty, ErrorView, Fab, Field, ListItem, Loading, SearchBar, Select, Sheet, ui } from '@/components/ui';
import { colors, font, radius, space } from '@/theme';

const SORTS = [
  { value: 'recent', label: 'Son bağış' },
  { value: 'total', label: 'Toplam bağış' },
  { value: 'name', label: 'Ada göre' },
];
const YES_NO = [{ value: 'true', label: 'Evet' }, { value: 'false', label: 'Hayır' }];

type Filters = {
  assigned: string | null; region: string | null; donor_type: string | null; has_donation: string | null;
  allow_sms: string | null; tag: string; min: string;
};
const NONE: Filters = { assigned: null, region: null, donor_type: null, has_donation: null, allow_sms: null, tag: '', min: '' };

export default function Donors() {
  const router = useRouter();
  const { access } = useAuth();
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState('recent');
  const [filters, setFilters] = useState<Filters>(NONE);
  const [draft, setDraft] = useState<Filters>(NONE);
  const [open, setOpen] = useState(false);
  const q = useDebounced(term);
  const staff = useStaffOptions(open);

  const query = useMemo(() => ({
    q: q.trim() || undefined, sort,
    assigned: filters.assigned, region: filters.region, donor_type: filters.donor_type,
    has_donation: filters.has_donation, allow_sms: filters.allow_sms,
    tag: filters.tag.trim() || undefined, min_total_cents: toCents(filters.min),
  }), [q, sort, filters]);
  const list = usePaged<Donor>(['donors'], '/admin-features/donors', query, 30);
  const active = Object.values(filters).filter(Boolean).length;

  const header = (
    <View style={{ gap: space.md, padding: space.lg, paddingBottom: space.sm }}>
      <SearchBar value={term} onChangeText={setTerm} placeholder="Ad, telefon, e-posta, şehir"
        right={(
          <Pressable onPress={() => { setDraft(filters); setOpen(true); }} accessibilityRole="button" accessibilityLabel="Filtreler"
            style={{ width: 46, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: active ? colors.primary : colors.line, backgroundColor: active ? colors.primarySoft : colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <SlidersHorizontal size={20} color={active ? colors.primaryDark : colors.muted} />
          </Pressable>
        )} />
      <Chips options={SORTS} value={sort} onChange={setSort} />
      {list.first ? <Text style={ui.muted}>{list.total} bağışçı</Text> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={list.items}
        keyExtractor={(d) => d.id}
        ListHeaderComponent={header}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => list.refetch()}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: 110 }}
        ItemSeparatorComponent={() => <View style={ui.separator} />}
        ListEmptyComponent={list.isLoading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={() => list.refetch()} />
          : <Empty title="Bağışçı bulunamadı" text="Arama ya da filtreleri değiştirin." />}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ padding: space.lg }} /> : null}
        renderItem={({ item }) => {
          const a = activity(item.last_donation_at);
          return (
            <ListItem
              left={<Avatar text={initials(item.full_name)} />}
              title={item.full_name}
              subtitle={[item.phone, item.city].filter(Boolean).join(' · ') || item.email}
              meta={item.tags?.length ? item.tags.map((t) => `#${t}`).join(' ') : undefined}
              right={<><Text style={ui.amount}>{money(item.total_donated_cents)}</Text><Badge label={a.label} tone={a.tone} /></>}
              onPress={() => router.push({ pathname: '/bagisci/[id]', params: { id: item.id } })}
            />
          );
        }}
      />
      {can(access, 'donors.create') ? (
        <Fab label="Bağışçı ekle" icon={<Plus size={20} color={colors.white} />} onPress={() => router.push('/bagisci/form')} />
      ) : null}

      <Sheet visible={open} onClose={() => setOpen(false)} title="Filtreler"
        footer={(
          <View style={ui.rowGap}>
            <Btn title="Temizle" variant="outline" style={{ flex: 1 }} onPress={() => { setFilters(NONE); setOpen(false); }} />
            <Btn title="Uygula" style={{ flex: 1 }} onPress={() => { setFilters(draft); setOpen(false); }} />
          </View>
        )}>
        <Select label="Sorumlu personel" value={draft.assigned} allowClear placeholder="Tümü" searchable
          options={[{ value: 'me', label: 'Bana atananlar' }, { value: 'none', label: 'Atanmamış' }, ...staff]}
          onChange={(assigned) => setDraft({ ...draft, assigned })} />
        <Select label="Bölge" value={draft.region} allowClear placeholder="Tümü"
          options={[{ value: 'yurtici', label: 'Yurt içi' }, { value: 'yurtdisi', label: 'Yurt dışı' }]}
          onChange={(region) => setDraft({ ...draft, region })} />
        <Select label="Tür" value={draft.donor_type} allowClear placeholder="Tümü"
          options={[{ value: 'individual', label: 'Bireysel' }, { value: 'corporate', label: 'Kurumsal' }]}
          onChange={(donor_type) => setDraft({ ...draft, donor_type })} />
        <Select label="Bağışı var mı?" value={draft.has_donation} allowClear placeholder="Tümü" options={YES_NO}
          onChange={(has_donation) => setDraft({ ...draft, has_donation })} />
        <Select label="SMS izni" value={draft.allow_sms} allowClear placeholder="Tümü" options={YES_NO}
          onChange={(allow_sms) => setDraft({ ...draft, allow_sms })} />
        <Field label="Etiket" value={draft.tag} onChangeText={(tag) => setDraft({ ...draft, tag })} autoCapitalize="none" />
        <Field label="En az toplam bağış" value={draft.min} onChangeText={(min) => setDraft({ ...draft, min })} keyboardType="decimal-pad" />
        <Text style={{ fontSize: font.xs, color: colors.muted }}>Sıralama listenin üstünden değiştirilir.</Text>
      </Sheet>
    </View>
  );
}
