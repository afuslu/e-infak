import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pf } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Badge, Btn, Card, Chips, Empty, Field, QueryView, Screen, SectionTitle, SwitchRow, useUi } from '@/components/ui';
import { confirm, notify, notifyError } from '@/components/toast';
import { space } from '@/theme';

type Broadcast = {
  id: string;
  title: string;
  message: string;
  level: 'info' | 'warning' | 'warn' | 'danger';
  maintenance_mode: boolean;
  is_active: boolean;
  created_at: string;
};

export default function PlatformBroadcastsScreen() {
  const queryClient = useQueryClient();
  const ui = useUi();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<'info' | 'warning' | 'danger'>('info');
  const [maintenance, setMaintenance] = useState(false);

  const query = useQuery({
    queryKey: ['platform', 'broadcasts'],
    queryFn: () => pf<Broadcast[]>('/broadcasts'),
  });

  const create = useMutation({
    mutationFn: () =>
      pf('/broadcasts', {
        method: 'POST',
        body: { title: title.trim(), message: message.trim(), level, maintenance_mode: maintenance, is_active: true },
      }),
    onSuccess: () => {
      setTitle('');
      setMessage('');
      setMaintenance(false);
      queryClient.invalidateQueries({ queryKey: ['platform', 'broadcasts'] });
      notify('Duyuru yayınlandı.');
    },
    onError: notifyError,
  });

  const remove = async (b: Broadcast) => {
    if (!(await confirm(`"${b.title}" duyurusu silinsin mi?`, undefined, 'Sil', true))) return;
    try {
      await pf(`/broadcasts/${b.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['platform', 'broadcasts'] });
      notify('Duyuru silindi.');
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{ title: 'Platform Duyuruları' }} />

      <SectionTitle>Yeni Duyuru Yayınla</SectionTitle>
      <Card style={{ gap: space.sm }}>
        <Field label="Başlık" value={title} onChangeText={setTitle} placeholder="Planlı bakım çalışması" />
        <Field label="Mesaj" value={message} onChangeText={setMessage} multiline placeholder="Kurum panellerinde görünecek duyuru metni..." />
        <Chips
          options={[
            { value: 'info', label: 'Bilgi' },
            { value: 'warning', label: 'Uyarı' },
            { value: 'danger', label: 'Kritik' },
          ]}
          value={level}
          onChange={setLevel}
        />
        <SwitchRow label="Bakım modu uyarısı" value={maintenance} onValueChange={setMaintenance} />
        <Btn
          title="Duyuruyu Yayınla"
          disabled={!title.trim() || !message.trim()}
          loading={create.isPending}
          onPress={() => create.mutate()}
        />
      </Card>

      <SectionTitle>Mevcut Duyurular</SectionTitle>
      <QueryView query={query}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty title="Aktif duyuru yok" />
          ) : (
            <View style={{ gap: space.sm }}>
              {rows.map((b) => (
                <Card key={b.id} style={{ gap: space.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text style={[ui.title, { flex: 1, fontSize: 16 }]}>{b.title}</Text>
                    <Badge
                      label={b.level === 'danger' ? 'Kritik' : b.level === 'warning' || b.level === 'warn' ? 'Uyarı' : 'Bilgi'}
                      tone={b.level === 'danger' ? 'danger' : b.level === 'warning' || b.level === 'warn' ? 'warn' : 'info'}
                    />
                  </View>
                  <Text style={ui.muted}>{b.message}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text style={ui.muted}>{dateTime(b.created_at)}</Text>
                    <Btn title="Sil" variant="danger" small onPress={() => remove(b)} />
                  </View>
                </Card>
              ))}
            </View>
          )
        }
      </QueryView>
    </Screen>
  );
}
