import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Radio } from 'lucide-react-native';
import { money } from '@/lib/format';
import { CHANNEL_COLORS, changeText, Inflow } from '@/api/inflow';
import { colors, font, radius, space } from '@/theme';

/** Kanal kanal dağılımı: tek yatay şerit + açıklamalar. */
export function ChannelBar({ data, compact }: { data: Inflow; compact?: boolean }) {
  const total = data.total_cents || 1;
  if (!data.channels.length) return <Text style={styles.muted}>Bu dönemde giriş yok.</Text>;
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.strip}>
        {data.channels.map((c) => (
          <View key={c.key} style={{ flex: c.total_cents / total, backgroundColor: CHANNEL_COLORS[c.key] || colors.faint }} />
        ))}
      </View>
      {data.channels.slice(0, compact ? 4 : 10).map((c) => (
        <View key={c.key} style={styles.legend}>
          <View style={[styles.dot, { backgroundColor: CHANNEL_COLORS[c.key] || colors.faint }]} />
          <Text style={styles.legendLabel} numberOfLines={1}>{c.label}</Text>
          <Text style={styles.muted}>{c.count}</Text>
          <Text style={styles.legendValue}>{money(c.total_cents)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Saatlik / günlük mini grafik. */
export function Sparkline({ series, unit }: { series: number[]; unit: 'hour' | 'day' }) {
  const peak = Math.max(1, ...series);
  const nowIndex = unit === 'hour' ? new Date().getHours() : series.length - 1;
  return (
    <View style={styles.spark} accessibilityLabel="Para girişi grafiği">
      {series.map((v, i) => (
        <View key={i} style={[styles.sparkBar, { height: Math.max(2, (v / peak) * 44), opacity: i > nowIndex ? 0.25 : 1 }]} />
      ))}
    </View>
  );
}

/** Genel bakıştaki canlı "Bugün gelen para" kartı. */
export function InflowCard({ data, onPress, onTransfers }: { data: Inflow; onPress: () => void; onTransfers?: () => void }) {
  const change = changeText(data.total_cents, data.previous_total_cents);
  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Para girişlerini aç" style={{ gap: space.sm }}>
        <View style={styles.head}>
          <Radio size={16} color={colors.primary} />
          <Text style={styles.kicker}>BUGÜN GELEN PARA · CANLI</Text>
          <ChevronRight size={18} color={colors.faint} style={{ marginLeft: 'auto' }} />
        </View>
        <Text style={styles.total}>{money(data.total_cents)}</Text>
        <Text style={styles.muted}>{data.count} giriş{change ? ` · ${change}` : ''}</Text>
        <Sparkline series={data.series} unit={data.series_unit} />
        <ChannelBar data={data} compact />
      </Pressable>
      {data.waiting_transfers.count && onTransfers ? (
        <Pressable onPress={onTransfers} style={styles.alert} accessibilityRole="button">
          <Text style={styles.alertText}>
            {data.waiting_transfers.count} havale eşleşme bekliyor · {money(data.waiting_transfers.total_cents)}
          </Text>
          <ChevronRight size={16} color={colors.warn} />
        </Pressable>
      ) : null}
      {data.failed_payments_today ? (
        <View style={[styles.alert, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.alertText, { color: colors.danger }]}>Bugün {data.failed_payments_today} online ödeme başarısız / incelemede</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primaryLine, padding: space.lg, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { fontSize: font.xs, fontWeight: '800', color: colors.primaryDark, letterSpacing: 0.6 },
  total: { fontSize: 34, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.muted },
  strip: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#E6EBE9' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: font.sm, color: colors.text },
  legendValue: { fontSize: font.sm, fontWeight: '700', color: colors.text, minWidth: 80, textAlign: 'right' },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 48, marginVertical: 4 },
  sparkBar: { flex: 1, backgroundColor: colors.primary, borderRadius: 2 },
  alert: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.warnSoft, borderRadius: radius.md, padding: space.md },
  alertText: { color: colors.warn, fontWeight: '700', fontSize: font.sm, flex: 1 },
});
