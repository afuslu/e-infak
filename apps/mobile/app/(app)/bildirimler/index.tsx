import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, BellOff, CalendarCheck, CreditCard, Landmark, Moon,
  PhoneCall, PiggyBank, Repeat, Settings, ShieldAlert, Trophy, Undo2,
} from 'lucide-react-native';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { usePaged } from '@/lib/paged';
import { syncBadgeCount } from '@/lib/notifications';
import { openNotificationTarget } from '@/lib/notificationRoute';
import { StaffNotification } from '@/api/inflow';
import { Btn, Chips, Empty, ErrorView, Loading, useUi } from '@/components/ui';
import { notifyError } from '@/components/toast';
import { font, radius, space, useTheme } from '@/theme';

const FILTERS = [
  { value: 'all', label: 'Tümü' },
  { value: 'money', label: 'Para girişleri' },
  { value: 'transfer_waiting', label: 'Bekleyen havale' },
  { value: 'ops', label: 'Operasyon & Görev' },
  { value: 'problems', label: 'Sorunlar & Uyarı' },
  { value: 'digest', label: 'Özetler' },
];
const KINDS: Record<string, string | undefined> = {
  all: undefined,
  money: 'donation,online',
  transfer_waiting: 'transfer_waiting',
  ops: 'task,donor_reminder,money_box_due,campaign_milestone',
  problems: 'payment_failed,recurring_failed,refund,system_alert',
  digest: 'digest,weekly_digest',
};

function Icon({ n }: { n: StaffNotification }) {
  const { colors } = useTheme();
  const size = 20;
  if (n.kind === 'payment_failed') return <AlertTriangle size={size} color={colors.danger} />;
  if (n.kind === 'recurring_failed') return <Repeat size={size} color={colors.danger} />;
  if (n.kind === 'refund') return <Undo2 size={size} color={colors.danger} />;
  if (n.kind === 'system_alert') return <ShieldAlert size={size} color="#EA580C" />;
  if (n.kind === 'digest' || n.kind === 'weekly_digest') return <Moon size={size} color={colors.primaryDark} />;
  if (n.kind === 'task') return <CalendarCheck size={size} color="#0D9488" />;
  if (n.kind === 'donor_reminder') return <PhoneCall size={size} color="#0284C7" />;
  if (n.kind === 'campaign_milestone') return <Trophy size={size} color="#059669" />;
  if (n.kind === 'money_box_due' || n.channel === 'money_box') return <PiggyBank size={size} color="#D97706" />;
  if (n.kind === 'transfer_waiting' || n.channel === 'transfer' || n.channel === 'online_transfer') return <Landmark size={size} color="#7C3AED" />;
  if (n.channel === 'online' || n.channel === 'pos') return <CreditCard size={size} color="#2563EB" />;
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

  useEffect(() => {
    if (list.first !== undefined) syncBadgeCount(list.first.unread ?? 0);
  }, [list.first]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['inflow'] });
  };

  const open = async (n: StaffNotification) => {
    if (!n.read) {
      syncBadgeCount(Math.max(0, unread - 1));
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
                <Btn title="Tümünü okundu say" variant="ghost" small onPress={() => {
                  syncBadgeCount(0);
                  api('/mobile/notifications/read', { method: 'POST', body: { all: true } }).then(refresh).catch(notifyError);
                }} />
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
