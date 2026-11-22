import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BookOpen,
  CreditCard,
  Droplets,
  Heart,
  Home,
  Landmark,
  LayoutGrid,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  ShoppingBag,
  User,
  UserPlus,
} from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { webBase } from '@/lib/api';
import { openUrl } from '@/lib/format';
import { font, radius, space } from '@/theme';

const GREEN_BG = '#0B8A56';
const GREEN_DEEP = '#076E43';
const GREEN_BTN = '#28A971';
const GOLD_ACCENT = '#D9CBA0';

type MenuItem = {
  label: string;
  route: string;
  icon: React.ReactNode;
};

export default function DonorHomeMenu() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { donorMe, site, signOut } = useAuth();

  const fullName = `${donorMe?.first_name || ''} ${donorMe?.last_name || ''}`.trim() || donorMe?.company_name || 'DEĞERLİ BAĞIŞÇI';
  const siteBase = site?.url ? site.url.replace(/\/$/, '') : site?.slug ? `https://${site.slug}.e-infak.org` : webBase();

  const menuItems: MenuItem[] = [
    { label: 'BAĞIŞLARIM', route: '/(donor)/bagislarim', icon: <Heart size={24} color={GOLD_ACCENT} /> },
    { label: 'ÜSTLENDİKLERİM', route: '/(donor)/ustlendiklerim', icon: <UserPlus size={24} color={GOLD_ACCENT} /> },
    { label: 'SU KUYULARIM', route: '/(donor)/su-kuyularim', icon: <Droplets size={24} color={GOLD_ACCENT} /> },
    { label: 'PROJELERİM', route: '/(donor)/projelerim', icon: <Landmark size={24} color={GOLD_ACCENT} /> },
    { label: 'TALİMATLARIM', route: '/(donor)/talimatlarim', icon: <RefreshCw size={24} color={GOLD_ACCENT} /> },
    { label: 'KAYITLI KARTLARIM', route: '/(donor)/kartlarim', icon: <CreditCard size={24} color={GOLD_ACCENT} /> },
    { label: 'AYARLAR', route: '/(donor)/ayarlar', icon: <Settings size={24} color={GOLD_ACCENT} /> },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Üst Başlık: Sol Menü İkonu · Ortada Kurum Logosu / Adı · Sağda Profil Kutusu */}
      <View style={styles.header}>
        <Pressable
          onPress={() => openUrl(siteBase)}
          style={styles.menuBtn}
          accessibilityRole="button"
          accessibilityLabel="Site menüsü"
        >
          <Menu size={30} color="#FFFFFF" />
        </Pressable>

        <View style={styles.logoWrap}>
          {site?.logo_url ? (
            <Image
              source={{ uri: site.logo_url.startsWith('http') ? site.logo_url : `${siteBase}${site.logo_url}` }}
              style={styles.logoImg}
              resizeMode="contain"
            />
          ) : (
            <Text style={styles.logoText}>{site?.name || 'e-İNFAK'}</Text>
          )}
        </View>

        <Pressable
          onPress={() => router.push('/(donor)/ayarlar' as Href)}
          style={styles.profileBox}
          accessibilityRole="button"
          accessibilityLabel="Profil ayarları"
        >
          <User size={26} color={GOLD_ACCENT} />
        </Pressable>
      </View>

      {/* Gövde: MERHABA + İsim + Menü Listesi + ÇIKIŞ */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.greetingWrap}>
          <Text style={styles.merhaba}>MERHABA</Text>
          <Text style={styles.donorName}>{fullName.toLocaleUpperCase('tr-TR')}</Text>
        </View>

        <View style={styles.menuList}>
          {menuItems.map((item) => (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route as Href)}
              style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <View style={styles.iconBox}>{item.icon}</View>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => signOut()}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <LogOut size={22} color="#FFFFFF" style={styles.logoutIcon} />
          <Text style={styles.logoutText}>ÇIKIŞ</Text>
        </Pressable>
      </ScrollView>

      {/* Alt 5'li Sabit Bar: Anasayfa · Haberler · (Yuvarlak Kalp) Bağış Yap · Bağış Sepeti · Daha Fazla */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={styles.tabItem} onPress={() => router.push('/(donor)/bagislarim' as Href)}>
          <Home size={22} color={GREEN_BG} />
          <Text style={[styles.tabLabel, { color: GREEN_BG, fontWeight: '700' }]}>Anasayfa</Text>
          <View style={styles.activeDot} />
        </Pressable>

        <Pressable style={styles.tabItem} onPress={() => openUrl(`${siteBase}/haberler`)}>
          <BookOpen size={22} color="#64748B" />
          <Text style={styles.tabLabel}>Haberler</Text>
        </Pressable>

        <View style={styles.centerTabWrap}>
          <Pressable
            onPress={() => openUrl(`${siteBase}/bagis`)}
            style={({ pressed }) => [styles.donateFab, pressed && { transform: [{ scale: 0.96 }] }]}
            accessibilityRole="button"
            accessibilityLabel="Bağış Yap"
          >
            <Heart size={28} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.tabLabel}>Bağış Yap</Text>
        </View>

        <Pressable style={styles.tabItem} onPress={() => openUrl(`${siteBase}/bagis/sepetim`)}>
          <ShoppingBag size={22} color="#64748B" />
          <Text style={styles.tabLabel}>Bağış Sepeti</Text>
        </Pressable>

        <Pressable style={styles.tabItem} onPress={() => router.push('/(donor)/ayarlar' as Href)}>
          <LayoutGrid size={22} color="#64748B" />
          <Text style={styles.tabLabel}>Daha Fazla</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: GREEN_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  menuBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  logoImg: {
    height: 48,
    width: 170,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  profileBox: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: GREEN_DEEP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: 40,
  },
  greetingWrap: {
    marginBottom: space.xl,
  },
  merhaba: {
    color: GOLD_ACCENT,
    fontSize: font.xs,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  donorName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  menuList: {
    gap: 6,
    marginBottom: space.xl,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: space.md,
  },
  iconBox: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  logoutBtn: {
    backgroundColor: GREEN_BTN,
    borderRadius: radius.lg,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    position: 'relative',
  },
  logoutIcon: {
    position: 'absolute',
    left: space.lg,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  bottomBar: {
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
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  centerTabWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingVertical: 4,
  },
  donateFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: GREEN_BG,
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
  tabLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: GREEN_BG,
    marginTop: 2,
  },
});
