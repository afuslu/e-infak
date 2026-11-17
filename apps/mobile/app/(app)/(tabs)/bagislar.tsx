import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, SlidersHorizontal } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/access';
import { dateTime, money, toCents } from '@/lib/format';
import { useDebounced, usePaged } from '@/lib/paged';
import { remember } from '@/lib/selected';
import { useCampaignOptions } from '@/api/hooks';
import { CURRENCY_OPTIONS, Donation, DonationTotals, PAYMENT_OPTIONS, STATUS, STATUS_OPTIONS } from '@/api/types';
import { Badge, Btn, Chips, Empty, ErrorView, Fab, Field, ListItem, Loading, SearchBar, Select, Sheet, ui } from '@/components/ui';
import { DateField } from '@/components/fields';
import { colors, font, radius, space } from '@/theme';

const VIEWS = [
  { value: 'all', label: 'Tümü' },
  { value: 'elle', label: 'Elle makbuz' },
  { value: 'bekleyen', label: 'Bekleyen' },
  { value: 'online', label: 'Online' },
];

const SORTS = [
  { value: 'date_desc', label: 'En yeni' },
  { value: 'date_asc', label: 'En eski' },
  { value: 'amount_desc', label: 'Tutar (çoktan aza)' },
  { value: 'amount_asc', label: 'Tutar (azdan çoğa)' },
];

type Filters = {
  start: string | null; end: string | null; campaign_id: string | null; status: string | null;
  payment_method: string | null; currency: string | null; min: string; max: string; sort: string;
};
const NO_FILTERS: Filters = { start: null, end: null, campaign_id: null, status: null, payment_method: null, currency: null, min: '', max: '', sort: 'date_desc' };

export default function Donations() {
  const router = useRouter();
  const params = useLocalSearchParams<{ gorunum?: string }>();
  const { access } = useAuth();
  const [view, setView] = useState(params.gorunum || 'all');
  const [term, setTerm] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [open, setOpen] = useState(false);
  const q = useDebounced(term);
  const campaigns = useCampaignOptions();

  useEffect(() => {
    if (params.gorunum) setView(params.gorunum);
  }, [params.gorunum]);

  const query = useMemo(() => ({
    q: q.trim() || undefined,
    start: filters.start, end: filters.end, campaign_id: filters.campaign_id,
    status: view === 'bekleyen' ? 'pending' : filters.status,
    payment_method: filters.payment_method, currency: filters.currency,
    min_amount_cents: toCents(filters.min), max_amount_cents: toCents(filters.max),
    issued_by: view === 'elle' || view === 'bekleyen' ? 'manual' : view === 'online' ? 'online' : undefined,
    sort: filters.sort,
  }), [q, filters, view]);

  const list = usePaged<Donation>(['donations'], '/admin-features/donations', query, 30);
  const totals: DonationTotals[] = list.first?.totals || [];
  const active = Object.entries(filters).filter(([k, v]) => k !== 'sort' && v).length;

  const header = (
    <View style={{ gap: space.md, padding: space.lg, paddingBottom: space.sm }}>
      <SearchBar value={term} onChangeText={setTerm} placeholder="Bağışçı, telefon, makbuz no"
        right={(
          <Pressable onPress={() => { setDraft(filters); setOpen(true); }} accessibilityRole="button" accessibilityLabel="Filtreler"
            style={{ width: 46, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: active ? colors.primary : colors.line, backgroundColor: active ? colors.primarySoft : colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <SlidersHorizontal size={20} color={active ? colors.primaryDark : colors.muted} />
          </Pressable>
        )} />
      <Chips options={VIEWS} value={view} onChange={setView} />
      {list.first ? (
        <Text style={ui.muted}>
          {list.total} kayıt{totals.length ? ' · ' : ''}{totals.slice(0, 3).map((t) => money(t.total_cents, t.currency)).join(' · ')}
        </Text>
      ) : null}
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
          : <Empty title="Bağış bulunamadı" text="Arama ya da filtreleri değiştirin." />}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ padding: space.lg }} /> : null}
        renderItem={({ item }) => (
          <ListItem
            title={item.is_anonymous ? `${item.donor_name || 'İsimsiz'} (gizli)` : item.donor_name || 'İsimsiz'}
            subtitle={item.campaign_title}
            meta={`${dateTime(item.paid_at)} · ${item.payment_method_label || ''}${item.is_manual ? ' · Elle' : ''}`}
            right={<><Text style={ui.amount}>{money(item.amount_cents, item.currency)}</Text><Badge label={STATUS[item.status]?.label || item.status} tone={STATUS[item.status]?.tone} /></>}
            onPress={() => {
              remember('donation', item.id, item);
              router.push({ pathname: '/bagis/[id]', params: { id: item.id, no: item.receipt_number } });
            }}
          />
        )}
      />
      {can(access, 'receipts.create') ? (
        <Fab label="Makbuz kes" icon={<Plus size={20} color={colors.white} />} onPress={() => router.push('/makbuz-kes')} />
      ) : null}

      <Sheet visible={open} onClose={() => setOpen(false)} title="Filtreler"
        footer={(
          <View style={ui.rowGap}>
            <Btn title="Temizle" variant="outline" style={{ flex: 1 }} onPress={() => { setFilters(NO_FILTERS); setOpen(false); }} />
            <Btn title="Uygula" style={{ flex: 1 }} onPress={() => { setFilters(draft); setOpen(false); }} />
          </View>
        )}>
        <View style={ui.rowGap}>
          <View style={{ flex: 1 }}><DateField label="Başlangıç" value={draft.start} onChange={(start) => setDraft({ ...draft, start })} /></View>
          <View style={{ flex: 1 }}><DateField label="Bitiş" value={draft.end} onChange={(end) => setDraft({ ...draft, end })} /></View>
        </View>
        <Select label="Kampanya" value={draft.campaign_id} options={campaigns} onChange={(campaign_id) => setDraft({ ...draft, campaign_id })} searchable allowClear placeholder="Tümü" />
        <Select label="Durum" value={draft.status} options={STATUS_OPTIONS} onChange={(status) => setDraft({ ...draft, status })} allowClear placeholder="Tümü" />
        <Select label="Ödeme türü" value={draft.payment_method} options={PAYMENT_OPTIONS} onChange={(payment_method) => setDraft({ ...draft, payment_method })} allowClear placeholder="Tümü" />
        <Select label="Para birimi" value={draft.currency} options={CURRENCY_OPTIONS} onChange={(currency) => setDraft({ ...draft, currency })} allowClear placeholder="Tümü" />
        <View style={ui.rowGap}>
          <View style={{ flex: 1 }}><Field label="En az tutar" value={draft.min} onChangeText={(min) => setDraft({ ...draft, min })} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="En çok tutar" value={draft.max} onChangeText={(max) => setDraft({ ...draft, max })} keyboardType="decimal-pad" /></View>
        </View>
        <Text style={{ fontSize: font.sm, fontWeight: '600', color: colors.text }}>Sıralama</Text>
        <Chips options={SORTS} value={draft.sort} onChange={(sort) => setDraft({ ...draft, sort })} wrap />
      </Sheet>
    </View>
  );
}
