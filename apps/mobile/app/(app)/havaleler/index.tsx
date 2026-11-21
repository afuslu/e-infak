import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api, af } from '@/lib/api';
import { can } from '@/lib/access';
import { dateTime, money } from '@/lib/format';
import { useDebounced } from '@/lib/paged';
import { useCampaignOptions } from '@/api/hooks';
import { Donor } from '@/api/types';
import { Badge, Btn, Card, Empty, Field, ListItem, Notice, QueryView, Screen, SearchBar, Select, Sheet, SwitchRow, ui } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { colors, space } from '@/theme';

type Suggestion = {
  donor?: { id: string; name: string; phone?: string; reason?: string; confidence?: number } | null;
  campaign?: { id: string; title: string; reason?: string; confidence?: string } | null;
  note?: string;
};
type Transfer = {
  id: string; booked_at: string; amount_cents: number; currency: string; sender_name: string | null; description: string | null;
  status: string; suggestion: Suggestion; possible_duplicate: boolean;
};

export default function Transfers() {
  const queryClient = useQueryClient();
  const { access } = useAuth();
  const campaigns = useCampaignOptions();
  const query = useQuery({
    queryKey: ['incoming-transfers'],
    queryFn: () => api<{ total: number; items: Transfer[] }>('/admin/incoming-transfers', { query: { status: 'unmatched', limit: 100 } }),
  });
  const [open, setOpen] = useState<Transfer | null>(null);
  const [donor, setDonor] = useState<{ id: string; name: string } | null>(null);
  const [newDonor, setNewDonor] = useState(false);
  const [newName, setNewName] = useState('');
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [sendReceipt, setSendReceipt] = useState(true);
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const q = useDebounced(term);
  const search = useQuery({
    queryKey: ['donor-search', q], enabled: !!open && !donor && !newDonor && q.trim().length >= 2,
    queryFn: () => af<{ items: Donor[] }>('/donors', { query: { q: q.trim(), page_size: 8, sort: 'name' } }),
  });

  const start = (t: Transfer) => {
    setOpen(t);
    setDonor(t.suggestion?.donor ? { id: t.suggestion.donor.id, name: t.suggestion.donor.name } : null);
    setCampaignId(t.suggestion?.campaign?.id || null);
    setNewDonor(false);
    setNewName(t.sender_name || '');
    setTerm('');
    setSendReceipt(true);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['incoming-transfers'] });
    queryClient.invalidateQueries({ queryKey: ['inflow'] });
    queryClient.invalidateQueries({ queryKey: ['donations'] });
  };

  const approve = async () => {
    if (!open) return;
    if (!campaignId) return notify('Bağış kalemini seçin.', 'error');
    if (!donor && !(newDonor && newName.trim().length >= 2)) return notify('Bağışçı seçin ya da yeni bağışçı adını yazın.', 'error');
    setBusy(true);
    try {
      const result = await api<{ receipt_number: string }>(`/admin/incoming-transfers/${open.id}/approve`, {
        method: 'POST',
        body: { donor_id: donor?.id, new_donor: !donor ? { full_name: newName.trim() } : undefined, campaign_id: campaignId, send_receipt: sendReceipt },
      });
      setOpen(null);
      refresh();
      notify(`Havale bağışa dönüştü: ${result.receipt_number}`);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const ignore = async (t: Transfer) => {
    if (!(await confirm('Bu hareket yok sayılsın mı?', 'Bağış olmayan hareketler (iade, virman vb.) için kullanın.', 'Yok say', true))) return;
    try {
      await api(`/admin/incoming-transfers/${t.id}/ignore`, { method: 'POST' });
      setOpen(null);
      refresh();
      notify('Hareket yok sayıldı.');
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Bekleyen havaleler' }} />
      {!can(access, 'bank.approve') ? <Notice tone="warn" text="Havaleleri görebilirsiniz; onaylama yetkiniz yok." /> : null}
      <QueryView query={query}>
        {(data) => data.items.length ? (
          <>
            <Text style={ui.muted}>{data.total} havale · toplam {money(data.items.reduce((s, t) => s + (t.currency === 'TRY' ? t.amount_cents : 0), 0))}</Text>
            {data.items.map((t) => (
              <Card key={t.id} onPress={can(access, 'bank.approve') ? () => start(t) : undefined}>
                <View style={[ui.rowGap, { justifyContent: 'space-between' }]}>
                  <Text style={[ui.text, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>{t.sender_name || 'Gönderen bilinmiyor'}</Text>
                  <Text style={ui.amount}>{money(t.amount_cents, t.currency)}</Text>
                </View>
                {t.description ? <Text style={ui.muted} numberOfLines={2}>{t.description}</Text> : null}
                <Text style={[ui.muted, { fontSize: 12 }]}>{dateTime(t.booked_at)}</Text>
                <View style={ui.wrapGap}>
                  {t.suggestion?.donor ? <Badge label={`Öneri: ${t.suggestion.donor.name}`} tone="ok" /> : <Badge label="Bağışçı önerisi yok" tone="warn" />}
                  {t.suggestion?.campaign ? <Badge label={t.suggestion.campaign.title} tone="info" /> : null}
                  {t.possible_duplicate ? <Badge label="Mükerrer olabilir" tone="danger" /> : null}
                </View>
              </Card>
            ))}
          </>
        ) : <Empty title="Bekleyen havale yok" text="Banka senkronunda eşleşmeyen havaleler burada görünür." />}
      </QueryView>

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open ? `${money(open.amount_cents, open.currency)} havale` : ''}
        footer={open ? (
          <View style={{ gap: space.sm }}>
            <Btn title="Onayla ve makbuz kes" onPress={approve} loading={busy} />
            {can(access, 'bank.ignore') ? <Btn title="Yok say" variant="ghost" onPress={() => ignore(open)} /> : null}
          </View>
        ) : undefined}>
        {open ? (
          <>
            <Text style={ui.text}>{open.sender_name}</Text>
            {open.description ? <Text style={ui.muted}>{open.description}</Text> : null}
            {open.suggestion?.donor?.reason ? <Notice text={`Bağışçı önerisi: ${open.suggestion.donor.reason}`} /> : null}
            <Text style={[ui.muted, { fontWeight: '700', color: colors.text }]}>Bağışçı</Text>
            {donor ? (
              <ListItem title={donor.name} right={<Btn title="Değiştir" variant="ghost" small onPress={() => setDonor(null)} />} />
            ) : newDonor ? (
              <>
                <Field label="Yeni bağışçı adı" value={newName} onChangeText={setNewName} autoCapitalize="words" />
                <Btn title="Kayıtlı bağışçı ara" variant="ghost" small onPress={() => setNewDonor(false)} />
              </>
            ) : (
              <>
                <SearchBar value={term} onChangeText={setTerm} placeholder="Ad, telefon" />
                {(search.data?.items || []).map((d) => <ListItem key={d.id} title={d.full_name} subtitle={d.phone} onPress={() => setDonor({ id: d.id, name: d.full_name })} />)}
                <Btn title="Gönderen adıyla yeni bağışçı" variant="outline" small onPress={() => setNewDonor(true)} />
              </>
            )}
            <Select label="Bağış kalemi" value={campaignId} options={campaigns} onChange={setCampaignId} searchable />
            <SwitchRow label="Bağışçıya makbuz SMS'i gönder" value={sendReceipt} onValueChange={setSendReceipt} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
