import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pf } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Badge, Btn, Card, Chips, Field, QueryView, Screen, SectionTitle, useUi } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { font, space, useTheme } from '@/theme';

type TicketDetail = {
  id: string;
  organization_id: string;
  organization_name: string;
  subject: string;
  category: string;
  priority: string;
  status: 'open' | 'answered' | 'closed';
  created_at: string;
  messages: { id: string; sender_type: string; sender_name: string; body: string; created_at: string }[];
};

export default function PlatformTicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const ui = useUi();
  const [reply, setReply] = useState('');

  const query = useQuery({
    queryKey: ['platform', 'ticket', id],
    queryFn: () => pf<TicketDetail>(`/tickets/${id}`),
    enabled: !!id,
  });

  const sendReply = useMutation({
    mutationFn: () => pf(`/tickets/${id}/reply`, { method: 'POST', body: { body: reply.trim() } }),
    onSuccess: () => {
      setReply('');
      queryClient.invalidateQueries({ queryKey: ['platform', 'ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'tickets'] });
      notify('Yanıt gönderildi.');
    },
    onError: notifyError,
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => pf(`/tickets/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'tickets'] });
      notify('Talep durumu güncellendi.');
    },
    onError: notifyError,
  });

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Destek Talebi' }} />
      <QueryView query={query}>
        {(t) => (
          <>
            <Card style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={[ui.title, { flex: 1 }]}>{t.subject}</Text>
                <Badge
                  label={t.status === 'open' ? 'Açık' : t.status === 'answered' ? 'Yanıtlandı' : 'Kapalı'}
                  tone={t.status === 'open' ? 'warn' : t.status === 'answered' ? 'info' : 'muted'}
                />
              </View>
              <Text style={ui.muted}>{t.organization_name} · {t.category} · {dateTime(t.created_at)}</Text>
              <Chips
                options={[
                  { value: 'open', label: 'Açık' },
                  { value: 'answered', label: 'Yanıtlandı' },
                  { value: 'closed', label: 'Kapalı' },
                ]}
                value={t.status}
                onChange={(s) => { if (s !== t.status) setStatus.mutate(s); }}
              />
            </Card>

            <SectionTitle>Mesajlar</SectionTitle>
            <View style={{ gap: space.sm }}>
              {t.messages.map((m) => (
                <Card
                  key={m.id}
                  style={{
                    gap: 4,
                    borderColor: m.sender_type === 'platform' ? colors.primaryLine : colors.line,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: font.sm, fontWeight: '700', color: m.sender_type === 'platform' ? colors.primaryDark : colors.text }}>
                      {m.sender_name} {m.sender_type === 'platform' ? '(Platform)' : '(Kurum)'}
                    </Text>
                    <Text style={{ fontSize: font.xs, color: colors.muted }}>{dateTime(m.created_at)}</Text>
                  </View>
                  <Text style={{ fontSize: font.md, color: colors.text, lineHeight: 20 }}>{m.body}</Text>
                </Card>
              ))}
            </View>

            <SectionTitle>Yanıt Yaz</SectionTitle>
            <Card style={{ gap: space.sm }}>
              <Field
                value={reply}
                onChangeText={setReply}
                multiline
                placeholder="Kuruma yanıtınızı yazın..."
              />
              <Btn
                title="Yanıtı Gönder"
                disabled={!reply.trim()}
                loading={sendReply.isPending}
                onPress={() => sendReply.mutate()}
              />
            </Card>
          </>
        )}
      </QueryView>
    </Screen>
  );
}
