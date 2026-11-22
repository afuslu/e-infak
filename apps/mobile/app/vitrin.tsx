import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Heart,
  Home,
  LayoutGrid,
  Menu,
  Phone,
  ShoppingBag,
  User,
} from 'lucide-react-native';
import { ACTIVE_TENANT, tenantBaseUrl } from '@/config/tenant';
import { api } from '@/lib/api';
import { money, openUrl } from '@/lib/format';
import { font, radius, space } from '@/theme';

type PublicSite = {
  slug: string;
  name: string;
  tagline?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  logo_url?: string | null;
  contact?: { phone?: string | null; whatsapp?: string | null; address?: string | null };
};

type PublicCampaign = {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  cover_image_url?: string | null;
  suggested_amounts_cents?: number[];
  target_cents?: number;
  collected_cents?: number;
  currency?: string;
  tags?: string[];
};

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Tümü',
  kurban: 'Kurban',
  su: 'Su Kuyusu',
  gida: 'Gıda / Gazze',
  egitim: 'Eğitim',
  zekat: 'Zekat',
  sadaka: 'Sadaka',
  insaat: 'İnşaat',
  genel: 'Genel',
};

export default function TenantShowcaseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedCat, setSelectedCat] = useState<string>('all');

  const brand = ACTIVE_TENANT;
  const baseUrl = tenantBaseUrl();
  const green = brand?.primaryColor || '#00533C';
  const gold = brand?.accentColor || '#C8922B';

  const siteQuery = useQuery({
    queryKey: ['public', 'site', brand?.slug],
    queryFn: () => api<PublicSite>('/public/site', { auth: false }),
  });

  const campaignsQuery = useQuery({
    queryKey: ['public', 'campaigns', brand?.slug],
    queryFn: () => api<PublicCampaign[]>('/campaigns', { auth: false, query: { status: 'active', limit: 60 } }),
  });

  const site = siteQuery.data;
  const campaigns = useMemo(() => (Array.isArray(campaignsQuery.data) ? campaignsQuery.data : []), [campaignsQuery.data]);

  const categories = useMemo(() => {
    const found = new Set<string>();
    campaigns.forEach((c) => {
      if (c.category) found.add(c.category.toLowerCase());
    });
    return ['all', ...Array.from(found)];
  }, [campaigns]);

  const filtered = useMemo(() => {
    if (selectedCat === 'all') return campaigns;
    return campaigns.filter((c) => (c.category || '').toLowerCase() === selectedCat);
  }, [campaigns, selectedCat]);

  const resolveImg = (url?: string | null) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const logoUri = resolveImg(site?.logo_url);

  return (
    <View style={[styles.root, { backgroundColor: '#F6F8F7' }]}>
      {/* Üst Kurumsal Bar (İDDEF Tarzı) */}
      <View style={[styles.header, { backgroundColor: green, paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => openUrl(baseUrl)}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Web sitesi"
        >
          <Menu size={26} color="#FFFFFF" />
        </Pressable>

        <View style={styles.brandCenter}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logoImg} resizeMode="contain" />
          ) : (
            <Text style={styles.brandTitle}>{site?.name || brand?.name || 'HAKDER'}</Text>
          )}
        </View>

        <Pressable
          onPress={() => router.push('/login' as Href)}
          style={[styles.profileBtn, { backgroundColor: 'rgba(0,0,0,0.22)' }]}
          accessibilityRole="button"
          accessibilityLabel="Bağışçı veya Yetkili Girişi"
        >
          <User size={24} color="#E8D8A0" />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={siteQuery.isRefetching || campaignsQuery.isRefetching}
            onRefresh={() => {
              siteQuery.refetch();
              campaignsQuery.refetch();
            }}
            tintColor={green}
          />
        }
      >
        {/* Hero Karşılama Kartı */}
        <View style={[styles.hero, { backgroundColor: green }]}>
          <Text style={styles.heroKicker}>{(brand?.fullName || site?.name || 'HAKDER').toLocaleUpperCase('tr-TR')}</Text>
          <Text style={styles.heroTitle}>{site?.tagline || brand?.tagline || 'Bir Kapı Aç, Bir Hayat Değiştir'}</Text>
          <Text style={styles.heroSub}>
            Kurban, su kuyusu, Gazze, eğitim ve acil yardım bağışlarınızı güvenle ihtiyaç sahiplerine ulaştırıyoruz.
          </Text>
          <View style={styles.heroActions}>
            <Pressable
              onPress={() => openUrl(`${baseUrl}/bagis`)}
              style={[styles.heroPrimaryBtn, { backgroundColor: gold }]}
              accessibilityRole="button"
            >
              <Heart size={18} color="#FFFFFF" />
              <Text style={styles.heroPrimaryText}>Hızlı Bağış Yap</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/login' as Href)}
              style={styles.heroSecondaryBtn}
              accessibilityRole="button"
            >
              <User size={17} color="#FFFFFF" />
              <Text style={styles.heroSecondaryText}>Hesabım / Giriş</Text>
            </Pressable>
          </View>
        </View>

        {/* Kategori Filtreleri */}
        {categories.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catRow}
          >
            {categories.map((cat) => {
              const active = selectedCat === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCat(cat)}
                  style={[
                    styles.catChip,
                    active
                      ? { backgroundColor: green, borderColor: green }
                      : { backgroundColor: '#FFFFFF', borderColor: '#DCE4E0' },
                  ]}
                >
                  <Text style={[styles.catText, { color: active ? '#FFFFFF' : '#334155' }]}>
                    {CATEGORY_LABELS[cat] || cat.toLocaleUpperCase('tr-TR')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Kampanya Kartları */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>BAĞIŞ KAMPANYALARI</Text>

          {campaignsQuery.isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={green} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Bu kategoride aktif kampanya bulunamadı.</Text>
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              {filtered.map((c) => {
                const img = resolveImg(c.cover_image_url);
                const firstAmount = c.suggested_amounts_cents?.[0];
                const pct = c.target_cents && c.target_cents > 0
                  ? Math.min(100, Math.round(((c.collected_cents || 0) * 100) / c.target_cents))
                  : null;
                return (
                  <View key={c.id} style={styles.campCard}>
                    {img ? <Image source={{ uri: img }} style={styles.campImg} resizeMode="cover" /> : null}
                    <View style={styles.campBody}>
                      <Text style={styles.campTitle}>{c.title}</Text>
                      {c.summary ? (
                        <Text style={styles.campSummary} numberOfLines={2}>
                          {c.summary}
                        </Text>
                      ) : null}
                      {pct !== null ? (
                        <View style={styles.progressWrap}>
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: green }]} />
                          </View>
                          <Text style={styles.progressText}>%{pct}</Text>
                        </View>
                      ) : null}
                      <View style={styles.campFoot}>
                        <Text style={[styles.campPrice, { color: green }]}>
                          {firstAmount ? money(firstAmount, c.currency || 'TRY') : 'Serbest Tutar'}
                        </Text>
                        <Pressable
                          onPress={() => openUrl(`${baseUrl}/kampanyalar/${c.slug}`)}
                          style={[styles.donateBtn, { backgroundColor: green }]}
                        >
                          <Heart size={15} color="#FFFFFF" />
                          <Text style={styles.donateBtnText}>Bağış Yap</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* İletişim / Hesap Numaraları Kısa Bandı */}
        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>{brand?.fullName || site?.name || 'HAKDER'}</Text>
          {site?.contact?.phone ? (
            <Pressable onPress={() => openUrl(`tel:${site.contact?.phone}`)} style={styles.phoneRow}>
              <Phone size={16} color={green} />
              <Text style={[styles.phoneText, { color: green }]}>{site.contact.phone}</Text>
            </Pressable>
          ) : null}
          <View style={styles.footerBtns}>
            <Pressable
              onPress={() => openUrl(`${baseUrl}/hesap-numaralarimiz`)}
              style={[styles.outlineBtn, { borderColor: green }]}
            >
              <Text style={[styles.outlineBtnText, { color: green }]}>IBAN / Hesap Numaraları</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/login' as Href)}
              style={[styles.outlineBtn, { borderColor: '#CBD5E1' }]}
            >
              <Text style={[styles.outlineBtnText, { color: '#334155' }]}>Bağışçı / Yetkili Girişi</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* İDDEF Tarzı Alt 5'li Sabit Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={styles.tabItem} onPress={() => setSelectedCat('all')}>
          <Home size={22} color={green} />
          <Text style={[styles.tabLabel, { color: green, fontWeight: '700' }]}>Anasayfa</Text>
          <View style={[styles.activeDot, { backgroundColor: green }]} />
        </Pressable>

        <Pressable style={styles.tabItem} onPress={() => openUrl(`${baseUrl}/haberler`)}>
          <BookOpen size={22} color="#64748B" />
          <Text style={styles.tabLabel}>Haberler</Text>
        </Pressable>

        <View style={styles.centerTabWrap}>
          <Pressable
            onPress={() => openUrl(`${baseUrl}/bagis`)}
            style={[styles.donateFab, { backgroundColor: green }]}
            accessibilityRole="button"
            accessibilityLabel="Bağış Yap"
          >
            <Heart size={28} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.tabLabel}>Bağış Yap</Text>
        </View>

        <Pressable style={styles.tabItem} onPress={() => openUrl(`${baseUrl}/bagis/sepetim`)}>
          <ShoppingBag size={22} color="#64748B" />
          <Text style={styles.tabLabel}>Bağış Sepeti</Text>
        </Pressable>

        <Pressable style={styles.tabItem} onPress={() => router.push('/login' as Href)}>
          <LayoutGrid size={22} color="#64748B" />
          <Text style={styles.tabLabel}>Hesabım</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: 12,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  brandCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoImg: { height: 42, width: 150, backgroundColor: '#FFFFFF', borderRadius: 10 },
  brandTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  profileBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hero: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: 8,
  },
  heroKicker: { color: '#E8D8A0', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', lineHeight: 30 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 19 },
  heroActions: { flexDirection: 'row', gap: space.sm, marginTop: 10 },
  heroPrimaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  heroSecondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroSecondaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  catRow: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  catText: { fontSize: 13, fontWeight: '700' },
  sectionWrap: { paddingHorizontal: space.lg, gap: space.sm },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 0.8, marginBottom: 4 },
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: space.xl, alignItems: 'center' },
  emptyText: { color: '#64748B', fontSize: 14 },
  campCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  campImg: { width: '100%', height: 170, backgroundColor: '#E2E8F0' },
  campBody: { padding: space.md, gap: 8 },
  campTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  campSummary: { fontSize: 13, color: '#475569', lineHeight: 19 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  campFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  campPrice: { fontSize: 16, fontWeight: '800' },
  donateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  donateBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  footerCard: {
    marginHorizontal: space.lg,
    marginTop: space.xl,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: space.sm,
  },
  footerTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phoneText: { fontSize: 15, fontWeight: '700' },
  footerBtns: { flexDirection: 'row', gap: space.sm, marginTop: 6 },
  outlineBtn: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  outlineBtnText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingHorizontal: space.xs,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  centerTabWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingVertical: 4 },
  donateFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -34,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  tabLabel: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  activeDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
});
