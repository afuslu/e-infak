import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Href, useRouter } from 'expo-router';
import {
  Calculator,
  ChevronRight,
  CreditCard,
  Droplets,
  FileCheck2,
  Heart,
  Info,
  Landmark,
  LogIn,
  LogOut,
  RefreshCw,
  Settings,
  Shield,
  UserPlus,
} from 'lucide-react-native';
import { ACTIVE_TENANT } from '@/config/tenant';
import { useAuth } from '@/context/AuthContext';
import { IddefBottomBar, IddefHeader, useBrandColors } from '@/components/IddefChrome';
import { font, radius, space } from '@/theme';

const GOLD_ACCENT = '#D9CBA0';

export default function AccountHubScreen() {
  const router = useRouter();
  const { status, mode, donorMe, signOut } = useAuth();
  const { primary, accent, site } = useBrandColors();

  const isDonor = status === 'signedIn' && mode === 'donor';

  if (isDonor) {
    const fullName =
      `${donorMe?.first_name || ''} ${donorMe?.last_name || ''}`.trim() ||
      donorMe?.company_name ||
      'DEĞERLİ BAĞIŞÇI';

    const menuItems = [
      { label: 'BAĞIŞLARIM', route: '/(donor)/bagislarim', icon: <Heart size={24} color={GOLD_ACCENT} /> },
      { label: 'ÜSTLENDİKLERİM', route: '/(donor)/ustlendiklerim', icon: <UserPlus size={24} color={GOLD_ACCENT} /> },
      { label: 'SU KUYULARIM', route: '/(donor)/su-kuyularim', icon: <Droplets size={24} color={GOLD_ACCENT} /> },
      { label: 'PROJELERİM & KURBAN', route: '/(donor)/projelerim', icon: <Landmark size={24} color={GOLD_ACCENT} /> },
      { label: 'TALİMATLARIM', route: '/(donor)/talimatlarim', icon: <RefreshCw size={24} color={GOLD_ACCENT} /> },
      { label: 'KAYITLI KARTLARIM', route: '/(donor)/kartlarim', icon: <CreditCard size={24} color={GOLD_ACCENT} /> },
      { label: 'AYARLAR', route: '/(donor)/ayarlar', icon: <Settings size={24} color={GOLD_ACCENT} /> },
    ];

    return (
      <View style={[styles.donorRoot, { backgroundColor: primary }]}>
        <IddefHeader transparent />
        <ScrollView contentContainerStyle={styles.donorScroll} showsVerticalScrollIndicator={false}>
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

        <IddefBottomBar active="account" />
      </View>
    );
  }

  return (
    <View style={styles.guestRoot}>
      <IddefHeader title="Hesabım" />

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 120, gap: space.md }}>
        <View style={[styles.loginHero, { backgroundColor: primary }]}>
          <Text style={styles.loginKicker}>
            {(ACTIVE_TENANT?.name || site?.name || '').toLocaleUpperCase('tr-TR')} BAĞIŞÇI PANELİ
          </Text>
          <Text style={styles.loginTitle}>Bağışlarınızı ve Projelerinizi Takip Edin</Text>
          <Text style={styles.loginSub}>
            Telefon numaranız veya e-postanızla giriş yaparak makbuzlarınızı, kurban kesim videolarınızı, su kuyularınızı ve düzenli bağışlarınızı görüntüleyin.
          </Text>
          <Pressable
            onPress={() => router.push('/login' as Href)}
            style={[styles.loginBtn, { backgroundColor: accent }]}
          >
            <LogIn size={18} color="#FFFFFF" />
            <Text style={styles.loginBtnText}>Bağışçı Girişi / Kayıt Ol</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>HIZLI ARAÇLAR</Text>
          <GuestRow
            icon={<Calculator size={20} color={primary} />}
            title="Zekat Hesapla"
            sub="Güncel TCMB altın ve nisap kuru ile"
            onPress={() => router.push('/(vitrin)/zekat' as Href)}
          />
          <GuestRow
            icon={<Landmark size={20} color={primary} />}
            title="IBAN / Hesap Numaraları"
            sub="Tek tıkla IBAN kopyala"
            onPress={() => router.push('/(vitrin)/iban' as Href)}
          />
          <GuestRow
            icon={<FileCheck2 size={20} color={primary} />}
            title="Makbuz Doğrula"
            sub="Makbuz numarası ile bağış sorgula"
            onPress={() => router.push('/(vitrin)/makbuz-dogrula' as Href)}
          />
          <GuestRow
            icon={<Info size={20} color={primary} />}
            title="Hakkımızda & İletişim"
            sub="Telefon, WhatsApp ve dernek bilgileri"
            onPress={() => router.push('/(vitrin)/iletisim' as Href)}
          />
        </View>

        <View style={styles.card}>
          <GuestRow
            icon={<Shield size={20} color="#475569" />}
            title="Dernek Yetkili Girişi"
            sub="Yönetici ve saha personeli paneli"
            onPress={() => router.push('/login' as Href)}
          />
        </View>
      </ScrollView>

      <IddefBottomBar active="account" />
    </View>
  );
}

function GuestRow({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.guestRow, pressed && { backgroundColor: '#F8FAFC' }]}
    >
      <View style={styles.guestIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.guestRowTitle}>{title}</Text>
        <Text style={styles.guestRowSub}>{sub}</Text>
      </View>
      <ChevronRight size={18} color="#94A3B8" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  donorRoot: { flex: 1 },
  donorScroll: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: 120,
  },
  greetingWrap: { marginBottom: space.lg },
  merhaba: {
    color: GOLD_ACCENT,
    fontSize: font.xs,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  donorName: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  menuList: { gap: 4, marginBottom: space.xl },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: space.md },
  iconBox: { width: 34, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.6 },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.lg,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    position: 'relative',
  },
  logoutIcon: { position: 'absolute', left: space.lg },
  logoutText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.8 },

  guestRoot: { flex: 1, backgroundColor: '#F6F8F7' },
  loginHero: { borderRadius: 20, padding: space.lg, gap: 8 },
  loginKicker: { color: '#E8D8A0', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  loginTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', lineHeight: 26 },
  loginSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 19 },
  loginBtn: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loginBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: space.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.7,
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    paddingBottom: 6,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.sm,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  guestIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestRowTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  guestRowSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
});
