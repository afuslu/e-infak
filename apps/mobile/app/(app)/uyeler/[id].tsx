import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Square } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { can } from '@/lib/access';
import { call, date, idempotencyKey, isDialable, money } from '@/lib/format';
import { Member, MemberDue, PAYMENT_OPTIONS } from '@/api/types';
import { Badge, Btn, Card, Chips, Field, QueryView, Row, Screen, SectionTitle, Sheet, SwitchRow, useUi } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { space, useTheme } from '@/theme';

export default function MemberDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { access } = useAuth();
  const { colors } = useTheme();
  const ui = useUi();
  const query = useQuery({ queryKey: ['member', id], queryFn: () => af<Member & { dues: MemberDue[] }>(`/members/${id}`) });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [payOpen, setPayOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [method, setMethod] = useState('cash');
  const [sendReceipt, setSendReceipt] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(idempotencyKey('aidat'));
  const canPay = can(access, 'members.manage') || can(access, 'receipts.create');

  const toggle = (dueId: string) => setPicked((s) => {
    const next = new Set(s);
    if (next.has(dueId)) next.delete(dueId);
    else next.add(dueId);
    return next;
  });

  const refresh = async () => {
    setPicked(new Set());
    queryClient.invalidateQueries({ queryKey: ['members'] });
    queryClient.invalidateQueries({ queryKey: ['member-summary'] });
    queryClient.invalidateQueries({ queryKey: ['donations'] });
    await query.refetch();
  };

  const pay = async () => {
    setBusy(true);
    try {
      const result = await af<{ receipt_number: string }>('/member-dues/pay', {
        method: 'POST', body: { due_ids: [...picked], idempotency_key: key.current, payment_method: method, send_receipt: sendReceipt },
      });
      key.current = idempotencyKey('aidat');
      setPayOpen(false);
      notify(`Aidat tahsil edildi: ${result.receipt_number}`);
      await refresh();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const waive = async () => {
    if (reason.trim().length < 3) return notify('Muafiyet gerekçesini yazın.', 'error');
    setBusy(true);
    try {
      await af('/member-dues/waive', { method: 'POST', body: { due_ids: [...picked], reason: reason.trim() } });
      setWaiveOpen(false);
      setReason('');
      notify('Seçili aidatlar muaf tutuldu.');
      await refresh();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}
      footer={picked.size && canPay ? (
        <View style={ui.rowGap}>
          <Btn title={`Tahsil et (${picked.size})`} style={{ flex: 1 }} onPress={() => setPayOpen(true)} />
          {can(access, 'members.manage') ? <Btn title="Muaf tut" variant="outline" style={{ flex: 1 }} onPress={() => setWaiveOpen(true)} /> : null}
        </View>
      ) : undefined}>
      <Stack.Screen options={{ title: 'Üye' }} />
      <QueryView query={query}>
        {(m) => {
          const total = m.dues.filter((d) => picked.has(d.id)).reduce((s, d) => s + d.amount_cents, 0);
          return (
            <>
              <Card>
                <Text style={ui.title}>{m.full_name}</Text>
                <View style={ui.wrapGap}>
                  <Badge label={m.status_label} tone={m.status === 'active' ? 'ok' : 'muted'} />
                  <Badge label={m.member_type_label} tone="info" />
                </View>
                <Row label="Üye no" value={m.member_no || '—'} />
                <Row label="Telefon" value={m.phone || '—'} onPress={isDialable(m.phone) ? () => call(m.phone!) : undefined} />
                <Row label="Giriş tarihi" value={date(m.joined_on)} />
                <Row label="Aidat" value={m.dues_cents ? `${money(m.dues_cents)} / ${m.dues_period === 'yearly' ? 'yıl' : 'ay'}` : 'Kurum varsayılanı'} />
                <Row label="Açık borç" value={money(m.open_dues_cents)} />
              </Card>
              <View style={ui.wrapGap}>
                <Btn title="Bağışçı kartı" variant="outline" small onPress={() => router.push({ pathname: '/bagisci/[id]', params: { id: m.donor_id } })} />
                {can(access, 'members.manage') ? <Btn title="Düzenle" variant="outline" small onPress={() => router.push({ pathname: '/uyeler/form', params: { id: m.id } })} /> : null}
              </View>
              <SectionTitle right={picked.size ? <Text style={ui.muted}>{money(total)} seçili</Text> : undefined}>Aidatlar</SectionTitle>
              <View style={ui.listCard}>
                {m.dues.length ? m.dues.map((d, i) => {
                  const open = d.status === 'open';
                  const on = picked.has(d.id);
                  return (
                    <View key={d.id}>
                      {i ? <View style={ui.separator} /> : null}
                      <Pressable onPress={open && canPay ? () => toggle(d.id) : undefined} accessibilityRole={open ? 'checkbox' : undefined} accessibilityState={open ? { checked: on } : undefined}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingHorizontal: space.lg, backgroundColor: on ? colors.primarySoft : colors.card }}>
                        {open && canPay ? (on ? <CheckSquare size={20} color={colors.primary} /> : <Square size={20} color={colors.faint} />) : <View style={{ width: 20 }} />}
                        <View style={{ flex: 1 }}>
                          <Text style={ui.text}>{d.period}</Text>
                          <Text style={ui.muted}>Son ödeme {date(d.due_date)}{d.paid_at ? ` · Ödendi ${date(d.paid_at)}` : ''}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text style={ui.amount}>{money(d.amount_cents)}</Text>
                          <Badge label={d.overdue ? `${d.days_overdue} gün gecikti` : d.status_label} tone={d.overdue ? 'danger' : d.status === 'paid' ? 'ok' : d.status === 'waived' ? 'muted' : 'warn'} />
                        </View>
                      </Pressable>
                    </View>
                  );
                }) : <Text style={[ui.muted, { padding: space.lg }]}>Aidat kaydı yok.</Text>}
              </View>

              <Sheet visible={payOpen} onClose={() => setPayOpen(false)} title="Aidat tahsilatı" footer={<Btn title={`${money(total)} tahsil et`} onPress={pay} loading={busy} />}>
                <Text style={ui.text}>{picked.size} aidat tek makbuzla tahsil edilecek.</Text>
                <Chips options={PAYMENT_OPTIONS} value={method} onChange={setMethod} wrap />
                <SwitchRow label="Makbuz SMS'i gönder" value={sendReceipt} onValueChange={setSendReceipt} />
              </Sheet>
              <Sheet visible={waiveOpen} onClose={() => setWaiveOpen(false)} title="Aidat muafiyeti" footer={<Btn title="Muaf tut" variant="danger" onPress={waive} loading={busy} />}>
                <Text style={ui.text}>{picked.size} açık aidat muaf tutulacak.</Text>
                <Field label="Gerekçe" value={reason} onChangeText={setReason} multiline maxLength={300} placeholder="Yönetim kurulu kararı…" />
              </Sheet>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
