import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MessageSquare, Phone, Receipt } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { af } from '@/lib/api';
import { allowed, can } from '@/lib/access';
import { call, date, dateTime, initials, isDialable, mail, money, whatsapp } from '@/lib/format';
import { remember } from '@/lib/selected';
import { activity, DonorCard, SMS_STATUS, STATUS } from '@/api/types';
import { Avatar, Badge, Btn, Card, Chips, Field, ListItem, QueryView, Row, Screen, ui } from '@/components/ui';
import { SmsSheet } from '@/components/SmsSheet';
import { confirm, notify, notifyError } from '@/components/toast';
import { colors, font, space } from '@/theme';

const TABS = [
  { value: 'donations', label: 'Bağışlar' },
  { value: 'notes', label: 'Notlar' },
  { value: 'sms', label: 'SMS' },
  { value: 'info', label: 'Bilgiler' },
];

export default function DonorDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { access } = useAuth();
  const [tab, setTab] = useState('donations');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);

  const query = useQuery({ queryKey: ['donor', id], queryFn: () => af<DonorCard>(`/donors/${id}`) });
  const smsAllowed = allowed(access, 'sms', 'sms');
  const sms = useQuery({
    queryKey: ['sms-messages', 'donor', id],
    enabled: tab === 'sms' && smsAllowed,
    queryFn: () => af<{ items: any[] }>('/sms/messages', { query: { donor_id: id, page_size: 30 } }),
  });

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy('note');
    try {
      await af(`/donors/${id}/notes`, { method: 'POST', body: { content: note.trim() } });
      setNote('');
      await query.refetch();
      notify('Not eklendi.');
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (name: string) => {
    if (!(await confirm(`${name} silinsin mi?`, 'Bağışı ya da üyeliği olan bağışçı silinemez.', 'Sil', true))) return;
    setBusy('delete');
    try {
      await af(`/donors/${id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['donors'] });
      notify('Bağışçı silindi.');
      router.back();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Bağışçı' }} />
      <QueryView query={query}>
        {(d) => {
          const a = activity(d.last_donation_at);
          return (
            <>
              <Card>
                <View style={ui.rowGap}>
                  <Avatar text={initials(d.full_name)} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: font.lg, fontWeight: '700', color: colors.text }}>{d.full_name}</Text>
                    <Text style={ui.muted}>{d.donor_type === 'corporate' ? 'Kurumsal' : 'Bireysel'}{d.city ? ` · ${d.city}` : ''}</Text>
                  </View>
                  <Badge label={a.label} tone={a.tone} />
                </View>
                <View style={[ui.rowGap, { marginTop: space.sm }]}>
                  <View style={{ flex: 1 }}><Text style={ui.muted}>Toplam bağış</Text><Text style={ui.amount}>{money(d.total_donated_cents)}</Text></View>
                  <View style={{ flex: 1 }}><Text style={ui.muted}>Bağış sayısı</Text><Text style={ui.amount}>{d.total_donations}</Text></View>
                  <View style={{ flex: 1 }}><Text style={ui.muted}>Son bağış</Text><Text style={ui.amount}>{date(d.last_donation_at)}</Text></View>
                </View>
                {d.tags?.length ? <View style={ui.wrapGap}>{d.tags.map((t) => <Badge key={t} label={`#${t}`} tone="info" />)}</View> : null}
              </Card>

              <View style={ui.wrapGap}>
                {isDialable(d.phone) ? (
                  <>
                    <Btn title="Ara" variant="outline" small icon={<Phone size={16} color={colors.primaryDark} />} onPress={() => call(d.phone!)} />
                    <Btn title="WhatsApp" variant="outline" small onPress={() => whatsapp(d.phone!)} />
                  </>
                ) : null}
                {smsAllowed && can(access, 'sms.send') && d.phone ? (
                  <Btn title="SMS" variant="outline" small icon={<MessageSquare size={16} color={colors.primaryDark} />} onPress={() => setSmsOpen(true)} />
                ) : null}
                {d.email ? <Btn title="E-posta" variant="outline" small icon={<Mail size={16} color={colors.primaryDark} />} onPress={() => mail(d.email!)} /> : null}
                {can(access, 'receipts.create') ? (
                  <Btn title="Makbuz kes" small icon={<Receipt size={16} color={colors.white} />}
                    onPress={() => router.push({ pathname: '/makbuz-kes', params: { donorId: d.id, donorName: d.full_name } })} />
                ) : null}
              </View>

              <Chips options={smsAllowed ? TABS : TABS.filter((t) => t.value !== 'sms')} value={tab} onChange={setTab} />

              {tab === 'donations' ? (
                <>
                  {d.yearly?.length ? (
                    <Card>
                      {d.yearly.map((y) => (
                        <Row key={y.year} label={`${y.year} · ${y.count} bağış`}
                          value={Object.entries(y.totals || {}).map(([c, v]) => money(v, c)).join(' · ') || '—'} />
                      ))}
                    </Card>
                  ) : null}
                  <View style={ui.listCard}>
                    {d.donations.length ? d.donations.map((x, i) => (
                      <View key={x.id}>
                        {i ? <View style={ui.separator} /> : null}
                        <ListItem title={x.campaign_title || 'Bağış'} meta={`${dateTime(x.paid_at)} · ${x.payment_method_label || ''}`}
                          right={<><Text style={ui.amount}>{money(x.amount_cents, x.currency)}</Text><Badge label={STATUS[x.status]?.label || x.status} tone={STATUS[x.status]?.tone} /></>}
                          onPress={() => {
                            remember('donation', x.id, { ...x, donor_id: d.id, donor_name: d.full_name, donor_phone: d.phone, is_anonymous: false });
                            router.push({ pathname: '/bagis/[id]', params: { id: x.id, no: x.receipt_number } });
                          }} />
                      </View>
                    )) : <Text style={[ui.muted, { padding: space.lg }]}>Henüz bağışı yok.</Text>}
                  </View>
                </>
              ) : null}

              {tab === 'notes' ? (
                <>
                  {can(access, 'donors.notes_write') ? (
                    <Card>
                      <Field label="Yeni not" value={note} onChangeText={setNote} multiline maxLength={2000} />
                      <Btn title="Not ekle" small onPress={addNote} loading={busy === 'note'} disabled={!note.trim()} />
                    </Card>
                  ) : null}
                  {(d.notes || []).length ? d.notes!.map((n) => (
                    <Card key={n.id}>
                      <Text style={ui.text}>{n.content}</Text>
                      <Text style={ui.muted}>{n.author || 'Personel'} · {dateTime(n.created_at)}</Text>
                    </Card>
                  )) : <Text style={ui.muted}>{can(access, 'donors.notes_view') ? 'Not yok.' : 'Notları görme yetkiniz yok.'}</Text>}
                </>
              ) : null}

              {tab === 'sms' ? (
                <QueryView query={sms}>
                  {(data) => data.items.length ? (
                    <>
                      {data.items.map((m) => (
                        <Card key={m.id}>
                          <Text style={ui.text}>{m.body}</Text>
                          <Text style={ui.muted}>{dateTime(m.sent_at || m.created_at)} · {SMS_STATUS[m.status] || m.status}</Text>
                        </Card>
                      ))}
                    </>
                  ) : <Text style={ui.muted}>Bu bağışçıya SMS gönderilmemiş.</Text>}
                </QueryView>
              ) : null}

              {tab === 'info' ? (
                <>
                  <Card>
                    <Row label="Telefon" value={d.phone || '—'} />
                    <Row label="E-posta" value={d.email || '—'} />
                    <Row label="Şehir / Ülke" value={[d.city, d.country].filter(Boolean).join(' / ') || '—'} />
                    <Row label="Adres" value={d.address || '—'} />
                    {d.donor_type === 'corporate' ? <Row label="Vergi no" value={d.tax_number || '—'} /> : <Row label="T.C. no" value={d.tc_no_masked || '—'} />}
                    <Row label="Sorumlu" value={d.assigned_user_name || 'Atanmamış'} />
                    <Row label="SMS izni" value={d.allow_sms ? 'Var' : 'Yok'} />
                    <Row label="E-posta izni" value={d.allow_email ? 'Var' : 'Yok'} />
                  </Card>
                  {can(access, 'donors.update') ? (
                    <Btn title="Bilgileri düzenle" variant="outline" onPress={() => router.push({ pathname: '/bagisci/form', params: { id: d.id } })} />
                  ) : null}
                  {can(access, 'donors.delete') ? (
                    <Btn title="Bağışçıyı sil" variant="danger" loading={busy === 'delete'} onPress={() => remove(d.full_name)} />
                  ) : null}
                </>
              ) : null}
              <SmsSheet visible={smsOpen} onClose={() => setSmsOpen(false)} donorId={d.id} phone={d.phone} />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
