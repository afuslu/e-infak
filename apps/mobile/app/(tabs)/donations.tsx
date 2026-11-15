import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Share2 } from 'lucide-react-native'
import { useAuth } from '../../src/context/AuthContext'
import { apiFetch, formatMoney } from '../../src/lib/api'
import { CARD_SHADOW, COLORS } from '../../src/theme'

interface DonationRow {
  id: string
  receipt_number: string
  amount_cents: number
  currency: string
  status: string
  created_at: string
}

export default function DonationsScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const [rows, setRows] = useState<DonationRow[]>([])
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending'>('all')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await apiFetch<DonationRow[]>('/donations')
      setRows(res || [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => r.status.toLowerCase() === filter)
  }, [rows, filter])

  const confirmedTotal = useMemo(
    () =>
      rows
        .filter((r) => r.status.toLowerCase() === 'confirmed')
        .reduce((sum, r) => sum + (r.amount_cents || 0), 0),
    [rows],
  )

  const shareReceipt = async (item: DonationRow) => {
    await Share.share({
      message: `e-İnfak Bağış Makbuzu\nMakbuz No: ${item.receipt_number}\nTutar: ${formatMoney(item.amount_cents, item.currency)}\nTarih: ${new Date(item.created_at).toLocaleDateString('tr-TR')}`,
    })
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.promptTitle}>Bağış Geçmişiniz</Text>
        <Text style={styles.promptSub}>
          Geçmiş bağışlarınızı, makbuzlarınızı ve düzenli bağış özetinizi görmek için giriş yapın.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push('/login')}>
          <Text style={styles.btnText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    )
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.container}
      data={filtered}
      keyExtractor={(r) => r.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true)
            load()
          }}
        />
      }
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryLabel}>Onaylı Bağışlarım Toplamı</Text>
              <Text style={styles.summaryValue}>{formatMoney(confirmedTotal)}</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{rows.length} işlem</Text>
            </View>
          </View>

          <View style={styles.filterRow}>
            {([
              ['all', 'Tümü'],
              ['confirmed', 'Onaylı'],
              ['pending', 'Bekleyen'],
            ] as const).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                onPress={() => setFilter(key)}
                style={[styles.filterPill, filter === key && styles.filterPillActive]}
              >
                <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>Bu filtreye uygun bağış kaydı bulunmuyor.</Text>
      }
      renderItem={({ item }) => {
        const isConfirmed = item.status.toLowerCase() === 'confirmed'
        return (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.receipt}>{item.receipt_number}</Text>
              <Text style={styles.amount}>{formatMoney(item.amount_cents, item.currency)}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>
                {new Date(item.created_at).toLocaleDateString('tr-TR')}
              </Text>
              <View style={styles.rightActions}>
                <View style={[styles.statusBadge, isConfirmed ? styles.okBadge : styles.waitBadge]}>
                  <Text style={[styles.statusText, isConfirmed ? styles.okText : styles.waitText]}>
                    {isConfirmed ? 'ONAYLI' : item.status.toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => shareReceipt(item)} style={styles.shareBtn}>
                  <Share2 color={COLORS.textSubtle} size={15} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 16, gap: 10 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.bg,
    gap: 10,
  },
  headerWrap: { gap: 10, marginBottom: 4 },
  summaryCard: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: '#065f46' },
  summaryValue: { fontSize: 22, fontWeight: '800', color: COLORS.primary, marginTop: 2 },
  countBadge: {
    backgroundColor: '#ffffff',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: '#065f46' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  filterPillActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  filterText: { fontSize: 12, fontWeight: '600', color: COLORS.textSubtle },
  filterTextActive: { color: '#ffffff' },
  promptTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  promptSub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  btn: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  btnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    ...CARD_SHADOW,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  receipt: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  amount: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  meta: { fontSize: 12, color: COLORS.textMuted },
  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  okBadge: { backgroundColor: COLORS.primarySoft },
  waitBadge: { backgroundColor: COLORS.warningSoft },
  statusText: { fontSize: 10, fontWeight: '800' },
  okText: { color: COLORS.primary },
  waitText: { color: COLORS.warning },
  shareBtn: { padding: 4 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 32 },
})
