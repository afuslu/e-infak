import React from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Award, FileDown } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { df } from '@/lib/api';
import { openDonorPdf } from '@/lib/files';
import { dateTime, money } from '@/lib/format';
import { Badge, Btn, Card, Empty, QueryView, Screen, SectionTitle, Stat, useUi } from '@/components/ui';
import { notifyError } from '@/components/toast';
import { space, useTheme } from '@/theme';

type DonorDonation = {
  id: string;
  receipt_number: string | null;
  verify_code: string | null;
  amount_lira: number;
  currency: string;
  status: string;
  payment_method: string;
  donor_message: string | null;
  campaign_slug: string | null;
  campaign_title: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }> = {
  confirmed: { label: 'Onaylandı', tone: 'ok' },
  completed: { label: 'Onaylandı', tone: 'ok' },
  pending: { label: 'Bekliyor', tone: 'warn' },
  failed: { label: 'Başarısız', tone: 'danger' },
  cancelled: { label: 'İptal', tone: 'muted' },
};

export default function DonorDonationsScreen() {
  const { donorMe } = useAuth();
  const { colors } = useTheme();
  const ui = useUi();

  const donations = useQuery({
    queryKey: ['donor', 'donations'],
    queryFn: () => df<DonorDonation[]>('/me/donations'),
  });

  const downloadImpactReport = async () => {
    try {
      await openDonorPdf('/impact-report.pdf', 'iyilik-karnem.pdf');
    } catch (e) {
      notifyError(e);
    }
  };

  const downloadCertificate = async (d: DonorDonation) => {
    try {
      await openDonorPdf(`/donations/${d.id}/certificate.pdf`, `sertifika-${d.receipt_number || d.id}.pdf`);
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Screen onRefresh={() => donations.refetch()} refreshing={donations.isRefetching}>
      <View style={ui.rowGap}>
        <Stat
          label="Toplam Bağış Tutarı"
          value={money(donorMe?.total_donated_cents || 0)}
          sub={`${donorMe?.total_donations || 0} onaylı bağış`}
        />
      </View>

      <Btn
        title="İyilik Karnemi İndir (PDF)"
        variant="outline"
        icon={<FileDown size={18} color={colors.primaryDark} />}
        onPress={downloadImpactReport}
      />

      <SectionTitle>TÜM BAĞIŞLARIM</SectionTitle>

      <QueryView query={donations}>
        {(items) =>
          items.length === 0 ? (
            <Empty title="Henüz bağış kaydınız bulunmuyor" text="Yaptığınız bağışlar onaylandığında makbuz ve sertifikalarıyla burada listelenir." />
          ) : (
            <View style={{ gap: space.sm }}>
              {items.map((d) => {
                const st = STATUS_LABELS[d.status?.toLowerCase()] || { label: d.status, tone: 'muted' as const };
                const isConfirmed = d.status?.toLowerCase() === 'confirmed' || d.status?.toLowerCase() === 'completed';
                return (
                  <Card key={d.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={ui.text}>{d.campaign_title || 'Genel Bağış'}</Text>
                        <Text style={ui.muted}>
                          {d.receipt_number ? `Makbuz #${d.receipt_number} · ` : ''}
                          {dateTime(d.created_at)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={ui.amount}>{money(Math.round((d.amount_lira || 0) * 100), d.currency)}</Text>
                        <Badge label={st.label} tone={st.tone} />
                      </View>
                    </View>
                    {d.donor_message ? <Text style={ui.muted}>Not: {d.donor_message}</Text> : null}
                    {isConfirmed ? (
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                        <Btn
                          title="Teşekkür Sertifikası (PDF)"
                          variant="outline"
                          small
                          icon={<Award size={16} color={colors.primaryDark} />}
                          onPress={() => downloadCertificate(d)}
                        />
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )
        }
      </QueryView>
    </Screen>
  );
}
