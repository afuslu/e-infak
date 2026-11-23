import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Calculator,
  ChevronRight,
  Heart,
  Landmark,
  Phone,
  Plus,
  ShoppingBag,
} from 'lucide-react-native';
import { ACTIVE_TENANT } from '@/config/tenant';
import {
  CATEGORY_LABELS,
  fetchBanners,
  fetchCampaigns,
  fetchDonationCategories,
  PublicCampaign,
  resolveMediaUrl,
} from '@/api/public';
import { IddefBottomBar, IddefHeader, useBrandColors } from '@/components/IddefChrome';
import { useCart } from '@/context/CartContext';
import { notify } from '@/components/toast';
import { call, money } from '@/lib/format';
import { radius, space } from '@/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const BANNER_W = SCREEN_W - space.lg * 2;

export default function VitrinHomeScreen() {
  const router = useRouter();
  const { addItem } = useCart();
  const { primary, accent, site, siteQuery } = useBrandColors();
  const [selectedCat, setSelectedCat] = useState<string>('all');

  const bannersQuery = useQuery({
    queryKey: ['public', 'banners'],
    queryFn: fetchBanners,
  });

  const categoriesQuery = useQuery({
    queryKey: ['public', 'donation-categories'],
    queryFn: fetchDonationCategories,
  });

  const campaignsQuery = useQuery({
    queryKey: ['public', 'campaigns', 'active'],
    queryFn: () => fetchCampaigns({ page_size: 100 }),
  });

  const campaigns = campaignsQuery.data ?? [];
  const banners = bannersQuery.data ?? [];
  const quickCats = categoriesQuery.data ?? [];

  const categoryKeys = useMemo(() => {
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

  const quickAdd = (c: PublicCampaign) => {
    const defaultCents =
      c.suggested_amounts_cents?.[0] ||
      c.reference_amounts?.TRY ||
      c.min_donation_cents ||
      10000;
    addItem({
      campaign_id: c.id,
      campaign_slug: c.slug,
      campaign_title: c.title,
      cover_image_url: c.cover_image_url,
      unit_amount_cents: defaultCents,
      quantity: 1,
    });
    notify(`${c.title} bağış sepetine eklendi.`);
  };

  const openCampaign = (slug: string) => {
    router.push(`/(vitrin)/kampanya/${encodeURIComponent(slug)}` as Href);
  };

  const handleBannerPress = (url?: string | null) => {
    const raw = (url || '').trim();
    const campMatch = /\/kampanyalar\/([^/?#]+)/i.exec(raw);
    if (campMatch?.[1]) {
      openCampaign(campMatch[1]);
      return;
    }
    const newsMatch = /\/haberler\/([^/?#]+)/i.exec(raw);
    if (newsMatch?.[1]) {
      router.push(`/(vitrin)/haber/${encodeURIComponent(newsMatch[1])}` as Href);
      return;
    }
    if (/zekat/i.test(raw)) {
      router.push('/(vitrin)/zekat' as Href);
      return;
    }
    if (/hesap-numaralari|iban/i.test(raw)) {
      router.push('/(vitrin)/iban' as Href);
      return;
    }
    router.push('/(vitrin)/bagis-yap' as Href);
  };

  const refreshing =
    siteQuery.isRefetching ||
    bannersQuery.isRefetching ||
    categoriesQuery.isRefetching ||
    campaignsQuery.isRefetching;

  const onRefresh = () => {
    siteQuery.refetch();
    bannersQuery.refetch();
    categoriesQuery.refetch();
    campaignsQuery.refetch();
  };

  return (
    <View style={styles.root}>
      <IddefHeader />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 118 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
      >
        {/* Üst Karşılama / Hero */}
        <View style={[styles.hero, { backgroundColor: primary }]}>
          <Text style={styles.heroKicker}>
            {(ACTIVE_TENANT?.fullName || site?.name || 'HAKDER').toLocaleUpperCase('tr-TR')}
          </Text>
          <Text style={styles.heroTitle}>
            {site?.hero?.title || site?.tagline || ACTIVE_TENANT?.tagline || 'Bir Kapı Aç, Bir Hayat Değiştir'}
          </Text>
          <Text style={styles.heroSub}>
            {site?.hero?.subtitle ||
              'Kurban, su kuyusu, Gazze, eğitim ve acil yardım bağışlarınızı güvenle uygulama içinden ulaştırabilirsiniz.'}
          </Text>
          <View style={styles.heroActions}>
            <Pressable
              onPress={() => router.push('/(vitrin)/bagis-yap' as Href)}
              style={[styles.heroPrimaryBtn, { backgroundColor: accent }]}
              accessibilityRole="button"
            >
              <Heart size={18} color="#FFFFFF" />
              <Text style={styles.heroPrimaryText}>Hızlı Bağış Yap</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(vitrin)/zekat' as Href)}
              style={styles.heroSecondaryBtn}
              accessibilityRole="button"
            >
              <Calculator size={17} color="#FFFFFF" />
              <Text style={styles.heroSecondaryText}>Zekat Hesapla</Text>
            </Pressable>
          </View>
        </View>

        {/* Aktif Banner Slider */}
        {banners.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bannerList}
            decelerationRate="fast"
            snapToInterval={BANNER_W + space.sm}
          >
            {banners.map((b) => {
              const img = resolveMediaUrl(b.mobile_image_url || b.image_url, site?.url);
              return (
                <Pressable
                  key={b.id}
                  onPress={() => handleBannerPress(b.cta_url || b.link_url)}
                  style={[styles.bannerCard, { width: BANNER_W }]}
                >
                  {img ? (
                    <Image source={{ uri: img }} style={styles.bannerImg} resizeMode="cover" />
                  ) : (
                    <View style={[styles.bannerImg, { backgroundColor: primary }]} />
                  )}
                  {(b.title || b.subtitle) ? (
                    <View style={styles.bannerOverlay}>
                      {b.title ? (
                        <Text style={styles.bannerTitle} numberOfLines={2}>
                          {b.title}
                        </Text>
                      ) : null}
                      {b.subtitle ? (
                        <Text style={styles.bannerSub} numberOfLines={2}>
                          {b.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Hızlı Bağış Kategorileri Grid */}
        {quickCats.length > 0 ? (
          <View style={styles.quickSection}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: space.lg }]}>HIZLI BAĞIŞ KATEGORİLERİ</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRow}
            >
              {quickCats.map((cat) => {
                const img = resolveMediaUrl(cat.image_url, site?.url);
                const linkedCamp = cat.campaign_id
                  ? campaigns.find((c) => c.id === cat.campaign_id)
                  : undefined;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => {
                      if (linkedCamp) {
                        openCampaign(linkedCamp.slug);
                      } else {
                        router.push('/(vitrin)/bagis-yap' as Href);
                      }
                    }}
                    style={styles.quickCard}
                  >
                    {img ? (
                      <Image source={{ uri: img }} style={styles.quickImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.quickIconBox, { backgroundColor: `${primary}14` }]}>
                        <Heart size={20} color={primary} />
                      </View>
                    )}
                    <Text style={styles.quickTitle} numberOfLines={2}>
                      {cat.title}
                    </Text>
                    {cat.suggested_amounts_cents?.[0] ? (
                      <Text style={[styles.quickPrice, { color: primary }]}>
                        {money(cat.suggested_amounts_cents[0])}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Kategori Filtre Çipleri */}
        {categoryKeys.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catRow}
          >
            {categoryKeys.map((cat) => {
              const active = selectedCat === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCat(cat)}
                  style={[
                    styles.catChip,
                    active
                      ? { backgroundColor: primary, borderColor: primary }
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
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>BAĞIŞ KAMPANYALARI</Text>
            <Text style={styles.sectionCount}>{filtered.length} kampanya</Text>
          </View>

          {campaignsQuery.isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={primary} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Bu kategoride aktif kampanya bulunamadı.</Text>
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              {filtered.map((c) => {
                const img = resolveMediaUrl(c.cover_image_url, site?.url);
                const firstAmount = c.suggested_amounts_cents?.[0] || c.reference_amounts?.TRY;
                const pct =
                  c.show_collected !== false && c.target_cents && c.target_cents > 0
                    ? Math.min(100, Math.round(((c.collected_cents || 0) * 100) / c.target_cents))
                    : null;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => openCampaign(c.slug)}
                    style={styles.campCard}
                  >
                    {img ? (
                      <Image source={{ uri: img }} style={styles.campImg} resizeMode="cover" />
                    ) : null}
                    <View style={styles.campBody}>
                      <View style={styles.campTopRow}>
                        {c.category ? (
                          <View style={[styles.catBadge, { backgroundColor: `${primary}14` }]}>
                            <Text style={[styles.catBadgeText, { color: primary }]}>
                              {CATEGORY_LABELS[c.category.toLowerCase()] || c.category}
                            </Text>
                          </View>
                        ) : null}
                        {c.country ? <Text style={styles.countryText}>{c.country}</Text> : null}
                      </View>
                      <Text style={styles.campTitle}>{c.title}</Text>
                      {c.summary ? (
                        <Text style={styles.campSummary} numberOfLines={2}>
                          {c.summary}
                        </Text>
                      ) : null}
                      {pct !== null ? (
                        <View style={styles.progressWrap}>
                          <View style={styles.progressTrack}>
                            <View
                              style={[styles.progressFill, { width: `${pct}%`, backgroundColor: primary }]}
                            />
                          </View>
                          <Text style={styles.progressText}>%{pct}</Text>
                        </View>
                      ) : null}
                      <View style={styles.campFoot}>
                        <View>
                          <Text style={styles.priceHint}>Önerilen Tutar</Text>
                          <Text style={[styles.campPrice, { color: primary }]}>
                            {firstAmount ? money(firstAmount, c.currency || 'TRY') : 'Serbest Tutar'}
                          </Text>
                        </View>
                        <View style={styles.campBtns}>
                          <Pressable
                            onPress={() => quickAdd(c)}
                            style={[styles.cartMiniBtn, { borderColor: primary }]}
                            accessibilityRole="button"
                            accessibilityLabel="Sepete Ekle"
                          >
                            <Plus size={16} color={primary} />
                            <ShoppingBag size={15} color={primary} />
                          </Pressable>
                          <Pressable
                            onPress={() => openCampaign(c.slug)}
                            style={[styles.donateBtn, { backgroundColor: primary }]}
                            accessibilityRole="button"
                          >
                            <Heart size={15} color="#FFFFFF" />
                            <Text style={styles.donateBtnText}>Bağış Yap</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Zekat & IBAN Kısayol Kartları */}
        <View style={styles.toolsRow}>
          <Pressable
            onPress={() => router.push('/(vitrin)/zekat' as Href)}
            style={[styles.toolCard, { borderColor: `${accent}55`, backgroundColor: '#FFFDF7' }]}
          >
            <View style={[styles.toolIcon, { backgroundColor: `${accent}20` }]}>
              <Calculator size={20} color={accent} />
            </View>
            <Text style={styles.toolTitle}>Zekat Hesapla</Text>
            <Text style={styles.toolSub}>Güncel TCMB altın & nisap</Text>
            <ChevronRight size={16} color={accent} style={{ alignSelf: 'flex-end' }} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/(vitrin)/iban' as Href)}
            style={[styles.toolCard, { borderColor: `${primary}33`, backgroundColor: '#F4FBF8' }]}
          >
            <View style={[styles.toolIcon, { backgroundColor: `${primary}18` }]}>
              <Landmark size={20} color={primary} />
            </View>
            <Text style={styles.toolTitle}>IBAN Bilgileri</Text>
            <Text style={styles.toolSub}>Tek tıkla kopyala</Text>
            <ChevronRight size={16} color={primary} style={{ alignSelf: 'flex-end' }} />
          </Pressable>
        </View>

        {/* İletişim Bandı */}
        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>{ACTIVE_TENANT?.fullName || site?.name || 'HAKDER'}</Text>
          {site?.contact?.phone ? (
            <Pressable onPress={() => call(site.contact!.phone!)} style={styles.phoneRow}>
              <Phone size={16} color={primary} />
              <Text style={[styles.phoneText, { color: primary }]}>{site.contact.phone}</Text>
            </Pressable>
          ) : null}
          <View style={styles.footerBtns}>
            <Pressable
              onPress={() => router.push('/(vitrin)/makbuz-dogrula' as Href)}
              style={[styles.outlineBtn, { borderColor: primary }]}
            >
              <Text style={[styles.outlineBtnText, { color: primary }]}>Makbuz Doğrula</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(vitrin)/iletisim' as Href)}
              style={[styles.outlineBtn, { borderColor: '#CBD5E1' }]}
            >
              <Text style={[styles.outlineBtnText, { color: '#334155' }]}>Hakkımızda & İletişim</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <IddefBottomBar active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F7' },
  hero: {
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.xl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: 8,
  },
  heroKicker: { color: '#E8D8A0', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', lineHeight: 29 },
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

  bannerList: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  bannerCard: { height: 158, borderRadius: 18, overflow: 'hidden', backgroundColor: '#E2E8F0' },
  bannerImg: { width: '100%', height: '100%' },
  bannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.md,
    backgroundColor: 'rgba(15, 23, 42, 0.56)',
  },
  bannerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  bannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },

  quickSection: { paddingTop: space.md },
  quickRow: { paddingHorizontal: space.lg, gap: space.sm, paddingTop: 6 },
  quickCard: {
    width: 118,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: space.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    gap: 6,
  },
  quickImg: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#E2E8F0' },
  quickIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { fontSize: 12, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  quickPrice: { fontSize: 12, fontWeight: '800' },

  catRow: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  catText: { fontSize: 13, fontWeight: '700' },

  sectionWrap: { paddingHorizontal: space.lg, gap: space.sm },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionCount: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: space.xl, alignItems: 'center' },
  emptyText: { color: '#64748B', fontSize: 14 },

  campCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  campImg: { width: '100%', height: 175, backgroundColor: '#E2E8F0' },
  campBody: { padding: space.md, gap: 8 },
  campTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  catBadgeText: { fontSize: 11, fontWeight: '800' },
  countryText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  campTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  campSummary: { fontSize: 13, color: '#475569', lineHeight: 19 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  campFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  priceHint: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  campPrice: { fontSize: 16, fontWeight: '800' },
  campBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  donateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
  },
  donateBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  toolsRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginTop: space.lg,
  },
  toolCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: space.md,
    gap: 6,
  },
  toolIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  toolSub: { fontSize: 12, color: '#64748B' },

  footerCard: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
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
});
