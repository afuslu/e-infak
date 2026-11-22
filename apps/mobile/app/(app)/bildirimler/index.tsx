import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Banknote, BellOff, CreditCard, Landmark, Moon, PiggyBank, Settings, Undo2 } from 'lucide-react-native';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { usePaged } from '@/lib/paged';
import { openNotificationTarget } from '@/lib/notificationRoute';
import { StaffNotification } from '@/api/inflow';
import { Btn, Chips, Empty, ErrorView, Loading, useUi } from '@/components/ui';
import { notifyError } from '@/components/toast';
import { font, radius, space, useTheme } from '@/theme';

const FILTERS = [
  { value: 'all', label: 'Tümü' },
  { value: 'money', label: 'Para girişleri' },
  { value: 'transfer_waiting', label: 'Bekleyen havale' },
  { value: 'problems', label: 'Sorunlar' },
  { value: 'digest', label: 'Gün sonu' },
];
const KINDS: Record<string, string | undefined> = {
  all: undefined, money: 'donation,online', transfer_waiting: 'transfer_waiting', problems: 'payment_failed,refund', digest: 'digest',
};

function Icon({ n }: { n: StaffNotification }) {
  const { colors } = useTheme();
  const size = 20;
  if (n.kind === 'payment_failed') return <AlertTriangle size={size} color={colors.danger} />;
  if (n.kind === 'refund') return <Undo2 size={size} color={colors.danger} />;
  if (n.kind === 'digest') return <Moon size={size} color={colors.primaryDark} />;
  if (n.kind === 'transfer_waiting' || n.channel === 'transfer' || n.channel === 'online_transfer') return <Landmark size={size} color="#7C3AED" />;
  if (n.channel === 'online' || n.channel === 'pos') return <CreditCard size={size} color="#2563EB" />;
  if (n.channel === 'money_box') return <PiggyBank size={size} color="#D97706" />;
  return <Banknote size={size} color={colors.primary} />;
}

export default function Inbox() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, dark } = useTheme();
  const ui = useUi();
  const [filter, setFilter] = useState('all');
  const list = usePaged<StaffNotification>(['notifications', filter], '/mobile/notifications', { kind: KINDS[filter] }, 30);
  const unread: number = list.first?.unread ?? 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['inflow'] });
  };

  const open = async (n: StaffNotification) => {
    if (!n.read) {
      api('/mobile/notifications/read', { method: 'POST', body: { ids: [n.id] } }).then(refresh).catch(() => {});
    }
    openNotificationTarget(router, n.data);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{
        title: 'Bildirimler',
        headerRight: () => (
          <Pressable onPress={() => router.push('/ayarlar/bildirimler')} hitSlop={10} accessibilityLabel="Bildirim ayarları" style={{ paddingHorizontal: 8 }}>
            <Settings size={22} color={colors.primaryDark} />
          </Pressable>
        ),
      }} />
      <FlatList
        data={list.items}
        keyExtractor={(n) => n.id}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => list.refetch()}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        ListHeaderComponent={(
          <View style={{ gap: space.md, padding: space.lg, paddingBottom: space.sm }}>
            <Chips options={FILTERS} value={filter} onChange={setFilter} />
            {unread ? (
              <View style={[ui.rowGap, { justifyContent: 'space-between' }]}>
                <Text style={ui.muted}>{unread} okunmamış</Text>
                <Btn title="Tümünü okundu say" variant="ghost" small onPress={() =>
                  api('/mobile/notifications/read', { method: 'POST', body: { all: true } }).then(refresh).catch(notifyError)} />
              </View>
            ) : null}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={ui.separator} />}
        ListEmptyComponent={list.isLoading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={() => list.refetch()} /> : (
          <Empty title="Bildirim yok" text="Bağış, havale ve sanal POS girişleri burada anında görünür."
            action={<BellOff size={28} color={colors.faint} />} />
        )}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ padding: space.lg }} /> : null}
        contentContainerStyle={{ paddingBottom: space.xl }}
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item)} accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: item.read ? colors.card : (dark ? 'rgba(16, 185, 129, 0.12)' : '#F2FBF7') },
              pressed && { opacity: 0.7 },
            ]}>
            <View style={[styles.icon, { backgroundColor: dark ? '#334155' : '#F1F5F3' }]}><Icon n={item} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, { color: colors.text }, !item.read && { fontWeight: '800' }]}>{item.title}</Text>
              <Text style={[styles.body, { color: colors.muted }]}>{item.body}</Text>
              <Text style={[styles.time, { color: colors.faint }]}>{dateTime(item.created_at)}</Text>
            </View>
            {!item.read ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  icon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: font.md, fontWeight: '600' },
  body: { fontSize: font.sm, lineHeight: 19 },
  time: { fontSize: font.xs },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
