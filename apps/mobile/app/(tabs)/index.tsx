import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Calculator, HeartHandshake, Search, Sparkles } from 'lucide-react-native'
import { useAuth } from '../../src/context/AuthContext'
import { apiFetch, formatMoney } from '../../src/lib/api'
import { CARD_SHADOW, COLORS } from '../../src/theme'

interface CampaignItem {
  id: string
  title: string
  slug: string
  short_description?: string | null
  category?: string
  target_cents?: number | null
  collected_cents?: number
  currency?: string
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'genel', label: 'Genel' },
  { key: 'egitim', label: 'Eğitim' },
  { key: 'gida', label: 'Gıda' },
  { key: 'su', label: 'Su' },
  { key: 'yetim', label: 'Yetim' },
  { key: 'kurban', label: 'Kurban' },
  { key: 'zekat', label: 'Zekât' },
  { key: 'sadaka', label: 'Sadaka' },
  { key: 'saglik', label: 'Sağlık' },
]

const QUICK_AMOUNTS = [100, 250, 500, 1000]

export default function CampaignsScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const [items, setItems] = useState<CampaignItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  const load = useCallback(async () => {
    try {
      setError('')
      const res = await apiFetch<{ items?: CampaignItem[] } | CampaignItem[]>(
        '/campaigns?status=active&limit=50',
        { auth: false },
      )
      setItems(Array.isArray(res) ? res : res.items || [])
    } catch (err: any) {
      setError(err?.message || 'Kampanyalar yüklenemedi')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (category !== 'all' && (item.category || '').toLowerCase() !== category) {
        return false
      }
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        (item.short_description || '').toLowerCase().includes(q)
      )
    })
  }, [items, search, category])

  const openDonate = (item: CampaignItem, amount?: number) => {
    router.push({
      pathname: '/donate/[slug]',
      params: {
        slug: item.slug,
        title: item.title,
        ...(amount ? { amount: String(amount) } : {}),
      },
    })
  }

  if (loading) {
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
      keyExtractor={(item) => item.id}
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
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <Sparkles color="#a7f3d0" size={16} />
              <Text style={styles.heroTag}>e-İnfak İyilik Platformu</Text>
            </View>
            <Text style={styles.heroTitle}>
              {user ? `Hoş Geldiniz, ${user.first_name}` : 'Bir İyilikle Dünyayı Değiştirin'}
            </Text>
            <Text style={styles.heroSub}>
              Güvenli ödeme altyapısı ile bağışlarınız doğrudan ihtiyaç sahiplerine ulaşır.
            </Text>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={styles.heroPill}
                onPress={() => router.push('/(tabs)/zakat')}
              >
                <Calculator color="#065f46" size={14} />
                <Text style={styles.heroPillText}>Zekât Hesapla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.heroPill}
                onPress={() => router.push('/(tabs)/donations')}
              >
                <HeartHandshake color="#065f46" size={14} />
                <Text style={styles.heroPillText}>Bağışlarım</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.searchBox}>
            <Search color={COLORS.textMuted} size={16} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Kampanya ara..."
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {CATEGORIES.map((c) => {
              const active = category === c.key
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.emptyText}>Aramanıza uygun aktif kampanya bulunamadı.</Text>
      }
      renderItem={({ item }) => {
        const target = item.target_cents || 0
        const collected = item.collected_cents || 0
        const pct = target > 0 ? Math.min(100, Math.round((collected * 100) / target)) : null
        return (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {item.category ? (
                <View style={styles.catBadge}>
                  <Text style={styles.catBadgeText}>{item.category.toUpperCase()}</Text>
                </View>
              ) : null}
              {pct !== null && <Text style={styles.pct}>%{pct} tamamlandı</Text>}
            </View>

            <Text style={styles.title}>{item.title}</Text>
            {item.short_description ? (
              <Text style={styles.desc} numberOfLines={2}>
                {item.short_description}
              </Text>
            ) : null}

            {pct !== null && (
              <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressBar, { width: `${pct}%` }]} />
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.meta}>
                    Toplanan: {formatMoney(collected, item.currency || 'TRY')}
                  </Text>
                  <Text style={styles.meta}>
                    Hedef: {formatMoney(target, item.currency || 'TRY')}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={styles.quickBtn}
                  onPress={() => openDonate(item, amt)}
                >
                  <Text style={styles.quickBtnText}>{amt} ₺</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.btn} onPress={() => openDonate(item)}>
              <Text style={styles.btnText}>Bağış Yap</Text>
            </TouchableOpacity>
          </View>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 16, gap: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  headerWrap: { gap: 12 },
  hero: {
    backgroundColor: '#065f46',
    borderRadius: 20,
    padding: 18,
    gap: 8,
    ...CARD_SHADOW,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroTag: { color: '#a7f3d0', fontSize: 12, fontWeight: '700' },
  heroTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  heroSub: { color: '#d1fae5', fontSize: 12, lineHeight: 17 },
  heroActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  heroPillText: { color: '#065f46', fontSize: 12, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  chipsRow: { gap: 8, paddingVertical: 2 },
  chip: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSubtle },
  chipTextActive: { color: '#ffffff' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...CARD_SHADOW,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catBadge: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  catBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.primary },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  desc: { fontSize: 13, color: COLORS.textSubtle, lineHeight: 18 },
  progressWrap: { gap: 6 },
  progressTrack: { height: 7, backgroundColor: COLORS.border, borderRadius: 99, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: COLORS.primary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { fontSize: 11, color: COLORS.textMuted },
  pct: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickBtn: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
  },
  quickBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  errorBox: { backgroundColor: COLORS.dangerSoft, padding: 12, borderRadius: 10 },
  errorText: { color: COLORS.danger, fontSize: 13, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: COLORS.textMuted, marginTop: 32 },
})
