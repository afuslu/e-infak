import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus } from 'lucide-react-native';
import { af } from '@/lib/api';
import { date } from '@/lib/format';
import { remember } from '@/lib/selected';
import { PRIORITY, Task, TASK_STATUS } from '@/api/types';
import { Badge, Chips, Empty, Fab, ListItem, QueryView, Screen, useUi } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { useTheme } from '@/theme';

const SCOPES = [
  { value: 'mine', label: 'Bana atanan' },
  { value: 'created', label: 'Oluşturduğum' },
  { value: 'all', label: 'Tümü' },
];
const STATUSES = [
  { value: 'open', label: 'Açık' },
  { value: 'done', label: 'Tamamlanan' },
];

export default function Tasks() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const ui = useUi();
  const [scope, setScope] = useState('mine');
  const [status, setStatus] = useState('open');
  const query = useQuery({
    queryKey: ['tasks', scope, status],
    queryFn: () => af<Task[]>('/tasks', { query: { scope, status: status === 'open' ? undefined : status } }),
  });
  const shown = (query.data || []).filter((t) => (status === 'open' ? t.status === 'todo' || t.status === 'in_progress' : true));

  const complete = async (t: Task) => {
    try {
      await af(`/tasks/${t.id}`, { method: 'PUT', body: { status: 'done' } });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      notify('Görev tamamlandı.');
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Görevler' }} />
      <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching} style={{ paddingBottom: 110 }}>
        <Chips options={SCOPES} value={scope} onChange={setScope} />
        <Chips options={STATUSES} value={status} onChange={setStatus} />
        <QueryView query={query}>
          {() => shown.length ? (
            <View style={ui.listCard}>
              {shown.map((t, i) => (
                <View key={t.id}>
                  {i ? <View style={ui.separator} /> : null}
                  <ListItem
                    title={t.title}
                    subtitle={[t.assigned_to_name, t.donor_name].filter(Boolean).join(' · ') || t.description}
                    meta={[t.due_date ? `Son tarih ${date(t.due_date)}` : null, PRIORITY[t.priority]].filter(Boolean).join(' · ')}
                    right={(
                      <>
                        <Badge label={t.overdue ? 'Gecikti' : TASK_STATUS[t.status]?.label || t.status} tone={t.overdue ? 'danger' : TASK_STATUS[t.status]?.tone} />
                        {t.status === 'todo' || t.status === 'in_progress' ? (
                          <Text onPress={() => complete(t)} accessibilityRole="button" accessibilityLabel={`${t.title} tamamla`}
                            style={{ color: colors.primaryDark, fontWeight: '700', paddingVertical: 4 }}>
                            <Check size={14} color={colors.primaryDark} /> Bitir
                          </Text>
                        ) : null}
                      </>
                    )}
                    onPress={() => {
                      remember('task', t.id, t);
                      router.push({ pathname: '/gorevler/[id]', params: { id: t.id } });
                    }}
                  />
                </View>
              ))}
            </View>
          ) : <Empty title={status === 'open' ? 'Açık görev yok' : 'Tamamlanan görev yok'} />}
        </QueryView>
      </Screen>
      <Fab label="Görev ekle" icon={<Plus size={20} color={colors.white} />} onPress={() => router.push('/gorevler/form')} />
    </View>
  );
}
