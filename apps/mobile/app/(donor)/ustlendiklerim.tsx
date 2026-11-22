import React from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { df } from '@/lib/api';
import { date, money } from '@/lib/format';
import { Badge, Card, Empty, QueryView, Row, Screen, SectionTitle, useUi } from '@/components/ui';
import { space } from '@/theme';

type PledgeInstallment = {
  id: string;
  seq: number;
  due_date: string;
  amount_cents: number;
  status: 'pending' | 'overdue' | 'paid' | string;
};

type PledgeItem = {
  id: string;
  kind: string;
  kind_label: string;
  title: string | null;
  status: string;
  beneficiary: {
    first_name: string;
    kind: string;
    country: string | null;
    city: string | null;
    school: string | null;
  } | null;
  installment_amount_cents: number;
  currency: string;
  paid_count: number;
  installment_count: number;
  next_installment: PledgeInstallment | null;
};

type ProjectsPayload = {
  orphan_sponsorships: {
    id: string;
    person_name: string;
    active: boolean;
    start_date: string | null;
    end_date: string | null;
  }[];
  student_sponsorships: {
    id: string;
    person_name: string;
    active: boolean;
    amount_cents: number;
  }[];
};

export default function DonorSponsorshipsScreen() {
  const ui = useUi();

  const pledges = useQuery({
    queryKey: ['donor', 'pledges'],
    queryFn: () => df<PledgeItem[]>('/me/pledges'),
  });

  const projects = useQuery({
    queryKey: ['donor', 'projects'],
    queryFn: () => df<ProjectsPayload>('/me/projects'),
  });

  const orphans = projects.data?.orphan_sponsorships || [];
  const students = projects.data?.student_sponsorships || [];

  return (
    <Screen
      onRefresh={() => { pledges.refetch(); projects.refetch(); }}
      refreshing={pledges.isRefetching || projects.isRefetching}
    >
      <SectionTitle> TAAHHÜT VE SPONSORLUKLARIM</SectionTitle>
      <QueryView query={pledges}>
        {(items) =>
          items.length === 0 && orphans.length === 0 && students.length === 0 ? (
            <Empty
              title="Üstlendiğiniz aktif bir sponsorluk bulunmuyor"
              text="Yetim, hafız veya öğrenci bursu üstlendiğinizde taksit ve gelişim durumlarını buradan takip edebilirsiniz."
            />
          ) : (
            <View style={{ gap: space.sm }}>
              {items.map((p) => (
                <Card key={p.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={ui.text}>{p.title || p.kind_label}</Text>
                    <Badge
                      label={`${p.paid_count} / ${p.installment_count} Taksit`}
                      tone={p.paid_count >= p.installment_count ? 'ok' : 'info'}
                    />
                  </View>
                  <Row label="Tür" value={p.kind_label} />
                  {p.beneficiary ? (
                    <Row
                      label="Desteklenen"
                      value={[p.beneficiary.first_name, p.beneficiary.country, p.beneficiary.city].filter(Boolean).join(' · ')}
                    />
                  ) : null}
                  <Row label="Aylık Tutar" value={money(p.installment_amount_cents, p.currency)} />
                  {p.next_installment ? (
                    <Row
                      label="Sıradaki Taksit"
                      value={`${date(p.next_installment.due_date)} · ${money(p.next_installment.amount_cents, p.currency)}`}
                    />
                  ) : null}
                </Card>
              ))}
            </View>
          )
        }
      </QueryView>

      {orphans.length > 0 ? (
        <>
          <SectionTitle>YETİM SPONSORLUKLARIM</SectionTitle>
          {orphans.map((o) => (
            <Card key={o.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={ui.text}>{o.person_name}</Text>
                <Badge label={o.active ? 'Aktif' : 'Tamamlandı'} tone={o.active ? 'ok' : 'muted'} />
              </View>
              {o.start_date ? <Row label="Başlangıç" value={date(o.start_date)} /> : null}
            </Card>
          ))}
        </>
      ) : null}

      {students.length > 0 ? (
        <>
          <SectionTitle>ÖĞRENCİ BURSLARIM</SectionTitle>
          {students.map((s) => (
            <Card key={s.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={ui.text}>{s.person_name}</Text>
                <Badge label={s.active ? 'Aktif' : 'Pasif'} tone={s.active ? 'ok' : 'muted'} />
              </View>
              <Row label="Burs Tutarı" value={money(s.amount_cents)} />
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
