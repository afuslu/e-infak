import React, { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { af, api } from '@/lib/api';
import { can } from '@/lib/access';
import { idempotencyKey, money, toCents, todayIso } from '@/lib/format';
import { useDebounced } from '@/lib/paged';
import { CURRENCY_OPTIONS, Donor, PAYMENT_OPTIONS } from '@/api/types';
import { Btn, Card, Chips, Field, ListItem, Notice, Screen, SearchBar, SectionTitle, Select, SwitchRow, useUi } from '@/components/ui';
import { DateField } from '@/components/fields';
import { notify } from '@/components/toast';
import { useCampaignOptions } from '@/api/hooks';
import { space, useTheme } from '@/theme';

type Line = { key: number; campaign_id: string | null; amount: string; on_behalf_of: string };
type Book = { id: string; name?: string; label?: string; series?: string; next_no?: number; is_active?: boolean; status?: string };
type BankAccount = { id: string; label: string; iban?: string | null; enabled?: boolean };

export default function ManualReceipt() {
  const params = useLocalSearchParams<{ donorId?: string; donorName?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { access } = useAuth();
  const { colors } = useTheme();
  const ui = useUi();
  const key = useRef(idempotencyKey('makbuz'));
  const campaigns = useCampaignOptions();

  const [donorId, setDonorId] = useState<string | null>(params.donorId || null);
  const [donorName, setDonorName] = useState(params.donorName || '');
  const [isNew, setIsNew] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [term, setTerm] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: 1, campaign_id: null, amount: '', on_behalf_of: '' }]);
  const [currency, setCurrency] = useState('TRY');
  const [method, setMethod] = useState('cash');
  const [bankId, setBankId] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState<string | null>(todayIso());
  const [status, setStatus] = useState('paid');
  const [bookId, setBookId] = useState<string | null>(null);
  const [officialNo, setOfficialNo] = useState('');
  const [note, setNote] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [sendReceipt, setSendReceipt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useDebounced(term);
  const search = useQuery({
    queryKey: ['donor-search', q],
    enabled: !donorId && !isNew && q.trim().length >= 2,
    queryFn: () => af<{ items: Donor[] }>('/donors', { query: { q: q.trim(), page_size: 8, sort: 'name' } }),
  });
  const books = useQuery({ queryKey: ['receipt-books'], queryFn: () => af<Book[]>('/receipt-books').catch(() => [] as Book[]) });
  const banks = useQuery({ queryKey: ['bank-accounts'], queryFn: () => api<BankAccount[]>('/admin/bank-accounts').catch(() => [] as BankAccount[]) });

  const total = useMemo(() => lines.reduce((sum, l) => sum + (toCents(l.amount) || 0), 0), [lines]);
  const setLine = (k: number, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const bookOptions = (books.data || []).filter((b) => b.is_active !== false && (!b.status || b.status === 'active'))
    .map((b) => ({ value: b.id, label: b.name || b.label || b.series || 'Koçan' }));
  const bankOptions = (banks.data || []).filter((b) => b.enabled !== false).map((b) => ({ value: b.id, label: b.label, hint: b.iban || undefined }));

  const submit = async () => {
    setError(null);
    if (!donorId && !(isNew && first.trim())) return setError('Bir bağışçı seçin ya da yeni bağışçının adını yazın.');
    const body_lines = [];
    for (const l of lines) {
      const cents = toCents(l.amount);
      if (!l.campaign_id || !cents) return setError('Her satır için bağış kalemi ve tutar girin.');
      body_lines.push({ campaign_id: l.campaign_id, amount_cents: cents, currency, quantity: 1, on_behalf_of: l.on_behalf_of.trim() || undefined });
    }
    if (!paidOn) return setError('Geçerli bir tarih girin.');
    setBusy(true);
    try {
      const result = await af<{ receipt_number: string; id: string }>('/donations/manual', {
        method: 'POST',
        body: {
          idempotency_key: key.current,
          donor_id: donorId || undefined,
          donor: donorId ? undefined : { first_name: first.trim(), last_name: last.trim() || undefined, phone: phone.trim() || undefined },
          lines: body_lines,
          currency,
          payment_method: method,
          bank_account_id: method === 'bank_transfer' ? bankId || undefined : undefined,
          paid_on: paidOn === todayIso() ? undefined : paidOn,
          status,
          note: note.trim() || undefined,
          is_anonymous: anonymous,
          send_receipt: sendReceipt,
          receipt_book_id: bookId || undefined,
          official_no: officialNo.trim() ? Number(officialNo) : undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['donations'] });
      queryClient.invalidateQueries({ queryKey: ['donors'] });
      queryClient.invalidateQueries({ queryKey: ['donor'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      notify(`Makbuz kesildi: ${result.receipt_number}`);
      router.replace({ pathname: '/bagis/[id]', params: { id: result.id, no: result.receipt_number } });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Btn title={`Makbuz kes${total ? ` · ${money(total, currency)}` : ''}`} onPress={submit} loading={busy} />}>
      <Stack.Screen options={{ title: 'Elle makbuz kes' }} />
      {error ? <Notice text={error} tone="danger" /> : null}

      <SectionTitle>Bağışçı</SectionTitle>
      {donorId ? (
        <Card>
          <ListItem title={donorName || 'Seçili bağışçı'} right={<Btn title="Değiştir" variant="ghost" small onPress={() => { setDonorId(null); setDonorName(''); }} />} />
        </Card>
      ) : isNew ? (
        <Card>
          <Field label="Ad" value={first} onChangeText={setFirst} autoCapitalize="words" />
          <Field label="Soyad" value={last} onChangeText={setLast} autoCapitalize="words" />
          <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05xx xxx xx xx" />
          <Btn title="Kayıtlı bağışçı ara" variant="ghost" small onPress={() => setIsNew(false)} />
        </Card>
      ) : (
        <Card>
          <SearchBar value={term} onChangeText={setTerm} placeholder="Ad, telefon ya da e-posta" />
          {(search.data?.items || []).map((d) => (
            <ListItem key={d.id} title={d.full_name} subtitle={d.phone || d.email} onPress={() => { setDonorId(d.id); setDonorName(d.full_name); }} />
          ))}
          {search.data && !search.data.items.length ? <Text style={ui.muted}>Eşleşen bağışçı yok.</Text> : null}
          {can(access, 'donors.create') ? <Btn title="Yeni bağışçı" variant="outline" small onPress={() => setIsNew(true)} /> : null}
        </Card>
      )}

      <SectionTitle>Bağış satırları</SectionTitle>
      {lines.map((l, i) => (
        <Card key={l.key}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={ui.muted}>Satır {i + 1}</Text>
            {lines.length > 1 ? (
              <Pressable onPress={() => setLines((all) => all.filter((x) => x.key !== l.key))} hitSlop={10} accessibilityLabel="Satırı sil" accessibilityRole="button">
                <Trash2 size={18} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
          <Select label="Bağış kalemi" value={l.campaign_id} options={campaigns} onChange={(campaign_id) => setLine(l.key, { campaign_id })} searchable />
          <Field label="Tutar" value={l.amount} onChangeText={(amount) => setLine(l.key, { amount })} keyboardType="decimal-pad" placeholder="0" />
          <Field label="Kimin adına (isteğe bağlı)" value={l.on_behalf_of} onChangeText={(on_behalf_of) => setLine(l.key, { on_behalf_of })} />
        </Card>
      ))}
      <Btn title="Satır ekle" variant="outline" small icon={<Plus size={16} color={colors.primaryDark} />}
        onPress={() => setLines((all) => [...all, { key: Date.now(), campaign_id: null, amount: '', on_behalf_of: '' }])} />

      <SectionTitle>Ödeme</SectionTitle>
      <Card style={{ gap: space.md }}>
        <Select label="Para birimi" value={currency} options={CURRENCY_OPTIONS} onChange={(v) => setCurrency(v || 'TRY')} />
        <Text style={ui.muted}>Ödeme türü</Text>
        <Chips options={PAYMENT_OPTIONS} value={method} onChange={setMethod} wrap />
        {method === 'bank_transfer' && bankOptions.length ? (
          <Select label="Banka hesabı" value={bankId} options={bankOptions} onChange={setBankId} allowClear />
        ) : null}
        <DateField label="Tarih" value={paidOn} onChange={setPaidOn}
          hint={can(access, 'receipts.backdate') ? undefined : 'Geçmiş tarihli makbuz için yetkiniz yok.'} />
        <Text style={ui.muted}>Durum</Text>
        <Chips options={[{ value: 'paid', label: 'Ödendi' }, { value: 'pending', label: 'Beklemede' }]} value={status} onChange={setStatus} wrap />
      </Card>

      <SectionTitle>Diğer</SectionTitle>
      <Card style={{ gap: space.md }}>
        {bookOptions.length ? (
          <>
            <Select label="Makbuz koçanı" value={bookId} options={bookOptions} onChange={setBookId} allowClear placeholder="Koçansız" />
            {bookId ? <Field label="Koçan yaprak no" value={officialNo} onChangeText={setOfficialNo} keyboardType="number-pad" hint="Boş bırakılırsa sıradaki yaprak verilir." /> : null}
          </>
        ) : null}
        <Field label="Not" value={note} onChangeText={setNote} multiline maxLength={1000} />
        <SwitchRow label="Gizli bağış" hint="Bağışçı adı sitede gösterilmez." value={anonymous} onValueChange={setAnonymous} />
        <SwitchRow label="Makbuz SMS'i gönder" value={sendReceipt} onValueChange={setSendReceipt} />
      </Card>
    </Screen>
  );
}
