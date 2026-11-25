import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pf } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Badge, Btn, Card, Chips, Empty, Field, ListItem, QueryView, Screen, useUi } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';

type Ticket = {
  id: string;
  organization_id: string;
  organization_name: string;
  subject: string;
  category: string;
  priority: string;
  status: 'open' | 'answered' | 'closed';
  updated_at: string;
};

type DemoRequest = {
  id: string;
  name: string;
  organization: string;
  phone: string;
  email: string;
  plan: string;
  message: string | null;
  operator_notes?: string | null;
  status: string;
  created_at: string;
};

const TICKET_STATUS: Record<string, { label: string; tone: 'warn' | 'info' | 'muted' }> = {
  open: { label: 'Açık', tone: 'warn' },
  answered: { label: 'Yanıtlandı', tone: 'info' },
  closed: { label: 'Kapalı', tone: 'muted' },
};

const DEMO_STATUS: Record<string, { label: string; tone: 'warn' | 'info' | 'ok' | 'muted' }> = {
  new: { label: 'Yeni', tone: 'warn' },
  contacted: { label: 'İletişimde', tone: 'info' },
  converted: { label: 'Kurum Açıldı', tone: 'ok' },
  closed: { label: 'Kapalı', tone: 'muted' },
  archived: { label: 'Arşiv', tone: 'muted' },
};

export default function PlatformTicketsAndDemosScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const queryClient = useQueryClient();
  const ui = useUi();
  const [tab, setTab] = useState<'tickets' | 'demos'>(params.tab === 'demos' ? 'demos' : 'tickets');

  useEffect(() => {
    if (params.tab === 'demos' || params.tab === 'tickets') setTab(params.tab);
  }, [params.tab]);
  const [ticketFilter, setTicketFilter] = useState<'all' | 'open' | 'answered' | 'closed'>('all');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const tickets = useQuery({
    queryKey: ['platform', 'tickets', ticketFilter],
    queryFn: () => pf<Ticket[]>('/tickets', { query: ticketFilter === 'all' ? undefined : { status_filter: ticketFilter } }),
    enabled: tab === 'tickets',
  });

  const demos = useQuery({
    queryKey: ['platform', 'demo-requests'],
    queryFn: () => pf<DemoRequest[]>('/demo-requests'),
    enabled: tab === 'demos',
  });

  const updateDemo = useMutation({
    mutationFn: ({ id, status, operator_notes }: { id: string; status?: string; operator_notes?: string }) =>
      pf(`/demo-requests/${id}`, { method: 'PATCH', body: { status, operator_notes } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'demo-requests'] });
      notify('Demo talebi güncellendi.');
    },
    onError: notifyError,
  });

  const deleteDemo = async (d: DemoRequest) => {
    if (!(await confirm(`${d.organization} demo kaydı silinsin mi?`, undefined, 'Sil', true))) return;
    try {
      await pf(`/demo-requests/${d.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['platform', 'demo-requests'] });
      notify('Demo kaydı silindi.');
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Screen
      onRefresh={() => (tab === 'tickets' ? tickets.refetch() : demos.refetch())}
      refreshing={tab === 'tickets' ? tickets.isRefetching : demos.isRefetching}
    >
      <Chips
        options={[
          { value: 'tickets', label: 'Destek Talepleri' },
          { value: 'demos', label: 'Demo Kayıtları' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'tickets' ? (
        <>
          <Chips
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'open', label: 'Açık' },
              { value: 'answered', label: 'Yanıtlandı' },
              { value: 'closed', label: 'Kapalı' },
            ]}
            value={ticketFilter}
            onChange={setTicketFilter}
          />
          <QueryView query={tickets}>
            {(rows) =>
              rows.length === 0 ? (
                <Empty title="Destek talebi yok" />
              ) : (
                <View style={ui.listCard}>
                  {rows.map((t, idx) => {
                    const meta = TICKET_STATUS[t.status] || { label: t.status, tone: 'muted' as const };
                    return (
                      <View key={t.id}>
                        {idx > 0 ? <View style={ui.separator} /> : null}
                        <ListItem
                          title={t.subject}
                          subtitle={t.organization_name}
                          meta={`${t.category} · ${dateTime(t.updated_at)}`}
                          right={<Badge label={meta.label} tone={meta.tone} />}
                          chevron
                          onPress={() => router.push(`/talep/${t.id}` as Href)}
                        />
                      </View>
                    );
                  })}
                </View>
              )
            }
          </QueryView>
        </>
      ) : (
        <QueryView query={demos}>
          {(rows) =>
            rows.length === 0 ? (
              <Empty title="Demo talebi yok" />
            ) : (
              <View style={{ gap: 10 }}>
                {rows.map((d) => {
                  const meta = DEMO_STATUS[d.status] || { label: d.status, tone: 'muted' as const };
                  return (
                    <Card key={d.id} style={{ gap: 8 }}>
                      <ListItem
                        title={d.organization}
                        subtitle={`${d.name} · ${d.phone}`}
                        meta={`${d.email} · ${d.plan} · ${dateTime(d.created_at)}`}
                        right={<Badge label={meta.label} tone={meta.tone} />}
                      />
                      <Field
                        value={noteDrafts[d.id] ?? (d.operator_notes || '')}
                        onChangeText={(v) => setNoteDrafts((p) => ({ ...p, [d.id]: v }))}
                        placeholder="Operatör notu..."
                      />
                      <View style={ui.rowGap}>
                        <Btn
                          title="Notu Kaydet"
                          variant="outline"
                          small
                          onPress={() => updateDemo.mutate({ id: d.id, operator_notes: noteDrafts[d.id] ?? (d.operator_notes || '') })}
                        />
                        {d.status === 'new' ? (
                          <Btn
                            title="İletişime Geçildi"
                            variant="outline"
                            small
                            style={{ flex: 1 }}
                            loading={updateDemo.isPending}
                            onPress={() => updateDemo.mutate({ id: d.id, status: 'contacted' })}
                          />
                        ) : null}
                        <Btn title="Sil" variant="danger" small onPress={() => deleteDemo(d)} />
                      </View>
                    </Card>
                  );
                })}
              </View>
            )
          }
        </QueryView>
      )}
    </Screen>
  );
}
