import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { can } from '@/lib/access';
import { dateTime } from '@/lib/format';
import { useDebounced, usePaged } from '@/lib/paged';
import { SMS_STATUS } from '@/api/types';
import { Badge, Btn, Card, Chips, Empty, ErrorView, Loading, SearchBar, Sheet, ui } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { colors, space } from '@/theme';

type Message = {
  id: string; phone: string; donor_name: string | null; body: string; status: string; source: string; template_name: string | null;
  parts: number; error: string | null; sent_at: string | null; delivered_at: string | null; created_at: string; send_after: string | null;
};
type Batch = { id: string; name: string; audience_label: string; total: number; sent: number; delivered: number; failed: number; waiting: number; state: string; created_at: string };

const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  delivered: 'ok', sent: 'info', queued: 'warn', scheduled: 'warn', failed: 'danger', cancelled: 'muted',
};
const FILTERS = [{ value: 'all', label: 'Tümü' }, ...Object.entries(SMS_STATUS).map(([value, label]) => ({ value, label }))];

export default function SmsLog() {
  const queryClient = useQueryClient();
  const { access } = useAuth();
  const [view, setView] = useState('messages');
  const [status, setStatus] = useState('all');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(term);
  const list = usePaged<Message>(['sms-messages', 'log'], '/admin-features/sms/messages', { q: q.trim() || undefined, status: status === 'all' ? undefined : status }, 40, view === 'messages');
  const batches = useQuery({ queryKey: ['sms-batches'], enabled: view === 'batches', queryFn: () => af<Batch[]>('/sms/batches') });
  const counts: Record<string, number> = list.first?.counts || {};

  const act = async (action: 'retry' | 'cancel') => {
    if (!selected) return;
    setBusy(true);
    try {
      await af(`/sms/messages/${selected.id}/${action}`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['sms-messages'] });
      setSelected(null);
      notify(action === 'retry' ? 'Mesaj yeniden kuyruğa alındı.' : 'Mesaj iptal edildi.');
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={{ gap: space.md, padding: space.lg, paddingBottom: space.sm }}>
      <Chips options={[{ value: 'messages', label: 'Mesajlar' }, { value: 'batches', label: 'Toplu gönderimler' }]} value={view} onChange={setView} />
      {view === 'messages' ? (
        <>
          <SearchBar value={term} onChangeText={setTerm} placeholder="Telefon, ad ya da metin" />
          <Chips options={FILTERS.map((f) => ({ ...f, label: f.value !== 'all' && counts[f.value] ? `${f.label} (${counts[f.value]})` : f.label }))} value={status} onChange={setStatus} />
        </>
      ) : null}
    </View>
  );

  if (view === 'batches') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ title: 'SMS gönderimleri' }} />
        <FlatList
          data={batches.data || []}
          keyExtractor={(b) => b.id}
          ListHeaderComponent={header}
          refreshing={batches.isRefetching}
          onRefresh={() => batches.refetch()}
          ListEmptyComponent={batches.isLoading ? <Loading /> : batches.error ? <ErrorView error={batches.error} onRetry={() => batches.refetch()} /> : <Empty title="Toplu gönderim yok" />}
          contentContainerStyle={{ paddingBottom: space.xl, gap: space.sm }}
          renderItem={({ item }) => (
            <Card style={{ marginHorizontal: space.lg }}>
              <Text style={[ui.text, { fontWeight: '700' }]}>{item.name || item.audience_label}</Text>
              <Text style={ui.muted}>{dateTime(item.created_at)} · {item.audience_label}</Text>
              <View style={ui.wrapGap}>
                <Badge label={`${item.total} alıcı`} />
                <Badge label={`${item.delivered} iletildi`} tone="ok" />
                <Badge label={`${item.sent} gönderildi`} tone="info" />
                {item.waiting ? <Badge label={`${item.waiting} bekliyor`} tone="warn" /> : null}
                {item.failed ? <Badge label={`${item.failed} başarısız`} tone="danger" /> : null}
              </View>
            </Card>
          )}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'SMS gönderimleri' }} />
      <FlatList
        data={list.items}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={header}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => list.refetch()}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        ItemSeparatorComponent={() => <View style={ui.separator} />}
        ListEmptyComponent={list.isLoading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={() => list.refetch()} /> : <Empty title="Mesaj yok" />}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ padding: space.lg }} /> : null}
        contentContainerStyle={{ paddingBottom: space.xl }}
        renderItem={({ item }) => (
          <Card style={{ borderRadius: 0, borderWidth: 0 }} onPress={() => setSelected(item)}>
            <View style={[ui.rowGap, { justifyContent: 'space-between' }]}>
              <Text style={[ui.text, { fontWeight: '600', flex: 1 }]} numberOfLines={1}>{item.donor_name || item.phone}</Text>
              <Badge label={SMS_STATUS[item.status] || item.status} tone={TONE[item.status]} />
            </View>
            <Text style={ui.muted} numberOfLines={2}>{item.body}</Text>
            <Text style={[ui.muted, { fontSize: 11 }]}>{dateTime(item.sent_at || item.created_at)}{item.template_name ? ` · ${item.template_name}` : ''}</Text>
          </Card>
        )}
      />
      <Sheet visible={!!selected} onClose={() => setSelected(null)} title="SMS ayrıntısı"
        footer={selected && can(access, 'sms.send') ? (
          <View style={ui.rowGap}>
            {selected.status === 'failed' ? <Btn title="Yeniden dene" style={{ flex: 1 }} onPress={() => act('retry')} loading={busy} /> : null}
            {selected.status === 'queued' || selected.status === 'scheduled' ? <Btn title="İptal et" variant="danger" style={{ flex: 1 }} onPress={() => act('cancel')} loading={busy} /> : null}
          </View>
        ) : undefined}>
        {selected ? (
          <>
            <Text style={ui.text}>{selected.body}</Text>
            <Text style={ui.muted}>Alıcı: {selected.donor_name ? `${selected.donor_name} · ` : ''}{selected.phone}</Text>
            <Text style={ui.muted}>Durum: {SMS_STATUS[selected.status] || selected.status} · {selected.parts} SMS</Text>
            {selected.delivered_at ? <Text style={ui.muted}>İletildi: {dateTime(selected.delivered_at)}</Text> : null}
            {selected.error ? <Text style={{ color: colors.danger }}>{selected.error}</Text> : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
