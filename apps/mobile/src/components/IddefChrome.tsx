import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
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
  Calculator,
  ChevronRight,
  FileCheck2,
  Heart,
  Home,
  Info,
  Landmark,
  LayoutGrid,
  LogIn,
  Menu,
  Phone,
  ShoppingBag,
  User,
  X,
} from 'lucide-react-native';
import { ACTIVE_TENANT } from '@/config/tenant';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { fetchPublicSite, resolveMediaUrl } from '@/api/public';
import { call, initials } from '@/lib/format';
import { radius, space } from '@/theme';

export type VitrinTab = 'home' | 'news' | 'donate' | 'cart' | 'account';

export function useBrandColors() {
  const siteQuery = useQuery({
    queryKey: ['public', 'site', ACTIVE_TENANT?.slug || 'default'],
    queryFn: fetchPublicSite,
    staleTime: 5 * 60_000,
  });
  const site = siteQuery.data;
  const primary = ACTIVE_TENANT?.primaryColor || site?.primary_color || '#00533C';
  const accent = ACTIVE_TENANT?.accentColor || site?.accent_color || '#C8922B';
  return { primary, accent, site, siteQuery };
}

export function IddefHeader({
  title,
  transparent,
}: {
  title?: string;
  transparent?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, mode, donorMe } = useAuth();
  const { primary, site } = useBrandColors();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isDonor = status === 'signedIn' && mode === 'donor';
  const donorInitials = isDonor
    ? initials(`${donorMe?.first_name || ''} ${donorMe?.last_name || ''}`.trim() || donorMe?.company_name)
    : null;
  const logoUri = resolveMediaUrl(site?.logo_url, site?.url);

  const navigateFromDrawer = (route: string) => {
    setDrawerOpen(false);
    router.push(route as Href);
  };

  return (
    <>
      <View
        style={[
          styles.header,
          {
            backgroundColor: transparent ? 'transparent' : primary,
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Pressable
          onPress={() => setDrawerOpen(true)}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Menüyü aç"
        >
          <Menu size={26} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={() => router.replace('/(vitrin)' as Href)}
          style={styles.brandCenter}
          accessibilityRole="button"
        >
          {title ? (
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          ) : logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logoImg} resizeMode="contain" />
          ) : (
            <Text style={styles.brandTitle}>{site?.name || ACTIVE_TENANT?.name || 'HAKDER'}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.push((isDonor ? '/(vitrin)/hesabim' : '/login') as Href)}
          style={[styles.profileBtn, { backgroundColor: 'rgba(0,0,0,0.22)' }]}
          accessibilityRole="button"
          accessibilityLabel={isDonor ? 'Hesabım' : 'Giriş Yap'}
        >
          {donorInitials ? (
            <Text style={styles.profileInitials}>{donorInitials}</Text>
          ) : (
            <User size={22} color="#E8D8A0" />
          )}
        </Pressable>
      </View>

      <Modal
        visible={drawerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <View style={[styles.drawerPanel, { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={[styles.drawerHead, { backgroundColor: primary }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerKicker}>
                  {(ACTIVE_TENANT?.fullName || site?.name || 'HAKDER').toLocaleUpperCase('tr-TR')}
                </Text>
                <Text style={styles.drawerSubtitle} numberOfLines={2}>
                  {site?.tagline || ACTIVE_TENANT?.tagline || 'Bir Kapı Aç, Bir Hayat Değiştir'}
                </Text>
              </View>
              <Pressable onPress={() => setDrawerOpen(false)} style={styles.drawerCloseBtn} accessibilityRole="button">
                <X size={22} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.drawerList}>
              <DrawerRow
                icon={<Home size={20} color={primary} />}
                label="Anasayfa"
                onPress={() => navigateFromDrawer('/(vitrin)')}
              />
              <DrawerRow
                icon={<Heart size={20} color={primary} />}
                label="Hızlı Bağış Yap"
                onPress={() => navigateFromDrawer('/(vitrin)/bagis-yap')}
              />
              <DrawerRow
                icon={<ShoppingBag size={20} color={primary} />}
                label="Bağış Sepetim"
                onPress={() => navigateFromDrawer('/(vitrin)/sepet')}
              />
              <DrawerRow
                icon={<Calculator size={20} color={primary} />}
                label="Zekat Hesapla"
                onPress={() => navigateFromDrawer('/(vitrin)/zekat')}
              />
              <DrawerRow
                icon={<Landmark size={20} color={primary} />}
                label="IBAN / Hesap Numaraları"
                onPress={() => navigateFromDrawer('/(vitrin)/iban')}
              />
              <DrawerRow
                icon={<BookOpen size={20} color={primary} />}
                label="Haberler & Faaliyetler"
                onPress={() => navigateFromDrawer('/(vitrin)/haberler')}
              />
              <DrawerRow
                icon={<FileCheck2 size={20} color={primary} />}
                label="Makbuz Doğrula"
                onPress={() => navigateFromDrawer('/(vitrin)/makbuz-dogrula')}
              />
              <DrawerRow
                icon={<Info size={20} color={primary} />}
                label="Hakkımızda & İletişim"
                onPress={() => navigateFromDrawer('/(vitrin)/iletisim')}
              />

              <View style={styles.drawerDivider} />

              <DrawerRow
                icon={isDonor ? <User size={20} color={primary} /> : <LogIn size={20} color={primary} />}
                label={isDonor ? 'Hesabım (Bağışlarım)' : 'Bağışçı / Yetkili Girişi'}
                onPress={() => navigateFromDrawer(isDonor ? '/(vitrin)/hesabim' : '/login')}
              />

              {site?.contact?.phone ? (
                <Pressable
                  onPress={() => {
                    setDrawerOpen(false);
                    call(site.contact!.phone!);
                  }}
                  style={[styles.drawerCallCard, { borderColor: `${primary}33`, backgroundColor: `${primary}0D` }]}
                >
                  <Phone size={18} color={primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drawerCallLabel}>Bağışçı Destek Hattı</Text>
                    <Text style={[styles.drawerCallValue, { color: primary }]}>{site.contact.phone}</Text>
                  </View>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
          <Pressable style={{ flex: 1 }} onPress={() => setDrawerOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

function DrawerRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.drawerRow, pressed && { backgroundColor: '#F1F5F9' }]}
      accessibilityRole="button"
    >
      <View style={styles.drawerRowIcon}>{icon}</View>
      <Text style={styles.drawerRowText}>{label}</Text>
      <ChevronRight size={17} color="#94A3B8" />
    </Pressable>
  );
}

export function IddefBottomBar({ active }: { active: VitrinTab }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { primary } = useBrandColors();
  const { totalCount } = useCart();

  const go = (tab: VitrinTab, route: string) => {
    if (tab === active) return;
    router.replace(route as Href);
  };

  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <Pressable style={styles.tabItem} onPress={() => go('home', '/(vitrin)')}>
        <Home size={22} color={active === 'home' ? primary : '#64748B'} />
        <Text style={[styles.tabLabel, active === 'home' && { color: primary, fontWeight: '700' }]}>
          Anasayfa
        </Text>
        {active === 'home' ? <View style={[styles.activeDot, { backgroundColor: primary }]} /> : null}
      </Pressable>

      <Pressable style={styles.tabItem} onPress={() => go('news', '/(vitrin)/haberler')}>
        <BookOpen size={22} color={active === 'news' ? primary : '#64748B'} />
        <Text style={[styles.tabLabel, active === 'news' && { color: primary, fontWeight: '700' }]}>
          Haberler
        </Text>
        {active === 'news' ? <View style={[styles.activeDot, { backgroundColor: primary }]} /> : null}
      </Pressable>

      <View style={styles.centerTabWrap}>
        <Pressable
          onPress={() => go('donate', '/(vitrin)/bagis-yap')}
          style={({ pressed }) => [
            styles.donateFab,
            { backgroundColor: primary },
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Bağış Yap"
        >
          <Heart size={28} color="#FFFFFF" />
        </Pressable>
        <Text style={[styles.tabLabel, active === 'donate' && { color: primary, fontWeight: '700' }]}>
          Bağış Yap
        </Text>
      </View>

      <Pressable style={styles.tabItem} onPress={() => go('cart', '/(vitrin)/sepet')}>
        <View style={styles.bagIconWrap}>
          <ShoppingBag size={22} color={active === 'cart' ? primary : '#64748B'} />
          {totalCount > 0 ? (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{totalCount > 99 ? '99+' : totalCount}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tabLabel, active === 'cart' && { color: primary, fontWeight: '700' }]}>
          Bağış Sepeti
        </Text>
        {active === 'cart' ? <View style={[styles.activeDot, { backgroundColor: primary }]} /> : null}
      </Pressable>

      <Pressable style={styles.tabItem} onPress={() => go('account', '/(vitrin)/hesabim')}>
        <LayoutGrid size={22} color={active === 'account' ? primary : '#64748B'} />
        <Text style={[styles.tabLabel, active === 'account' && { color: primary, fontWeight: '700' }]}>
          Hesabım
        </Text>
        {active === 'account' ? <View style={[styles.activeDot, { backgroundColor: primary }]} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: 12,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  brandCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  logoImg: { height: 40, width: 148, backgroundColor: '#FFFFFF', borderRadius: 10 },
  brandTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', letterSpacing: 1 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  profileBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  profileInitials: { color: '#E8D8A0', fontSize: 15, fontWeight: '800' },

  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  drawerPanel: {
    width: '82%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 16,
  },
  drawerHead: {
    marginHorizontal: space.md,
    borderRadius: 16,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginBottom: space.sm,
  },
  drawerKicker: { color: '#E8D8A0', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  drawerSubtitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 4, lineHeight: 19 },
  drawerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerList: { paddingHorizontal: space.sm, paddingBottom: space.xl, gap: 2 },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 13,
    borderRadius: radius.md,
    gap: space.md,
  },
  drawerRowIcon: { width: 24, alignItems: 'center' },
  drawerRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  drawerDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: space.sm, marginHorizontal: space.md },
  drawerCallCard: {
    marginTop: space.md,
    marginHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  drawerCallLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  drawerCallValue: { fontSize: 15, fontWeight: '800', marginTop: 2 },

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
  bagIconWrap: { position: 'relative' },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  cartBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});
