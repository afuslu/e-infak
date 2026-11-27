import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Href, Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { af } from '@/lib/api';
import { REMINDERS_KEY, Reminder, useReminderSummary } from '@/lib/reminders';
import { Chips, Empty, Fab, QueryView, Screen, SearchBar, SectionTitle, useUi } from '@/components/ui';
import { ReminderItem } from '@/components/ReminderItem';
import { useTheme } from '@/theme';

const TABS = [
  { value: 'acik', label: 'Açık' },
  { value: 'tamamlanan', label: 'Tamamlanan' },
] as const;

type Group = { key: string; title: string; danger?: boolean; items: Reminder[] };

/** Web'deki gibi: vakti geçenler, bugün, yarın, daha sonra. */
function groupOpen(items: Reminder[]): Group[] {
  const now = new Date();
  const startTomorrow = new Date(now);
  startTomorrow.setHours(0, 0, 0, 0);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  const startAfter = new Date(startTomorrow);
  startAfter.setDate(startAfter.getDate() + 1);
  const groups: Group[] = [
    { key: 'late', title: 'Vakti geçenler', danger: true, items: [] },
    { key: 'today', title: 'Bugün', items: [] },
    { key: 'tomorrow', title: 'Yarın', items: [] },
    { key: 'later', title: 'Daha sonra', items: [] },
  ];
  for (const r of items) {
    const at = new Date(r.remind_at);
    if (at <= now) groups[0].items.push(r);
    else if (at < startTomorrow) groups[1].items.push(r);
    else if (at < startAfter) groups[2].items.push(r);
    else groups[3].items.push(r);
  }
  return groups.filter((g) => g.items.length);
}

export default function Reminders() {
  const router = useRouter();
  const { colors } = useTheme();
  const ui = useUi();
  const [tab, setTab] = useState<'acik' | 'tamamlanan'>('acik');
  const [q, setQ] = useState('');
  const term = q.trim();
  const query = useQuery({
    queryKey: [...REMINDERS_KEY, 'list', tab, term],
    queryFn: () => af<Reminder[]>('/reminders', { query: { kapsam: tab, q: term || undefined } }),
  });
  const summary = useReminderSummary();
  const groups = useMemo(
    () => (tab === 'acik' ? groupOpen(query.data || []) : [{ key: 'done', title: 'Tamamlananlar', items: query.data || [] }]),
    [tab, query.data],
  );

  const list = (items: Reminder[]) => (
    <View style={ui.listCard}>
      {items.map((r, i) => (
        <View key={r.id}>
          {i ? <View style={ui.separator} /> : null}
          <ReminderItem reminder={r} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Hatırlatıcı' }} />
      <Screen onRefresh={() => { query.refetch(); summary.refetch(); }} refreshing={query.isRefetching} style={{ paddingBottom: 110 }}>
        <Chips options={TABS.map((t) => ({ ...t, label: t.value === 'acik' && summary.data?.vadesi_gelen ? `Açık · ${summary.data.vadesi_gelen} vakti geldi` : t.label }))}
          value={tab} onChange={setTab} />
        <SearchBar value={q} onChangeText={setQ} placeholder="Metin, bağışçı adı veya telefon" />
        <QueryView query={query}>
          {(data) => data.length ? (
            <>
              {groups.map((g) => (
                <View key={g.key} style={{ gap: 8 }}>
                  <SectionTitle right={<Text style={[ui.muted, g.danger ? { color: colors.danger } : null]}>{g.items.length}</Text>}>{g.title}</SectionTitle>
                  {list(g.items)}
                </View>
              ))}
            </>
          ) : (
            <Empty
              title={term ? 'Eşleşen hatırlatma yok' : tab === 'acik' ? 'Açık hatırlatma yok' : 'Tamamlanan hatırlatma yok'}
              text={tab === 'acik' && !term ? 'Vakti gelince telefonunuza bildirim gelir. Metne telefon numarası yazarsanız bağışçıya otomatik bağlanır.' : undefined}
            />
          )}
        </QueryView>
      </Screen>
      <Fab label="Hatırlatma ekle" icon={<Plus size={20} color={colors.white} />} onPress={() => router.push('/hatirlatici/form' as Href)} />
    </View>
  );
}
