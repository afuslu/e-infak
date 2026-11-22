import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, MessageSquare, Phone } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { af, webBase } from '@/lib/api';
import { allowed, can } from '@/lib/access';
import { openPdf } from '@/lib/files';
import { call, dateTime, isDialable, money, whatsapp } from '@/lib/format';
import { recall } from '@/lib/selected';
import { Donation, STATUS } from '@/api/types';
import { Badge, Btn, Card, Field, Notice, QueryView, Row, Screen, Sheet, useUi } from '@/components/ui';
import { SmsSheet } from '@/components/SmsSheet';
import { confirm, notify, notifyError } from '@/components/toast';
import { font, space, useTheme } from '@/theme';

const OFFLINE_SOURCES = ['manual', 'money_box', 'import'];

export default function DonationDetail() {
  const { id, no } = useLocalSearchParams<{ id: string; no?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { access, site } = useAuth();
  const { colors } = useTheme();
  const ui = useUi();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);

  // Ayrı bir ayrıntı uç noktası yok; satır listeden taşınır, yoksa makbuz numarasıyla aranır.
  const query = useQuery({
    queryKey: ['donation', id],
    initialData: recall<Donation>('donation', id),
    queryFn: async () => {
      const page = await af<{ items: Donation[] }>('/donations', { query: { q: no, page_size: 20 } });
      const found = page.items.find((d) => d.id === id);
      if (!found) throw new Error('Bağış bulunamadı.');
      return found;
    },
  });

  const refresh = async () => {
    queryClient.invalidateQueries({ queryKey: ['donations'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['donor'] });
    await query.refetch();
  };

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try {
      await action();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Bağış' }} />
      <QueryView query={query}>
        {(d) => {
          const offline = d.is_manual || OFFLINE_SOURCES.some((s) => (d.source || '').startsWith(s));
          const open = d.status === 'confirmed' || d.status === 'pending';
          const canCancel = offline && open && can(access, 'receipts.cancel');
          const canMarkPaid = offline && d.status === 'pending' && can(access, 'receipts.mark_paid');
          return (
            <>
              <Card style={{ alignItems: 'center', gap: space.sm }}>
                <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text }}>{money(d.amount_cents, d.currency)}</Text>
                <Badge label={STATUS[d.status]?.label || d.status} tone={STATUS[d.status]?.tone} />
                <Text style={ui.muted}>{d.campaign_title}</Text>
              </Card>

              <Card>
                <Row label="Bağışçı" value={`${d.donor_name || 'İsimsiz'}${d.is_anonymous ? ' (gizli)' : ''}`}
                  onPress={d.donor_id && allowed(access, 'donor_crm', 'donors') ? () => router.push({ pathname: '/bagisci/[id]', params: { id: d.donor_id! } }) : undefined} />
                <Row label="Telefon" value={d.donor_phone || '—'} />
                {d.on_behalf_of ? <Row label="Adına" value={d.on_behalf_of} /> : null}
                <Row label="Tarih" value={dateTime(d.paid_at)} />
                <Row label="Ödeme" value={d.payment_method_label || '—'} />
                <Row label="Makbuz no" value={d.receipt_number} />
                {d.official_receipt_no ? <Row label="Koçan no" value={String(d.official_receipt_no)} /> : null}
                <Row label="Kaynak" value={d.is_manual ? 'Elle makbuz' : d.source || 'Online'} />
                {d.issued_by_name ? <Row label="Kesen" value={d.issued_by_name} /> : null}
                {d.donor_message ? <Row label="Not" value={d.donor_message} /> : null}
              </Card>

              <View style={ui.wrapGap}>
                <Btn title="Makbuz PDF" variant="outline" small icon={<FileText size={16} color={colors.primaryDark} />} loading={busy === 'pdf'}
                  onPress={() => run('pdf', () => openPdf(`/admin-features/donations/${d.id}/receipt.pdf`, `makbuz-${d.receipt_number}.pdf`))} />
                {allowed(access, 'sms', 'sms') && can(access, 'sms.send') && d.donor_phone ? (
                  <Btn title="SMS" variant="outline" small icon={<MessageSquare size={16} color={colors.primaryDark} />} onPress={() => setSmsOpen(true)} />
                ) : null}
                {isDialable(d.donor_phone) ? (
                  <>
                    <Btn title="Ara" variant="outline" small icon={<Phone size={16} color={colors.primaryDark} />} onPress={() => call(d.donor_phone!)} />
                    <Btn
                      title="WhatsApp Makbuz"
                      variant="outline"
                      small
                      onPress={() => {
                        const verifyUrl = `${webBase()}/verify?no=${encodeURIComponent(d.receipt_number)}`;
                        const msg = [
                          `Sayın ${d.donor_name || 'Bağışçımız'},`,
                          `${site?.name || 'Kurumumuz'} adına yaptığınız ${money(d.amount_cents, d.currency)} tutarındaki ${d.campaign_title || 'bağış'} kaydınız alınmıştır.`,
                          `Makbuz No: ${d.receipt_number}`,
                          `Tarih: ${dateTime(d.paid_at)}`,
                          `Doğrulama: ${verifyUrl}`,
                          `Allah kabul etsin.`,
                        ].join('\n');
                        whatsapp(d.donor_phone!, msg);
                      }}
                    />
                  </>
                ) : null}
              </View>

              {canMarkPaid ? (
                <Btn title="Ödendi olarak işaretle" loading={busy === 'paid'} onPress={async () => {
                  if (!(await confirm('Makbuz ödendi olarak işaretlensin mi?', 'Makbuzun tüm satırları onaylanır.'))) return;
                  run('paid', async () => {
                    await af(`/donations/${d.id}/mark-paid`, { method: 'POST' });
                    notify('Makbuz ödendi olarak işaretlendi.');
                    await refresh();
                  });
                }} />
              ) : null}
              {canCancel ? <Btn title="Makbuzu iptal et" variant="danger" onPress={() => setCancelOpen(true)} /> : null}
              {!offline && open ? <Notice text="Online ödemelerin iadesi web panelindeki ödeme ekranından yapılır." /> : null}

              <Sheet visible={cancelOpen} onClose={() => setCancelOpen(false)} title="Makbuzu iptal et"
                footer={(
                  <Btn title="İptal et" variant="danger" loading={busy === 'cancel'} onPress={() => {
                    if (reason.trim().length < 3) return notify('İptal gerekçesini yazın (en az 3 karakter).', 'error');
                    run('cancel', async () => {
                      await af(`/donations/${d.id}/cancel`, { method: 'POST', body: { reason: reason.trim() } });
                      setCancelOpen(false);
                      setReason('');
                      notify('Makbuz iptal edildi.');
                      await refresh();
                    });
                  }} />
                )}>
                <Text style={{ fontSize: font.md, color: colors.text }}>{d.receipt_number} numaralı makbuz iptal edilecek. Bu işlem geri alınamaz.</Text>
                <Field label="İptal gerekçesi" value={reason} onChangeText={setReason} multiline maxLength={500} />
              </Sheet>
              <SmsSheet visible={smsOpen} onClose={() => setSmsOpen(false)} donorId={d.donor_id} donationId={d.id} phone={d.donor_phone} />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
